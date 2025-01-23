import { db } from "./db";
import { TwitterApi } from "twitter-api-v2";

const CLIENT_ID = process.env.AUTH_TWITTER_ID!;
const CLIENT_SECRET = process.env.AUTH_TWITTER_SECRET!;

// A buffer for refreshing the token, 5 minutes before expiration
const TOKEN_EXPIRY_BUFFER = 300;

export async function ensureValidAccessToken(
  accountId: string
): Promise<string> {
  const account = await db.twitterAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error("Twitter account not found");
  }

  if (!account.accessToken) {
    throw new Error("Access token is missing for this account");
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const tokenExpiry = account.expiresIn || 0;

  // Check if the access token is about to expire
  if (tokenExpiry - TOKEN_EXPIRY_BUFFER <= currentTime) {
    console.log(`Refreshing token for account ${accountId}...`);

    const client = new TwitterApi({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });

    try {
      const {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn,
      } = await client.refreshOAuth2Token(account.refreshToken!);

      const newExpiry = currentTime + expiresIn;

      // Update the database with the refreshed tokens
      await db.twitterAccount.update({
        where: { id: accountId },
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken ?? account.refreshToken, // Fallback to old refreshToken
          expiresIn: newExpiry,
        },
      });

      console.log(`Token refreshed successfully for account ${accountId}`);
      return newAccessToken;
    } catch (error: any) {
      console.error(`Failed to refresh token for account ${accountId}:`, error);
      throw new Error("Failed to refresh the access token");
    }
  }
  // Token is still valid, return the existing one
  return account.accessToken;
}
