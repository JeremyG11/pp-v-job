import { db } from "../lib/db";
import { TwitterApi, TweetV2, UserV2 } from "twitter-api-v2";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";
import { TweetAccountStatus } from "@prisma/client";

/**
 * Fetch tweets for a single Twitter account based on its PainPoint keywords.
 * @param accountId - The ID of the Twitter account to fetch tweets for.
 * @returns void
 */

export const fetchTweetsForAccount = async (accountId: string) => {
  try {
    const account = await db.twitterAccount.findUnique({
      where: { id: accountId },
      include: { painPoint: true },
    });

    if (!account || !account.painPoint?.keywords.length) {
      console.log(`No Twitter account or keywords found for ID: ${accountId}`);
      return;
    }

    const accessToken = await ensureValidAccessToken(account.id);
    if (!accessToken) {
      console.log(`No access token found for account ID: ${account.id}`);
      return;
    }

    const client = new TwitterApi(accessToken);
    const roClient = client.readOnly;
    const keywords = account.painPoint.keywords;

    const query = `(${keywords
      .map((k) => `"${k}"`)
      .join(" OR ")}) -is:retweet -is:reply -is:quote lang:en`;

    console.log(`🔍 Fetching tweets for query: ${query}`);

    const endTime = new Date().toISOString();
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 7);
    const formattedStartTime = startTime.toISOString();

    let tweetsCollected: TweetV2[] = [];
    let nextToken: string | null = null;
    let attempts = 0;

    do {
      const response = await roClient.v2.search(query, {
        "tweet.fields": "author_id,public_metrics,id,text,created_at",
        "user.fields": "id,name,profile_image_url,url,username,verified",
        expansions: "author_id",
        max_results: 50,
        next_token: nextToken ?? undefined,
        start_time: formattedStartTime,
      });

      if (response.data?.data) {
        tweetsCollected = [...tweetsCollected, ...response.data.data];
      }

      nextToken = response.meta?.next_token ?? null;
      console.log(
        `✅ Total tweets fetched so far: ${
          tweetsCollected.length
        } (Attempt ${++attempts})`
      );
    } while (nextToken && tweetsCollected.length < 50 && attempts < 10);

    const uniqueTweets: TweetV2[] = Array.from(
      new Map(tweetsCollected.map((tweet) => [tweet.id, tweet])).values()
    );

    for (const tweet of uniqueTweets) {
      let author: UserV2 | undefined;

      if (tweet.author_id) {
        const userResponse = await roClient.v2.user(tweet.author_id);
        author = userResponse.data;
      }

      // Identify matching keywords
      const matchingKeywords = keywords.filter((kw) =>
        tweet.text.toLowerCase().includes(kw.toLowerCase())
      );

      if (matchingKeywords.length === 0) {
        console.log(`⚠️ No keyword match found for tweet: ${tweet.text}`);
        continue;
      }

      await db.tweet.upsert({
        where: { tweetId: tweet.id },
        update: {
          text: tweet.text,
          authorId: author?.id || null,
          authorName: author?.name || null,
          authorUsername: author?.username || null,
          authorProfileImageUrl: author?.profile_image_url || null,
          likeCount: tweet.public_metrics?.like_count ?? 0,
          retweetCount: tweet.public_metrics?.retweet_count ?? 0,
          replyCount: tweet.public_metrics?.reply_count ?? 0,
          quoteCount: tweet?.public_metrics?.quote_count ?? 0,
          impressionCount: tweet?.public_metrics?.impression_count ?? 0,
          timestamp: tweet.created_at ?? "",
          keyword: matchingKeywords.join(", "),
        },
        create: {
          twitterAccountId: account.id,
          tweetType: "FETCHED",
          tweetId: tweet.id,
          text: tweet.text,
          authorId: author?.id || null,
          authorName: author?.name || null,
          authorUsername: author?.username || null,
          authorProfileImageUrl: author?.profile_image_url || null,
          likeCount: tweet.public_metrics?.like_count ?? 0,
          retweetCount: tweet.public_metrics?.retweet_count ?? 0,
          replyCount: tweet.public_metrics?.reply_count ?? 0,
          quoteCount: tweet?.public_metrics?.quote_count ?? 0,
          impressionCount: tweet?.public_metrics?.impression_count ?? 0,
          timestamp: tweet.created_at ?? "",
          keyword: matchingKeywords.join(", "),
        },
      });
    }

    console.log(
      `✅ Successfully fetched ${uniqueTweets.length} tweets for ${account.painPoint.name}`
    );
  } catch (error) {
    console.error("❌ Error in fetchTweetsForAccount:", error);
  }
};

export const fetchTweetsForAccounts = async (userId: string) => {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { userId, status: TweetAccountStatus.ACTIVE },
      include: { painPoint: true },
    });

    if (twitterAccounts.length === 0) {
      return;
    }

    for (const account of twitterAccounts) {
      await fetchTweetsForAccount(account.id);
    }
  } catch (error) {
    console.error("❌ Error in fetchTweetsForAccounts:", error);
  }
};
