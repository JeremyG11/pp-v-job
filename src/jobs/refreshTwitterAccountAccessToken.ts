import { db } from "@/lib/db";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

export const refreshTokensProactively = async () => {
  const accounts = await db.twitterAccount.findMany({
    where: { status: "ACTIVE" },
  });

  for (const account of accounts) {
    try {
      await ensureValidAccessToken(account.id);
      console.log(`Refreshed token for account ${account.id}.`);
    } catch (error) {
      console.error(
        `Failed to refresh token for account ${account.id}:`,
        error.message
      );
    }
  }
};
