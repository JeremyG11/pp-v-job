import { Job } from "@/types";
import { db } from "@/lib/db";
import { fetchDMs } from "./fetchDMs";
import { fetchQuoteTweets } from "./fetchQuotes";
import { fetchMentions } from "./fetch-mentions";
import { fetchTwitterData } from "./fetchTwitterData";
import { fetchTweetsForAccounts } from "./fetch-tweet";
import { TweetAccountStatus, User } from "@prisma/client";
import { generateResponsesForTopTweets } from "./generate-tweet-content";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

// graph from langgraph
import { graph } from "@/graphs";
import { initializeState } from "@/graphs/graph-init";

export const createJobs = (user: User, userTimezone: string): Job[] => [
  {
    id: `fetch-mentions-${user.id}`,
    /**
     * Fetch mentions every day at midnight.
     * This is a cron expression that runs at 12:00 AM every day.
     */
    schedule: "0 0 * * *",
    handler: async () => {
      console.log(`Fetching mentions for user ${user.id}...`);
      await fetchMentions();
      console.log(`Completed fetching mentions for user ${user.id}.`);
    },
    timezone: userTimezone,
  },
  {
    id: `fetch-tweets-${user.id}`,
    /**
     * Fetch tweets for accounts every day at 12:05 AM.
     * This is a cron expression that runs at 12:05 AM every day.
     * This job is scheduled to run after the fetch-mentions job.
     */
    schedule: "5 0 * * *",
    handler: async () => {
      console.log(`Fetching tweets for accounts for user ${user.id}...`);
      await fetchTweetsForAccounts(user.id);
      console.log(`Generating tweet responses for user ${user.id}...`);
      await generateResponsesForTopTweets();
      console.log(`Completed generating responses for user ${user.id}.`);
    },
    timezone: userTimezone,
  },
  {
    id: `fetch-quote-tweets-${user.id}`,
    /**
     * Fetch quote tweets every day at 12:10 AM.
     * This is a cron expression that runs at 12:10 AM every day.
     * This job is scheduled to run after the fetch-tweets job.
     */
    schedule: "10 0 * * *",
    handler: async () => {
      console.log(`Fetching quote tweets for user ${user.id}...`);
      await fetchQuoteTweets();
      console.log(`Completed fetching quote tweets for user ${user.id}.`);
    },
    timezone: userTimezone,
  },
  {
    id: `refresh-access-token-${user.id}`,
    /**
     * Refresh access tokens every 6 hours.
     * This is a cron expression that runs every 6 hours.
     * This job is scheduled to run after the fetch-quote-tweets job.
     */
    schedule: "0 */6 * * *",
    handler: async () => {
      console.log(`Refreshing access tokens for user ${user.id}...`);
      const twitterAccounts = await db.twitterAccount.findMany({
        where: { status: TweetAccountStatus.ACTIVE },
      });

      for (const account of twitterAccounts) {
        await ensureValidAccessToken(account.id);
        console.log(`Refreshed access token for account ${account.id}.`);
      }
    },
    timezone: userTimezone,
  },
  {
    id: `fetch-twitter-data-${user.id}`,
    /**
     * Fetch Twitter data every 60 minutes.
     * This is a cron expression that runs every 60 minutes.
     * This job is scheduled to run after the refresh-access-token job.
     */

    schedule: "* * * * *",
    handler: async () => {
      console.log(`Fetching Twitter data for user ${user.id}...`);
      await fetchTwitterData();
      console.log(`Completed fetching Twitter data for user ${user.id}.`);
    },
    timezone: userTimezone,
  },
  {
    id: `fetch-dms-${user.id}`,
    /**
     * Fetch DMs every day at 12:20 AM.
     * This is a cron expression that runs at 12:20 AM every day.
     * This job is scheduled to run after the fetch-twitter-data job.
     */
    schedule: "20 0 * * *",
    handler: async () => {
      console.log(`Fetching DMs for user ${user.id}...`);
      await fetchDMs();
      console.log(`Completed fetching DMs for user ${user.id}.`);
    },
    timezone: userTimezone,
  },

  {
    id: `analyze-tweets-${user.id}`,
    schedule: "0 0 * * *",
    handler: async () => {
      console.log(`Starting workflow for user ${user.id}...`);

      try {
        const state = await initializeState();
        const result = await graph.invoke(state);
        console.log(`Workflow completed for user ${user.id}:`, result);
      } catch (error) {
        console.error(
          `Error running workflow for user ${user.id}:`,
          error.message
        );
      }

      console.log(`Completed workflow for user ${user.id}.`);
    },
    timezone: userTimezone,
  },
];
