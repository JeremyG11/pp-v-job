import dotenv from "dotenv";
import cron from "node-cron";
import { TwitterApi } from "twitter-api-v2";
import { ensureValidAccessToken } from "../lib/ensure-valid-token";
import { db } from "../lib/db";
import { TweetAccountStatus } from "@prisma/client";

dotenv.config();

/**
 * Fetches mentions for all active Twitter accounts
 * @returns
 */
export const fetchMentions = async () => {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { status: TweetAccountStatus.ACTIVE },
    });

    if (!twitterAccounts.length) {
      console.log("No active Twitter accounts found.");
      return;
    }

    for (const account of twitterAccounts) {
      const accessToken = await ensureValidAccessToken(account.id);
      const client = new TwitterApi(accessToken);
      const roClient = client.readOnly;

      let nextToken: string | undefined = undefined;

      if (!account || !account.twitterUserId) {
        console.log(`No Twitter user ID found for account ID: ${account.id}`);
        continue;
      }

      do {
        const { data: mentions, meta } = await roClient.v2.userMentionTimeline(
          account.twitterUserId,
          {
            pagination_token: nextToken,
            expansions: ["author_id"],
            "user.fields": ["username", "name", "profile_image_url"],
          }
        );

        const users = mentions.includes?.users || [];
        const userMap = users.reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {} as Record<string, any>);

        for (const mention of mentions.data) {
          const user = userMap[mention.author_id];

          if (!user) {
            console.warn(`No user found for mention ID: ${mention.id}`);
            continue;
          }

          await db.mention.upsert({
            where: { mentionId: mention.id },
            update: {},
            create: {
              mentionId: mention.id,
              tweetId: mention.id,
              mentionText: mention.text,
              twitterAccount: { connect: { id: account.id } },
              authorId: user.id,
              authorUsername: user.username,
              authorName: user.name,
              authorProfileImageUrl: user.profile_image_url,
            },
          });
          console.log(`Stored mention with ID: ${mention.id}`);
        }

        nextToken = meta?.next_token;
      } while (nextToken);
    }
  } catch (error) {
    console.error("Error fetching mentions:", error);
  }
};

// Set up a CRON job to poll Twitter every minute
cron.schedule("* * * * *", () => {
  console.log("Checking for mentions...");
  fetchMentions();
});
