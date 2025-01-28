import { db } from "@/lib/db";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";
import logger from "@/lib/logger";

export const refreshTokensProactively = async () => {
  const accounts = await db.twitterAccount.findMany({
    where: { status: "ACTIVE" },
  });

  for (const account of accounts) {
    try {
      await ensureValidAccessToken(account.id);
      console.log(`Refreshed token for account ${account.id}.`);
    } catch (error) {
      logger.error(`Error refreshing token for account ${account.id}:`, error);
    }
  }
};
