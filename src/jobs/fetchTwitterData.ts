import { db } from "../lib/db";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus, TwitterAccount } from "@prisma/client";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

// Function to fetch and process Twitter account analytics
export const fetchTwitterData = async () => {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { status: TweetAccountStatus.ACTIVE },
    });

    if (!twitterAccounts.length) {
      console.log("No active Twitter accounts found.");
      return;
    }

    const analyticsTasks = twitterAccounts.map(async (account) => {
      try {
        await processAccountAnalytics(account);
        console.log(`Successfully processed account: ${account.id}`);
      } catch (error) {
        console.log(`Error processing account ${account.id}:`, error);
      }
    });

    await Promise.all(analyticsTasks);
    console.log("All Twitter data fetch and analytics updates completed.");
  } catch (error) {
    console.log("Failed to fetch Twitter data:", error);
  }
};

// Function to process an individual account's analytics
const processAccountAnalytics = async (account: TwitterAccount) => {
  try {
    const accessToken = await ensureValidAccessToken(account.id);
    const client = new TwitterApi(accessToken);
    const roClient = client.readOnly;

    // Get user details
    const user = await roClient.v2.user(account.twitterUserId, {
      "user.fields": ["public_metrics"],
    });

    const followerCount = user.data.public_metrics.followers_count;

    // Store current follower count in history
    await db.followerHistory.create({
      data: {
        twitterAccountId: account.id,
        followersCount: followerCount,
        recordedAt: new Date(),
      },
    });

    const previousFollowerRecord = await db.followerHistory.findFirst({
      where: { twitterAccountId: account.id },
      orderBy: { recordedAt: "desc" },
      skip: 1,
    });

    const previousFollowerCount = previousFollowerRecord
      ? previousFollowerRecord.followersCount
      : 0;
    const followerGrowth = followerCount - previousFollowerCount;

    const followerGrowthChange =
      previousFollowerCount > 0
        ? ((followerGrowth / previousFollowerCount) * 100).toFixed(2)
        : 0;

    const accountDate = new Date(account.createdAt).toISOString();
    const tweets = await roClient.v2.userTimeline(account.twitterUserId, {
      "tweet.fields": ["public_metrics", "created_at"],
      start_time: accountDate,
    });

    // Create a map to store engagement data
    const dailyEngagementMap: Record<string, number> = {};

    for (const tweet of tweets?.data?.data || []) {
      const tweetDate = new Date(tweet.created_at).toISOString().split("T")[0];
      const metrics = tweet.public_metrics;
      const engagementCount =
        metrics.like_count + metrics.retweet_count + metrics.reply_count;

      if (dailyEngagementMap[tweetDate]) {
        dailyEngagementMap[tweetDate] += engagementCount;
      } else {
        dailyEngagementMap[tweetDate] = engagementCount;
      }
    }

    // Function to generate a full date range and fill missing engagements with 0
    const fillMissingDates = (start: string, end: string) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const result = [];

      while (startDate <= endDate) {
        const formattedDate = startDate.toISOString().split("T")[0];
        result.push({
          date: formattedDate,
          engagement: dailyEngagementMap[formattedDate] || 0,
        });
        startDate.setDate(startDate.getDate() + 1);
      }

      return result;
    };

    // Ensure no missing dates by filling them with zeros
    const filledDailyEngagement = fillMissingDates(
      accountDate,
      new Date().toISOString().split("T")[0]
    );

    // Calculate total engagements for current period
    const totalEngagementsCurrent = filledDailyEngagement.reduce(
      (sum, item) => sum + item.engagement,
      0
    );

    // Get last recorded total engagements
    const lastRecord = await db.accountAnalyticData.findFirst({
      where: { twitterAccountId: account.id },
      orderBy: { updatedAt: "desc" },
    });

    const previousTotalEngagements = lastRecord
      ? lastRecord.totalEngagements
      : 0;
    const totalEngagementsChange =
      previousTotalEngagements > 0
        ? ((totalEngagementsCurrent - previousTotalEngagements) /
            previousTotalEngagements) *
          100
        : 0;

    // Update or create analytics data
    await db.accountAnalyticData.upsert({
      where: { twitterAccountId: account.id },
      update: {
        totalFollowers: followerCount,
        followerGrowth,
        followerGrowthChange: Number(followerGrowthChange),
        totalEngagements: totalEngagementsCurrent,
        totalEngagementsChange: parseFloat(totalEngagementsChange.toFixed(2)),
        dailyEngagement: filledDailyEngagement,
      },
      create: {
        totalFollowers: followerCount,
        followerGrowth,
        followerGrowthChange: Number(followerGrowthChange),
        totalEngagements: totalEngagementsCurrent,
        totalEngagementsChange: parseFloat(totalEngagementsChange.toFixed(2)),
        dailyEngagement: filledDailyEngagement,
        twitterAccountId: account.id,
      },
    });

    console.log(`Analytics updated for account ID: ${account.id}`);
  } catch (error) {
    console.log(
      `Failed to process analytics for account ID: ${account.id}:`,
      error
    );
  }
};
