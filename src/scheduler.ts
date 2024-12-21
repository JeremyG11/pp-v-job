import cron from "node-cron";
import { fetchMentions } from "./jobs/fetch-mentions";
import { fetchTweetsForAccounts } from "./jobs/fetch-tweet";

// Schedule the job to run periodically
export const scheduleJobs = () => {
  // Fetch mentions daily at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("Fetching mentions...");
    await fetchMentions();
  });

  // Fetch tweets for accounts daily at 12:05 AM
  cron.schedule("5 0 * * *", async () => {
    console.log("Running scheduled job: Fetch tweets for accounts");
    await fetchTweetsForAccounts();
    console.log("Completed scheduled job: Fetch tweets for accounts");
  });

  console.log(
    "Jobs scheduled: Fetch mentions at midnight, Fetch tweets at 12:05 AM."
  );
};
