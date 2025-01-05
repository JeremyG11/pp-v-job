import cron from "node-cron";
import { db } from "./lib/db";
import { TweetAccountStatus } from "@prisma/client";
import { fetchMentions } from "./jobs/fetch-mentions";
import { fetchTweetsForAccounts } from "./jobs/fetch-tweet";
import { ensureValidAccessToken } from "./lib/ensure-valid-token";
import { generateResponsesForTopTweets } from "./jobs/generate-tweet-content";

/**
 * Schedule all the jobs.
 */
export const scheduleJobs = () => {
  /**
   * Fetch mentions daily at midnight.
   * This job fetches mentions for all active Twitter accounts.
   * @see {@link fetchMentions}
   */
  cron.schedule("0 0 * * *", async () => {
    console.log("Fetching mentions...");
    try {
      await fetchMentions();
      console.log("Completed fetching mentions.");
    } catch (error) {
      console.error("Error fetching mentions:", error);
    }
  });

  /*
   * Fetch tweets for accounts daily at 12:05 AM.
   * This job fetches tweets for all active Twitter accounts.
   * @see {@link fetchTweetsForAccounts}
   *
   * Generate tweet responses for top tweets after fetching tweets.
   * @see {@link generateResponsesForTopTweets}
   */
  cron.schedule("5 0 * * *", async () => {
    console.log("Running scheduled job: Fetch tweets for accounts");
    try {
      await fetchTweetsForAccounts();
      console.log("Completed scheduled job: Fetch tweets for accounts");

      console.log("Generating new Engagement Ready Tweets...");
      await generateResponsesForTopTweets();
      console.log("Completed generating new Engagement Ready Tweets.");
    } catch (error) {
      console.error("Error in scheduled job: Fetch tweets for accounts", error);
    }
  });

  /*
   * Refresh access tokens every 6 hours.
   * This job refreshes the access token for all active Twitter accounts.
   * @see {@link ensureValidAccessToken}
   */
  cron.schedule("0 */6 * * *", async () => {
    console.log("Starting the access token refresh job...");

    try {
      const twitterAccounts = await db.twitterAccount.findMany({
        where: {
          status: TweetAccountStatus.ACTIVE,
        },
      });

      for (const account of twitterAccounts) {
        try {
          const accessToken = await ensureValidAccessToken(account.id);
          console.log(`Access token refreshed for account ${account.id}`);
        } catch (error) {
          console.error(
            `Failed to refresh access token for account ${account.id}:`,
            error
          );
        }
      }

      console.log("Access token refresh job completed.");
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  });

  console.log(
    "Jobs scheduled: Fetch mentions at midnight, Fetch tweets at 12:05 AM, Refresh access tokens every 6 hours, Generate new Engagement Ready Tweets after fetching tweets."
  );
};
