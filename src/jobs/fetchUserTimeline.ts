import { db } from "../lib/db";
import { TwitterApi } from "twitter-api-v2";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";
import { TweetAccountStatus, TwitterAccount } from "@prisma/client";

/**
 *  Fetches the user's timeline data and updates the database with the engagement metrics.
 * @param twitterAccountId  The ID of the Twitter account to fetch data for
 * @returns  A promise that resolves when the data has been fetched
 */

export const fetchUserTimeline = async (twitterAccountId: string) => {
  try {
    const account = await db.twitterAccount.findFirst({
      where: { id: twitterAccountId, status: TweetAccountStatus.ACTIVE },
    });

    if (!account) {
      console.log("[⚠ WARNING] No active Twitter account found.");
      return;
    }

    try {
      await processAccountAnalytics(account);
      console.log(`[✅ SUCCESS] Processed account: ${account.username}`);
    } catch (error) {
      console.error(
        `[❌ ERROR] Processing account ${account.username}:`,
        error
      );
    }
  } catch (error) {
    console.log("[❌ ERROR] Failed to fetch Twitter data:", error);
  }
};

/**
 * 🔹 Helper function to process account analytics
 *  @param account The Twitter account to process
 *  @returns A promise that resolves when the analytics have been processed
 *
 */
const processAccountAnalytics = async (account: TwitterAccount) => {
  try {
    const accessToken = await ensureValidAccessToken(account.id);
    const client = new TwitterApi(accessToken);
    const roClient = client.readOnly;

    // Retrieve the most recent analytic data if available
    const accountData = await db.accountAnalyticData.findFirst({
      where: { twitterAccountId: account.id },
    });

    // Determine the start date for fetching tweets
    const startDate = accountData?.lastUpdated
      ? new Date(accountData.lastUpdated)
      : new Date(account.createdAt);

    const today = new Date();

    // Fetch tweets starting from the determined start date
    const tweets = await roClient.v2.userTimeline(account.twitterUserId, {
      "tweet.fields": ["public_metrics", "created_at"],
      start_time: startDate.toISOString(),
    });

    console.log(`[🔍 INFO] Fetched`, JSON.stringify(tweets || {}, null, 2));

    let viralTweetCount = 0;
    const VIRAL_THRESHOLD = 100;

    // Loop over tweets and process engagement metrics
    for (const tweet of tweets?.data?.data || []) {
      const { like_count, retweet_count, reply_count } = tweet.public_metrics;
      const totalEngagement = like_count + retweet_count + reply_count;

      // Only create an engagement record if the tweet is considered viral
      if (totalEngagement >= VIRAL_THRESHOLD) {
        await db.engagement.create({
          data: {
            twitterAccount: { connect: { id: account.id } },
            tweetId: tweet.id,
            engagementDate: today,
            likeCount: like_count,
            retweetCount: retweet_count,
            replyCount: reply_count,
            totalEngagement,
          },
        });
        viralTweetCount += 1;
      }
    }

    // Update (or create) overall account analytics
    await db.accountAnalyticData.upsert({
      where: { twitterAccountId: account.id },
      update: {
        viralTweets: viralTweetCount,
        lastUpdated: today,
      },
      create: {
        twitterAccount: { connect: { id: account.id } },
        viralTweets: viralTweetCount,
        lastUpdated: today,
      },
    });

    console.log(
      `[✅ SUCCESS] Engagement updated for account: ${account.username}, Viral Tweets: ${viralTweetCount}`
    );
  } catch (error) {
    console.error(
      `[❌ ERROR] Engagement update failed for ${account.username}:`,
      error
    );
  }
};

// 🔹 Helper function to fill missing dates with 0 engagement
const fillMissingDates = (
  start: Date,
  end: Date,
  engagementData: Record<string, number>
) => {
  const result = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const formattedDate = currentDate.toISOString().split("T")[0];
    result.push({
      date: formattedDate,
      engagement: engagementData[formattedDate] || 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return result;
};
