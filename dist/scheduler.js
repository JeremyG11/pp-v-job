"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleJobs = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const fetch_mentions_1 = require("./jobs/fetch-mentions");
const fetch_tweet_1 = require("./jobs/fetch-tweet");
// Schedule the job to run periodically
const scheduleJobs = () => {
    // Fetch mentions every 5 minutes
    node_cron_1.default.schedule("*/5 * * * *", async () => {
        console.log("Fetching mentions...");
        await (0, fetch_mentions_1.fetchMentions)();
    });
    // Fetch tweets for accounts daily at midnight
    node_cron_1.default.schedule("* * * * *", async () => {
        console.log("Running scheduled job: Fetch tweets for accounts");
        await (0, fetch_tweet_1.fetchTweetsForAccounts)();
        console.log("Completed scheduled job: Fetch tweets for accounts");
    });
    console.log("Tweet fetching job scheduled to run daily at midnight.");
};
exports.scheduleJobs = scheduleJobs;
//# sourceMappingURL=scheduler.js.map