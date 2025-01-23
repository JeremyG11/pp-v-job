import { db } from "../lib/db";
import logger from "@/lib/logger";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus } from "@prisma/client";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

export const fetchDMs = async () => {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { status: TweetAccountStatus.ACTIVE },
    });

    if (!twitterAccounts.length) {
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

      let nextToken: string | undefined = undefined;

      try {
        do {
          const response = await roClient.v2.listDmEvents({
            pagination_token: nextToken,
          });

          logger.info(JSON.stringify(response));

          const dms = response.data.data || [];
          if (dms.length === 0 && !nextToken) {
            logger.info(`No DMs found for account ID: ${twitterAccountId}`);
            break;
          }

          const dmsToUpsert = dms.map((dm) => {
            const createdAt = new Date(dm.created_at);
            if (isNaN(createdAt.getTime())) {
              logger.error(`Invalid date for DM ID: ${dm.id}`);
              return null;
            }

            return {
              where: { messageId: dm.id },
              update: {
                senderId: dm.sender_id,
              },
              create: {
                twitterAccountId: twitterAccountId,
                messageId: dm.id,
                senderId: dm.participant_ids?.[0] || null,
                recipientId: dm.participant_ids?.[1] || null,
                text: "text" in dm ? dm.text : "",
                createdAt,
              },
            };
          });

          const validDmsToUpsert = dmsToUpsert.filter(Boolean);

          // Perform batch upserts
          for (const dm of validDmsToUpsert) {
            await db.directMessage.upsert(dm);
          }

          logger.info(
            `Processed ${validDmsToUpsert.length} DMs for account ID: ${twitterAccountId}`
          );

          nextToken = response.meta?.next_token;
        } while (nextToken);

        logger.info(
          `Finished processing DMs for account ID: ${twitterAccountId}`
        );
      } catch (error) {
        handleTwitterApiError(
          error,
          `Fetching DMs for account ID: ${twitterAccountId}`
        );
      }
    }
  } catch (error) {
    handleTwitterApiError(error, "Fetching DMs globally");
  }
};

/**
 * Handles errors from Twitter API and logs them.
 * @param error Error object
 * @param context Context of the error
 */
const handleTwitterApiError = (error: any, context: string) => {
  const errorCode = error?.code;

  switch (errorCode) {
    case 403:
      logger.error(
        `${context}: Access forbidden. Ensure the access token has the required permissions.`
      );
      break;
    case 400:
      logger.error(
        `${context}: Invalid request. Check the parameters and try again.`
      );
      break;
    case 429:
      logger.error(`${context}: Rate limit reached. Please try again later.`);
      break;
    case 503:
      logger.error(`${context}: Service unavailable. Please try again later.`);
      break;
    default:
      logger.error(`${context}: An unexpected error occurred.`, error);
      break;
  }
};
