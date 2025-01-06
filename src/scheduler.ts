import cron from "node-cron";
import { db } from "./lib/db";
import { getUserTimezone } from "./lib/util";
import { TweetAccountStatus } from "@prisma/client";
import { fetchMentions } from "./jobs/fetch-mentions";
import { fetchTweetsForAccounts } from "./jobs/fetch-tweet";
import { ensureValidAccessToken } from "./lib/ensure-valid-token";
import { generateResponsesForTopTweets } from "./jobs/generate-tweet-content";

/**
 * Schedule all the jobs.
 */
export const scheduleJobs = async () => {
  console.log("Scheduling jobs...");

  // Fetch all users
  const users = await db.user.findMany();

  for (const user of users) {
    const userTimezone = await getUserTimezone(user.id);
    console.log(
      `Scheduling jobs for user ${user.id} in timezone: ${userTimezone}`
    );

    /**
     * Fetch mentions daily at midnight.
     * This job fetches mentions for all active Twitter accounts.
     * @see {@link fetchMentions}
     */
    cron.schedule(
      "0 0 * * *",
      async () => {
        console.log(`Fetching mentions for user ${user.id}...`);
        try {
          await fetchMentions();
          console.log(`Completed fetching mentions for user ${user.id}.`);
        } catch (error) {
          console.error(`Error fetching mentions for user ${user.id}:`, error);
        }
      },
      {
        timezone: userTimezone,
      }
    );

    /*
     * Fetch tweets for accounts daily at 12:05 AM.
     * This job fetches tweets for all active Twitter accounts.
     * @see {@link fetchTweetsForAccounts}
     *
     * Generate tweet responses for top tweets after fetching tweets.
     * @see {@link generateResponsesForTopTweets}
     */
    cron.schedule(
      "5 0 * * *",
      async () => {
        console.log(
          `Running scheduled job: Fetch tweets for accounts for user ${user.id}`
        );
        try {
          await fetchTweetsForAccounts(user.id);
          console.log(
            `Completed scheduled job: Fetch tweets for accounts for user ${user.id}`
          );

          console.log(
            `Generating new Engagement Ready Tweets for user ${user.id}...`
          );
          await generateResponsesForTopTweets();
          console.log(
            `Completed generating new Engagement Ready Tweets for user ${user.id}.`
          );
        } catch (error) {
          console.error(
            `Error in scheduled job: Fetch tweets for accounts for user ${user.id}:`,
            error
          );
        }
      },
      {
        timezone: userTimezone,
      }
    );

    /*
     * Refresh access tokens every 6 hours.
     * This job refreshes the access token for all active Twitter accounts.
     * @see {@link ensureValidAccessToken}
     */
    cron.schedule(
      "0 */6 * * *",
      async () => {
        console.log(
          `Starting the access token refresh job for user ${user.id}...`
        );

        try {
          const twitterAccounts = await db.twitterAccount.findMany({
            where: {
              status: TweetAccountStatus.ACTIVE,
            },
          });

          for (const account of twitterAccounts) {
            try {
              const accessToken = await ensureValidAccessToken(account.id);
              console.log(
                `Access token refreshed for account ${account.id} for user ${user.id}: ${accessToken}`
              );
            } catch (error) {
              console.error(
                `Failed to refresh access token for account ${account.id} for user ${user.id}:`,
                error
              );
            }
          }

          console.log(
            `Access token refresh job completed for user ${user.id}.`
          );
        } catch (error) {
          console.error(`Error fetching accounts for user ${user.id}:`, error);
        }
      },
      {
        timezone: userTimezone,
      }
    );
  }

  console.log("Jobs scheduled for all users.");
};
