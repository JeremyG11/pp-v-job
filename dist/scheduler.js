"use strict";
// import cron from "node-cron";
// import { db } from "./lib/db";
// import { TweetAccountStatus } from "@prisma/client";
// import { fetchMentions } from "./jobs/fetch-mentions";
// import { fetchTweetsForAccounts } from "./jobs/fetch-tweet";
// import { ensureValidAccessToken } from "./lib/ensure-valid-token";
// import { generateResponsesForTopTweets } from "./jobs/generate-tweet-content";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleJobs = void 0;
// /**
//  * Schedule all the jobs.
//  */
// export const scheduleJobs = () => {
//   /**
//    * Fetch mentions daily at midnight.
//    * This job fetches mentions for all active Twitter accounts.
//    * @see {@link fetchMentions}
//    */
//   cron.schedule("0 0 * * *", async () => {
//     console.log("Fetching mentions...");
//     await fetchMentions();
//   });
//   /*
//    * Fetch tweets for accounts daily at 12:05 AM.
//    * This job fetches tweets for all active Twitter accounts.
//    * @see {@link fetchTweetsForAccounts}
//    *
//    * Generate tweet responses for top tweets after fetching tweets.
//    * @see {@link generateResponsesForTopTweets}
//    */
//   cron.schedule("5 0 * * *", async () => {
//     console.log("Running scheduled job: Fetch tweets for accounts");
//     await fetchTweetsForAccounts();
//     console.log("Completed scheduled job: Fetch tweets for accounts");
//     console.log("Generating new Engagement Ready Tweets...");
//     await generateResponsesForTopTweets();
//     console.log("Completed generating new Engagement Ready Tweets.");
//   });
//   /*
//    * Refresh access tokens every 6 hours.
//    * This job refreshes the access token for all active Twitter accounts.
//    * @see {@link ensureValidAccessToken}
//    */
//   cron.schedule("0 */6 * * *", async () => {
//     console.log("Starting the access token refresh job...");
//     try {
//       const twitterAccounts = await db.twitterAccount.findMany({
//         where: {
//           status: TweetAccountStatus.ACTIVE,
//         },
//       });
//       for (const account of twitterAccounts) {
//         try {
//           const accessToken = await ensureValidAccessToken(account.id);
//           console.log(
//             `Access token refreshed for account ${account.id}: ${accessToken}`
//           );
//         } catch (error) {
//           console.error(
//             `Failed to refresh access token for account ${account.id}:`,
//             error
//           );
//         }
//       }
//       console.log("Access token refresh job completed.");
//     } catch (error) {
//       console.error("Error fetching accounts:", error);
//     }
//   });
//   console.log(
//     "Jobs scheduled: Fetch mentions at midnight, Fetch tweets at 12:05 AM, Refresh access tokens every 6 hours, Generate new Engagement Ready Tweets after fetching tweets."
//   );
// };
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("./lib/db");
const client_1 = require("@prisma/client");
const fetch_mentions_1 = require("./jobs/fetch-mentions");
const fetch_tweet_1 = require("./jobs/fetch-tweet");
const ensure_valid_token_1 = require("./lib/ensure-valid-token");
const generate_tweet_content_1 = require("./jobs/generate-tweet-content");
/**
 * Schedule all the jobs.
 */
const scheduleJobs = () => {
    /**
     * Fetch mentions every minute for testing.
     * This job fetches mentions for all active Twitter accounts.
     * @see {@link fetchMentions}
     */
    node_cron_1.default.schedule("* * * * *", async () => {
        console.log("Fetching mentions...");
        await (0, fetch_mentions_1.fetchMentions)();
    });
    /*
     * Fetch tweets for accounts every 2 minutes for testing.
     * This job fetches tweets for all active Twitter accounts.
     * @see {@link fetchTweetsForAccounts}
     *
     * Generate tweet responses for top tweets after fetching tweets.
     * @see {@link generateResponsesForTopTweets}
     */
    node_cron_1.default.schedule("*/2 * * * *", async () => {
        console.log("Running scheduled job: Fetch tweets for accounts");
        await (0, fetch_tweet_1.fetchTweetsForAccounts)();
        console.log("Completed scheduled job: Fetch tweets for accounts");
        console.log("Generating new Engagement Ready Tweets...");
        await (0, generate_tweet_content_1.generateResponsesForTopTweets)();
        console.log("Completed generating new Engagement Ready Tweets.");
    });
    /*
     * Refresh access tokens every 5 minutes for testing.
     * This job refreshes the access token for all active Twitter accounts.
     * @see {@link ensureValidAccessToken}
     */
    node_cron_1.default.schedule("*/5 * * * *", async () => {
        console.log("Starting the access token refresh job...");
        try {
            const twitterAccounts = await db_1.db.twitterAccount.findMany({
                where: {
                    status: client_1.TweetAccountStatus.ACTIVE,
                },
            });
            for (const account of twitterAccounts) {
                try {
                    const accessToken = await (0, ensure_valid_token_1.ensureValidAccessToken)(account.id);
                    console.log(`Access token refreshed for account ${account.id}: ${accessToken}`);
                }
                catch (error) {
                    console.error(`Failed to refresh access token for account ${account.id}:`, error);
                }
            }
            console.log("Access token refresh job completed.");
        }
        catch (error) {
            console.error("Error fetching accounts:", error);
        }
    });
    console.log("Jobs scheduled: Fetch mentions every minute, Fetch tweets every 2 minutes, Refresh access tokens every 5 minutes, Generate new Engagement Ready Tweets after fetching tweets.");
};
exports.scheduleJobs = scheduleJobs;
//# sourceMappingURL=scheduler.js.map