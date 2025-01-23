import dotenv from "dotenv";
import { db } from "../lib/db";
import logger from "@/lib/logger";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus } from "@prisma/client";

dotenv.config();

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

    for (const account of twitterAccounts) {
      if (!account.twitterUserId) {
        logger.warn(`No Twitter user ID for account ID: ${account.id}`);
        continue;
      }

      logger.info(`Fetching mentions for account: ${account.username}`);
      const client = new TwitterApi(account.accessToken);
      const roClient = client.readOnly;
      let nextToken: string | undefined;

      do {
        try {
          const {
            data: mentions,
            meta,
            includes,
          } = await roClient.v2.userMentionTimeline(account.twitterUserId, {
            pagination_token: nextToken,
            expansions: ["author_id"],
            "user.fields": ["username", "name", "profile_image_url"],
          });

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

          // Perform batch upserts
          for (const mention of mentionsToUpsert) {
            await db.mention.upsert(mention);
          }

          logger.info(
            `Processed ${mentions.data.length} mentions for account: ${account.username}`
          );

          nextToken = meta?.next_token;
        } catch (pageError) {
          logger.error(
            `Error fetching mentions for account ${account.username}:`,
            pageError
          );
          break;
        }
      } while (nextToken);

      logger.info(
        `Finished processing mentions for account: ${account.username}`
      );
    }
  } catch (error) {
    logger.error("Error fetching mentions:", error);
  }
};
