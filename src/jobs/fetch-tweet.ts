import { db } from "../lib/db";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus } from "@prisma/client";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

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

    if (!account) {
      console.log(`No Twitter account found with ID: ${accountId}`);
      return;
    }

    const painPoint = account.painPoint;

    if (!painPoint || !painPoint.keywords || painPoint.keywords.length === 0) {
      console.log(`No keywords found for account ID: ${account.id}`);
      return;
    }

    const accessToken = await ensureValidAccessToken(account.id);

    if (!accessToken) {
      console.log(`No access token found for account ID: ${account.id}`);
      return;
    }

    const client = new TwitterApi(accessToken);
    const roClient = client.readOnly;

    const keywords = painPoint.keywords;

    //  Advanced filters to improve search relevance
    const query = `(${keywords
      .map((k) => `"${k}"`)
      .join(" OR ")}) -is:retweet -is:reply lang:en`;

    console.log(`🔍 Fetching tweets for query: ${query}`);

    const apiResponse = await roClient.v2.search(query, {
      "tweet.fields":
        "attachments,author_id,public_metrics,id,text,entities,created_at",
      "user.fields":
        "id,name,profile_image_url,url,username,verified,created_at",
      expansions:
        "author_id,referenced_tweets.id,entities.mentions.username,in_reply_to_user_id",
      max_results: 50,
    });

    const tweets = apiResponse.data?.data;
    if (!tweets?.length) {
      console.log(`❌ No tweets found for combined query`);
      return;
    }

    const users = apiResponse.includes?.users || [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    for (const tweet of tweets) {
      const author = tweet.author_id ? userMap.get(tweet.author_id) : null;

      let isRetweet = false;
      let referencedTweetId = null;

      if (tweet.referenced_tweets) {
        tweet.referenced_tweets.forEach((refTweet) => {
          if (refTweet.type === "retweeted") {
            isRetweet = true;
            referencedTweetId = refTweet.id;
          }
        });
      }

      //  Determine which keyword(s) matched
      const matchingKeywords = painPoint.keywords.filter((kw) =>
        tweet.text.toLowerCase().includes(kw.toLowerCase())
      );

      if (matchingKeywords.length === 0) {
        console.log(`⚠️ No keyword match found for tweet: ${tweet.text}`);
        continue;
      }

      //  Save the tweet and link it to the matched keyword(s)
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
          isRetweet,
          referencedTweetId,
          keyword: matchingKeywords.join(", "), // ✅ Store matching keywords
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
          isRetweet,
          referencedTweetId,
          keyword: matchingKeywords.join(", "), // ✅ Store matching keywords
        },
      });
    }

    console.log(
      `✅ Successfully fetched tweets for PainPoint: ${painPoint.name}`
    );
  } catch (error) {
    console.log("❌ Error in fetchTweetsForAccount:", error);
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
    console.log("Error in fetchTweetsForAccounts:", error);
  }
};
