import { db } from "@/lib/db";
import logger from "@/lib/logger";
import { TweetAccountStatus } from "@prisma/client";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

export async function refreshTwitterAccountAccessToken(accountId: string) {
  try {
    const account = await db.twitterAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      logger.info(`Account with ID ${accountId} not found.`);
      return;
    }

    if (account.status !== TweetAccountStatus.ACTIVE) {
      logger.info(`Account ${account.username} is not active. Skipping.`);
      return;
    }

    logger.info(`Refreshing access tokens for account ${account.username}...`);

    await ensureValidAccessToken(account.id);

    logger.info(
      `Successfully refreshed access token for account ${account.username}.`
    );
  } catch (error) {
    logger.error(
      `Failed to refresh access token for account ID ${accountId}: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}
