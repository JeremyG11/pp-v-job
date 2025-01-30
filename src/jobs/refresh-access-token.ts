import { db } from "@/lib/db";
import logger from "@/lib/logger";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

/**
 * Retries a function with exponential backoff.
 */
const retry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 2000
): Promise<T> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      logger.warn(`Retry ${attempt}/${retries} after failure:`, error);
      await new Promise((resolve) => setTimeout(resolve, delay * attempt)); // Exponential backoff
    }
  }
  throw new Error("Unexpected failure in retry function.");
};

/**
 * Refreshes only tokens that are expiring soon (within 15 minutes).
 */
export const refreshTokensProactively = async () => {
  const currentTime = Math.floor(Date.now() / 1000);

  const threshold = 900;

  // Fetch only accounts with tokens expiring soon
  const accounts = await db.twitterAccount.findMany({
    where: {
      status: "ACTIVE",
      expiresIn: { lte: currentTime + threshold },
    },
  });

  if (accounts.length === 0) {
    logger.info("⏳ No tokens need refreshing right now.");
    return;
  }

  logger.info(`🔄 Refreshing ${accounts.length} expiring tokens...`);

  // Run token refresh requests in parallel
  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      try {
        await retry(() => ensureValidAccessToken(account.id), 3, 2000);
        logger.info(`✅ Successfully refreshed token for ${account.username}`);
      } catch (error) {
        logger.error(
          `❌ Failed to refresh token for ${account.username} after retries.`,
          error
        );
      }
    })
  );

  // Log summary of results
  const successCount = results.filter((r) => r.status === "fulfilled").length;
  const failureCount = results.length - successCount;

  logger.info(
    `✅ ${successCount} tokens refreshed successfully. ❌ ${failureCount} failed.`
  );
};
