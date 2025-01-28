import { db } from "./db";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus } from "@prisma/client";

const CLIENT_ID = process.env.AUTH_TWITTER_ID!;
const CLIENT_SECRET = process.env.AUTH_TWITTER_SECRET!;

export async function ensureValidAccessToken(
  accountId: string
): Promise<string> {
  const account = await db.twitterAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) throw new Error("Twitter account not found");
  if (!account.accessToken)
    throw new Error("Access token is missing for this account");

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

    const currentTime = Math.floor(Date.now() / 1000);
    const newExpiry = currentTime + expiresIn;

    await db.twitterAccount.update({
      where: { id: accountId },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken ?? account.refreshToken, // Retain old refreshToken if new one isn't provided
        expiresIn: newExpiry,
      },
    });

    console.log(`Token refreshed successfully for account ${accountId}`);
    return newAccessToken;
  } catch (error) {
    console.error(
      "Failed to refresh token:",
      error.response?.data || error.message
    );

    if (error.response?.data?.error === "invalid_request") {
      console.error(
        `Refresh token expired for account ${accountId}. Reauthentication required.`
      );
      await db.twitterAccount.update({
        where: { id: accountId },
        data: { status: TweetAccountStatus.PAUSED },
      });
      throw new Error("Refresh token expired. User reauthentication required.");
    }

    throw error;
  }
}
