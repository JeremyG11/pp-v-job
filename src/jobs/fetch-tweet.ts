import { db } from "../lib/db";
import { TwitterApi } from "twitter-api-v2";
import { TweetAccountStatus } from "@prisma/client";
import { ensureValidAccessToken } from "@/lib/ensure-valid-token";

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

    // Fetch tweets for each keyword
    for (const keyword of painPoint.keywords) {
      // Fetch 10 tweets per keyword
      const MAX_RESULTS_PER_KEYWORD = 10;

      const query = `${keyword} -is:retweet lang:en`;
      // Fetch tweets for the keyword
      const apiResponse = await roClient.v2.search(query, {
        "tweet.fields":
          "attachments,author_id,public_metrics,id,text,entities,created_at",
        "user.fields":
          "id,name,profile_image_url,url,username,verified,created_at",
        expansions:
          "author_id,referenced_tweets.id,entities.mentions.username,in_reply_to_user_id",
        max_results: MAX_RESULTS_PER_KEYWORD,
      });

      const tweets = apiResponse.data?.data;
      if (!tweets?.length) {
        console.log(`No tweets found for keyword: ${keyword}`);
        await db.keywordNotFound.upsert({
          where: { id: `${account.id}-${keyword}` },
          update: {},
          create: { keyword, twitterAccount: { connect: { id: account.id } } },
        });
        continue;
      }

      // Map and save tweets
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
        // Save the tweet to the database
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
            keyword,
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
            keyword,
          },
        });
      }
    }

    console.log(`Fetched tweets for PainPoint: ${painPoint.name}`);
  } catch (error) {
    console.log("Error in fetchTweetsForAccount:", error);
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
