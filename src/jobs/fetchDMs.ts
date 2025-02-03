import { db } from "../lib/db";
import logger from "@/lib/logger";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus, TwitterAccount } from "@prisma/client";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

/**
 * Utility function to introduce delay
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Utility function to handle rate limits
 */
const fetchWithRetry = async <T>(
  apiCall: () => Promise<T>,
  retries = 3,
  delayMs = 60 * 1000
): Promise<T> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await apiCall();
    } catch (error: any) {
      if (error.code === 429 && attempt < retries - 1) {
        const resetTime =
          error.headers?.["x-rate-limit-reset"] ||
          Math.ceil(Date.now() / 1000) + 60;
        const waitTime = Math.max(resetTime * 1000 - Date.now(), delayMs);
        logger.warn(
          `Rate limit hit. Retrying in ${waitTime / 1000} seconds...`
        );
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Exceeded retry attempts due to rate limits.");
};

/**
 * Fetch Direct Messages for all active Twitter accounts
 */
export const fetchDMs = async (): Promise<void> => {
  try {
    const twitterAccounts: TwitterAccount[] = await db.twitterAccount.findMany({
      where: { status: TweetAccountStatus.ACTIVE },
    });

    if (twitterAccounts.length === 0) {
      logger.info("No active Twitter accounts found.");
      return;
    }

    for (const account of twitterAccounts) {
      const { id: twitterAccountId, twitterUserId: userId } = account;

      if (!userId) {
        logger.warn(
          `No Twitter user ID found for account ID: ${twitterAccountId}`
        );
        continue;
      }

      const accessToken = await ensureValidAccessToken(account.id);
      const twitterClient = new TwitterApi(accessToken);
      const roClient = twitterClient.readOnly;

      let nextToken: string | undefined;
      let response;

      try {
        do {
          response = await fetchWithRetry(() => roClient.v2.listDmEvents());
          logger.info(
            `Fetched ${response.data?.data.length || 0} DMs for account: ${
              account.username
            }`
          );

          const dms = response.data.data || [];
          if (dms.length === 0 && !nextToken) {
            logger.info(`No DMs found for account ID: ${twitterAccountId}`);
            break;
          }

          const dmsToUpsert = dms.filter(
            (dm) => dm.event_type === "MessageCreate"
          );

          const senderIds: string[] = [
            ...new Set(
              dmsToUpsert
                .map((dm) => dm.participant_ids?.[0])
                .filter(Boolean) as string[]
            ),
          ];

          let userMap: Record<string, any> = {};

          if (senderIds.length > 0) {
            try {
              const userResponse = await fetchWithRetry(() =>
                roClient.v2.users(senderIds, {
                  "user.fields": ["name", "username", "profile_image_url"],
                })
              );

              if (userResponse.data) {
                userMap = Object.fromEntries(
                  userResponse.data.map((user) => [user.id, user])
                );
              }
            } catch (error) {
              logger.warn("Failed to fetch sender details in batch:", error);
            }
          }

          const dmUpserts = dmsToUpsert.map((dm) => {
            const createdAt = dm.created_at
              ? new Date(dm.created_at)
              : new Date();
            if (isNaN(createdAt.getTime())) {
              logger.error(
                `Invalid date for DM ID: ${dm.id}. Using current time instead.`
              );
            }

            const senderId = dm.participant_ids?.[0] || "";
            const userInfo = userMap[senderId] || {
              id: senderId,
              name: "Unknown",
              username: "unknown_user",
              profile_image_url: "",
            };

            return {
              where: { messageId: dm.id },
              update: { senderId },
              create: {
                twitterAccount: { connect: { id: twitterAccountId } },
                messageId: dm.id,
                senderId,
                recipientId: dm.participant_ids?.[1] || "",
                text: dm.text || "",
                createdAt,
                authorId: senderId,
                authorName: userInfo.name,
                authorUsername: userInfo.username,
                authorProfileImageUrl: userInfo.profile_image_url || "",
              },
            };
          });

          // 🔹 Step 4: Batch upsert DMs to database
          for (const dm of dmUpserts) {
            await db.directMessage.upsert(dm);
          }

          logger.info(
            `Processed ${dmUpserts.length} DMs for account ID: ${account.id}`
          );

          await delay(5000);
        } while ((nextToken = response.meta?.next_token));
      } catch (error) {
        logger.error(
          `Failed to fetch DMs for account: ${account.username}`,
          error
        );
      }
    }
  } catch (error) {
    logger.error("Failed to fetch DMs:", error);
  }
};
