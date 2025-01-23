import cron from "node-cron";
import { db } from "./lib/db";
import { getUserTimezone } from "./lib/util";
import { createJobs } from "./jobs";

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
