import { db } from "./db";
import { TwitterApi } from "twitter-api-v2";

const CLIENT_ID = process.env.AUTH_TWITTER_ID!;
const CLIENT_SECRET = process.env.AUTH_TWITTER_SECRET!;

export async function ensureValidAccessToken(accountId: string) {
  const account = await db.twitterAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error("Account not found");
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (account.expiresIn && account.expiresIn < currentTime) {
    // Refresh the access token
    const client = new TwitterApi({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

    try {
      const {
        client: refreshedClient,
        accessToken,
        refreshToken,
        expiresIn,
      } = await client.refreshOAuth2Token(account.refreshToken!);

      await db.twitterAccount.update({
        where: { id: account.id },
        data: {
          accessToken,
          refreshToken: refreshToken ?? null,
          expiresIn: Math.floor(Date.now() / 1000) + expiresIn,
        },
      });

      // Update the account object with the new tokens
      account.accessToken = accessToken;
      account.refreshToken = refreshToken ?? null;
      account.expiresIn = Math.floor(Date.now() / 1000) + expiresIn;
    } catch (error) {
      console.log("Error rotating access token:", error);
      throw new Error("Failed to refresh access token");
    }
  }

  return account.accessToken;
}
