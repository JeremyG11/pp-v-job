import cron from "node-cron";
import { db } from "./lib/db";
import logger from "./lib/logger";
import { createJobs } from "./jobs";
import { getUserTimezone } from "./lib/util";
import { refreshTokensProactively } from "./jobs/refresh-access-token";

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
 * is about to expire and refresh it proactively.
 * This job will run every 15 minutes to check if the access token
 *
 */
cron.schedule("*/15 * * * *", async () => {
  try {
    logger.info("🔄 Running scheduled token refresh check...");
    await refreshTokensProactively();
    logger.info("✅ Token refresh completed.");
  } catch (error) {
    logger.error("❌ Token refresh cron job failed:", error);
  }
});
