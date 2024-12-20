import cron from "node-cron";
import { fetchMentions } from "./jobs/fetch-mentions";
import { fetchTweetsForAccounts } from "./jobs/fetch-tweet";

// Schedule the job to run periodically
export const scheduleJobs = () => {
  // Fetch mentions every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    console.log("Fetching mentions...");
    await fetchMentions();
  });

  // Fetch tweets for accounts daily at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("Running scheduled job: Fetch tweets for accounts");
    await fetchTweetsForAccounts();
    console.log("Completed scheduled job: Fetch tweets for accounts");
  });

  console.log("Tweet fetching job scheduled to run daily at midnight.");
};
