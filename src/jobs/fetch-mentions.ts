import dotenv from "dotenv";
import { db } from "../lib/db";
import logger from "@/lib/logger";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus } from "@prisma/client";

dotenv.config();

const BUFFER_MS = 5 * 60 * 1000;
const now = new Date();

const yesterdayMidnight = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
);
const end_time_with_buffer = new Date(
  yesterdayMidnight.getTime() - BUFFER_MS
).toISOString();

/**
 * Fetches mentions for all active Twitter accounts.
 */
export const fetchMentions = async () => {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { status: TweetAccountStatus.ACTIVE },
    });

    if (twitterAccounts.length === 0) {
      logger.info("No active Twitter accounts found.");
      return;
    }

    await Promise.all(
      twitterAccounts.map(async (account) => {
        try {
          logger.info(`Fetching mentions for account: ${account.username}`);
          const client = new TwitterApi(account.accessToken);
          const roClient = client.readOnly;
          let nextToken: string | undefined;

          do {
            const {
              data: mentions,
              meta,
              includes,
            } = await roClient.v2.userMentionTimeline(account.twitterUserId, {
              end_time: end_time_with_buffer,
              pagination_token: nextToken,
              expansions: [
                "author_id",
                "entities.mentions.username",
                "referenced_tweets.id",
                "in_reply_to_user_id",
              ],
              "user.fields": ["username", "name", "profile_image_url"],
            });

            console.log(JSON.stringify(mentions, null, 2));
            const userMap = (includes?.users || []).reduce(
              (acc, user) => ({
                ...acc,
                [user.id]: user,
              }),
              {} as Record<string, any>
            );

            const mentionsToUpsert = mentions.data.map((mention) => {
              const user = userMap[mention.author_id] || {};
              return {
                where: { mentionId: mention.id },
                update: {},
                create: {
                  mentionId: mention.id,
                  tweetId: mention.id,
                  mentionText: mention.text,
                  twitterAccountId: account.id,
                  authorId: user.id,
                  authorUsername: user.username,
                  authorName: user.name,
                  authorProfileImageUrl: user.profile_image_url,
                  timestamp: mention.created_at,
                },
              };
            });

            await db.$transaction(
              mentionsToUpsert.map((mention) => db.mention.upsert(mention))
            );

            logger.info(
              `Processed ${mentions.data.length} mentions for account: ${account.username}`
            );

            nextToken = meta?.next_token;
          } while (nextToken);

          logger.info(
            `Finished processing mentions for account: ${account.username}`
          );
        } catch (accountError) {
          logger.error(
            `Error processing mentions for account ${account.username}:`,
            accountError
          );
        }
      })
    );
  } catch (error) {
    logger.error("Error fetching mentions:", error);
  }
};
