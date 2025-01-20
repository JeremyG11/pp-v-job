import { db } from "../lib/db";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus } from "@prisma/client";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

export const fetchDMs = async () => {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { status: TweetAccountStatus.ACTIVE },
    });

    if (!twitterAccounts.length) {
      console.log("No active Twitter accounts found.");
      return;
    }

    for (const account of twitterAccounts) {
      const twitterAccountId = account.id;
      const userId = account.twitterUserId;

      if (!userId) {
        console.log(
          `No Twitter user ID found for account ID: ${twitterAccountId}`
        );
        continue;
      }

      // Ensure access token is valid
      const accessToken = await ensureValidAccessToken(account.id);
      if (!accessToken) {
        console.log(`Invalid access token for account ID: ${account.id}`);
        continue;
      }

      const twitterClient = new TwitterApi(accessToken);
      const roClient = twitterClient.readOnly;

      try {
        // Fetch DMs
        const { data: dms } = await roClient.v2.listDmEvents();

        if (dms.data.length === 0) {
          console.log(`No DMs found for account ${twitterAccountId}`);
          continue;
        }

        console.log(JSON.stringify(dms, null, 2));
        // Store DMs in the database
        for (const dm of dms.data) {
          const createdAt = new Date(dm.created_at);
          if (isNaN(createdAt.getTime())) {
            console.error(`Invalid date for DM ID: ${dm.id}`);
            continue;
          }

          await prisma.directMessage.upsert({
            where: { messageId: dm.id },
            update: {
              senderId: dm.sender_id,
            },
            create: {
              twitterAccountId,
              messageId: dm.id,
              senderId: dm.participant_ids[0], // Assuming the first participant is the sender
              recipientId: dm.participant_ids[1], // Assuming the second participant is the recipient
              text: dm.text,
              createdAt: createdAt,
            },
          });
        }

        console.log(
          `DMs fetched and stored successfully for account ${twitterAccountId}`
        );
      } catch (error) {
        if (error.code === 403) {
          console.error(
            "Access forbidden. Ensure the access token has the required permissions."
          );
        } else if (error.code === 400) {
          console.error("Invalid request. Check the parameters and try again.");
        } else {
          console.error("Failed to fetch DMs:", error);
        }
      }
    }
  } catch (error) {
    if (error.code === 429) {
      console.error("Rate limit reached. Please try again later.");
    } else if (error.code === 503) {
      console.error("Service unavailable. Please try again later.");
    } else {
      console.error("Failed to fetch DMs:", error);
    }
  }
};
