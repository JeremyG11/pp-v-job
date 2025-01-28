import { Job } from "@/types";
import { db } from "@/lib/db";
import { fetchDMs } from "./fetchDMs";
import { fetchQuoteTweets } from "./fetchQuotes";
import { fetchMentions } from "./fetch-mentions";
import { fetchTwitterData } from "./fetchTwitterData";
import { fetchTweetsForAccounts } from "./fetch-tweet";
import { TweetAccountStatus, User } from "@prisma/client";
import { generateResponsesForTopTweets } from "./generate-tweet-content";

// graph from langgraph
import { graph } from "@/graphs";
import { initializeState } from "@/graphs/graph-init";
import { refreshTwitterAccountAccessToken } from "./refreshTwitterAccountAccessToken";

export const createJobs = (user: User, userTimezone: string): Job[] => [
  {
    id: `fetch-mentions-${user.id}`,
    /**
     * Fetch mentions every day at midnight.
     * This is a cron expression that runs at 12:00 AM every day.
     */
    schedule: "0 0 * * *",
    handler: async () => {
      await fetchMentions();
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
      await fetchTweetsForAccounts(user.id);
      await generateResponsesForTopTweets(user.id);
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
     * Refresh access token every 1hrs and 30mins.
     * This job is scheduled to run after the fetch-quote-tweets job.
     */
    schedule: "*/15 * * * *",
    handler: async () => {
      refreshTwitterAccountAccessToken(user.id);
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

    schedule: "0 0 * * *",
    handler: async () => {
      console.log(`Fetching Twitter data for user ${user.id}...`);
      const twitterAccounts = await db.twitterAccount.findMany({
        where: { userId: user.id, status: TweetAccountStatus.ACTIVE },
      });
      for (const account of twitterAccounts) {
        await fetchTwitterData(account.id);
      }
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
    schedule: "0 0 * * *",
    handler: async () => {
      await fetchDMs();
    },
    timezone: userTimezone,
  },

  // {
  //   id: `analyze-tweets-${user.id}`,
  //   schedule: "0 0 * * *",
  //   handler: async () => {
  //     console.log(`Starting workflow for user ${user.id}...`);

  //     try {
  //       const state = await initializeState();
  //       const result = await graph.invoke(state);
  //       console.log(`Workflow completed for user ${user.id}:`, result);
  //     } catch (error) {
  //       console.error(
  //         `Error running workflow for user ${user.id}:`,
  //         error.message
  //       );
  //     }

  //     console.log(`Completed workflow for user ${user.id}.`);
  //   },
  //   timezone: userTimezone,
  // },
];
