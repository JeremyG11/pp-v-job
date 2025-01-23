import { db } from "@/lib/db";
import logger from "@/lib/logger";
import { TweetAccountStatus } from "@prisma/client";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

export async function refreshTwitterAccountAccessToken(userId: string) {
  try {
    const accounts = await db.twitterAccount.findMany({
      where: { userId, status: TweetAccountStatus.ACTIVE },
    });

    if (accounts.length === 0) {
      logger.info("No active Twitter accounts found.");
      return;
    }

    for (const account of accounts) {
      if (!account) {
        logger.info(`Account with ID ${account.username} not found.`);
        return;
      }

      if (account.status !== TweetAccountStatus.ACTIVE) {
        logger.info(`Account ${account.username} is not active. Skipping.`);
        return;
      }

      logger.info(
        `Refreshing access tokens for account ${account.username}...`
      );

      await ensureValidAccessToken(account.id);

      logger.info(
        `Successfully refreshed access token for account ${account.username}.`
      );
    }
  } catch (error) {
    logger.error(
      `Failed to refresh access token: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}
