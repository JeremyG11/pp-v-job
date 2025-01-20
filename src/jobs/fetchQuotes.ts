import dotenv from "dotenv";
import { db } from "../lib/db";
import { TwitterApi } from "twitter-api-v2";
import { ensureValidAccessToken } from "../lib/ensure-valid-token";
import { TweetAccountStatus } from "@prisma/client";

dotenv.config();

/**
 * Fetches quote tweets for all active Twitter accounts
 * @returns
 */
export const fetchQuoteTweets = async (retryCount = 0) => {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { status: TweetAccountStatus.ACTIVE },
    });

    if (!twitterAccounts.length) {
      console.log("No active Twitter accounts found.");
      return;
    }

    for (const account of twitterAccounts) {
      const accessToken = await ensureValidAccessToken(account.id);
      const client = new TwitterApi(accessToken);
      const roClient = client.readOnly;

      if (!account || !account.twitterUserId) {
        console.log(`No Twitter user ID found for account ID: ${account.id}`);
        continue;
      }

      // Fetch user timeline to get tweet IDs
      const userTimeline = await roClient.v2.userTimeline(
        account.twitterUserId
      );

      console.log(JSON.stringify(userTimeline.data, null, 2));

      // const tweetIds = userTimeline.data.data.map((tweet) => tweet.id);

      // for (const tweetId of tweetIds.slice(1, 2)) {
      //   let nextToken: string | undefined = undefined;

      //   do {
      //     const {
      //       data: quotes,
      //       meta,
      //       errors,
      //       rateLimit,
      //     } = await roClient.v2.quotes(tweetId, {
      //       expansions: ["author_id"],
      //       "tweet.fields": ["created_at"],
      //       "user.fields": ["username", "name", "profile_image_url"],
      //     });

      //     console.log(JSON.stringify(quotes, null, 2));

      //     if (errors) {
      //       for (const error of errors) {
      //         console.log(`Error fetching quote tweet: ${error.detail}`);
      //       }
      //       continue;
      //     }

      //     if (rateLimit.remaining === 0) {
      //       const waitTime = rateLimit.reset * 1000 - Date.now();
      //       console.log(
      //         `Rate limit reached. Waiting for ${waitTime / 1000} seconds.`
      //       );
      //       await new Promise((resolve) => setTimeout(resolve, waitTime));
      //     }

      //     const users = quotes.includes?.users || [];
      //     const userMap = users.reduce((acc, user) => {
      //       acc[user.id] = user;
      //       return acc;
      //     }, {} as Record<string, any>);

      //     for (const quote of quotes.data) {
      //       const user = userMap[quote.author_id];

      //       if (!user) {
      //         console.warn(`No user found for quote ID: ${quote.id}`);
      //         continue;
      //       }

      //       await db.quoteTweet.upsert({
      //         where: { quoteId: quote.id },
      //         update: {},
      //         create: {
      //           quoteId: quote.id,
      //           tweetId: quote.id,
      //           quoteText: quote.text,
      //           twitterAccount: { connect: { id: account.id } },
      //           authorId: user.id,
      //           authorUsername: user.username,
      //           authorName: user.name,
      //           authorProfileImageUrl: user.profile_image_url,
      //         },
      //       });
      //       console.log(`Stored quote tweet with ID: ${quote.id}`);
      //     }

      //     nextToken = meta?.next_token;
      //   } while (nextToken);
      // }
    }
  } catch (error) {
    if (error.code === 429) {
      const rateLimitReset = error.rateLimit.reset;
      const waitTime = rateLimitReset * 1000 - Date.now();
      console.log(
        `Rate limit reached. Waiting for ${waitTime / 1000} seconds.`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      // Retry fetching quote tweets after waiting
      await fetchQuoteTweets();
    } else if (error.code === 503) {
      const waitTime = Math.min(2 ** retryCount * 1000, 32000); // Exponential backoff, max 32 seconds
      console.log(
        `Service unavailable. Retrying in ${waitTime / 1000} seconds.`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      // Retry fetching quote tweets after waiting
      await fetchQuoteTweets(retryCount + 1);
    } else {
      console.log("Error fetching quote tweets:", error);
    }
  }
};
