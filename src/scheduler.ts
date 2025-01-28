import cron from "node-cron";
import { db } from "./lib/db";
import { createJobs } from "./jobs";
import { getUserTimezone } from "./lib/util";
import { refreshTokensProactively } from "./jobs/refreshTwitterAccountAccessToken";

/**
 * Schedule all the jobs for a given user.
 */
export const scheduleJobs = async () => {
  const users = await db.user.findMany();

  for (const user of users) {
    const userTimezone = await getUserTimezone(user.id);

    /**
     * Create and schedule jobs for the user.
     * This function is defined in src/jobs/index.ts.
     */
    const jobs = createJobs(user, userTimezone);
    for (const job of jobs) {
      cron.schedule(
        job.schedule,
        async () => {
          try {
            await job.handler();
          } catch (error) {
            console.error(`Error in job ${job.id}:`, error);
          }
        },
        { timezone: job.timezone }
      );

      console.log(`Scheduled job ${job.id} for user ${user.id}.`);
    }
  }
};

/**
 * Schedule the proactive token refresh job.
 * This job will run every 15 minutes to check if the access token
 * is about to expire and refresh it proactively.
 *
 */
cron.schedule("*/15 * * * *", async () => {
  await refreshTokensProactively();
});
