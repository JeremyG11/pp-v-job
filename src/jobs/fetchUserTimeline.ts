import { db } from "../lib/db";
import { TwitterApi } from "twitter-api-v2";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";
import { TweetAccountStatus, TwitterAccount } from "@prisma/client";

/**
 * Fetches the user's timeline data and updates the database with the engagement metrics.
 * @param twitterAccountId - The ID of the Twitter account to fetch data for
 * @returns A promise that resolves when the data has been fetched
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
 * Helper function to process account analytics.
 *  @param account - The Twitter account to process.
 *  @returns A promise that resolves when the analytics have been processed.
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
    const VIRAL_THRESHOLD = 1;

    for (const tweet of tweets?.data?.data || []) {
      const { like_count, retweet_count, reply_count } = tweet.public_metrics;
      const totalEngagement = like_count + retweet_count + reply_count;

      await db.engagement.upsert({
        where: { id: tweet.id },
        update: {
          likeCount: like_count,
          retweetCount: retweet_count,
          replyCount: reply_count,
          totalEngagement,
        },
        create: {
          twitterAccount: { connect: { id: account.id } },
          tweetId: tweet.id,
          engagementDate: new Date(tweet.created_at),
          likeCount: like_count,
          retweetCount: retweet_count,
          replyCount: reply_count,
          totalEngagement,
        },
      });

      if (totalEngagement >= VIRAL_THRESHOLD) {
        viralTweetCount += 1;
      }
    }

    // Fetch all engagement records for the account between startDate and today.
    const engagements = await db.engagement.findMany({
      where: {
        twitterAccount: { id: account.id },
        engagementDate: {
          gte: startDate,
          lte: today,
        },
      },
      select: {
        engagementDate: true,
        totalEngagement: true,
      },
    });

    // Aggregate engagement data by date.
    const engagementData: Record<string, number> = {};
    engagements.forEach((record) => {
      const dateStr = record.engagementDate.toISOString().split("T")[0];
      if (!engagementData[dateStr]) {
        engagementData[dateStr] = record.totalEngagement;
      } else {
        engagementData[dateStr] += record.totalEngagement;
      }
    });

    // Use the helper function to fill missing dates with zero engagement.
    const filledDailyEngagement = fillMissingDates(
      startDate,
      today,
      engagementData
    );
    console.log("Daily Engagement (filled):", filledDailyEngagement);
    // --------------------------------------------------------------

    // Update (or create) overall account analytics.
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

/**
 * Helper function to fill missing dates with 0 engagement.
 * Given a start and end date and an object mapping dates to engagement values,
 * returns an array with every date between start and end and 0 engagement for missing days.
 */
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
