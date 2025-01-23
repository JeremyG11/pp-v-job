import OpenAI from "openai";
import { db } from "@/lib/db";
import { EngagementType } from "@prisma/client";
import { assistantMapping } from "@/config/env";
import { enumEngagementTypeMapping } from "@/config/constant";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function processTweetWithAI(
  tweetText: string,
  engagementType: string
): Promise<string> {
  try {
    const normalizedEngagementType = engagementType.toLowerCase();

    const assistantId = assistantMapping[normalizedEngagementType];
    if (!assistantId) {
      throw new Error(
        `No assistant found for engagement type: ${engagementType}`
      );
    }

    // Create a thread
    const thread = await openai.beta.threads.create();

    // Prepare prompt to instruct AI to generate 5 responses
    const prompt = `
      You are an expert social media strategist. Your task is to generate 
      **five diverse responses** based on the following engagement type:

      Engagement Type: ${normalizedEngagementType}
      Tweet: "${tweetText}"

      Please provide **five unique responses**, each formatted as follows:

      1. [Response Type]: [Response Text]
      2. [Response Type]: [Response Text]
      3. [Response Type]: [Response Text]
      4. [Response Type]: [Response Text]
      5. [Response Type]: [Response Text]
    `;

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: prompt,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
    });

    while (true) {
      const runStatus = await openai.beta.threads.runs.retrieve(
        thread.id,
        run.id
      );

      if (runStatus.status === "completed") break;

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Fetch assistant's response
    const messages = await openai.beta.threads.messages.list(thread.id);

    // Extract and return the assistant response
    const messageContent = messages.data[0]?.content[0];

    const textContent =
      "text" in messageContent
        ? messageContent.text.value
        : "No response generated.";
    return textContent;
  } catch (error) {
    console.log("Error processing tweet:", error);
    return "Error processing the tweet response.";
  }
}

async function fetchAppPainpoint(accountId: string) {
  const appPainpoint = await db.painPoint.findFirst({
    where: { twitterAccountId: accountId },
  });
  if (!appPainpoint || appPainpoint.siteSummary === "N/A")
    throw new Error("App's pain point is not properly configured.");

  return appPainpoint.siteSummary ?? "";
}

function parseGeneratedResponse(generatedResponse: string) {
  const match = generatedResponse.match(/^\d+\. \[(.+?)\]: (.+)$/);
  if (match) {
    return { responseType: match[1].trim(), responseText: match[2].trim() };
  }

  // Try another format if the first one fails
  const alternativeMatch = generatedResponse.match(/^1\. \[(.+?)\]: (.+)$/);
  if (alternativeMatch) {
    return {
      responseType: alternativeMatch[1].trim(),
      responseText: alternativeMatch[2].trim(),
    };
  }

  // Try another format if the second one fails
  const anotherAlternativeMatch = generatedResponse.match(/^1\. (.+?): (.+)$/);
  if (anotherAlternativeMatch) {
    return {
      responseType: anotherAlternativeMatch[1].trim(),
      responseText: anotherAlternativeMatch[2].trim(),
    };
  }

  return null;
}

export async function generateResponseForTweet(
  tweetId: string,
  tweetText: string,
  engagementType: string,
  accountId: string
) {
  try {
    const description = await fetchAppPainpoint(accountId);

    const aiResponse = await processTweetWithAI(
      tweetText,
      engagementType.toLowerCase()
    );

    console.log("AI response:", aiResponse);
    const responsesArray = aiResponse
      .split("\n")
      .map((line) => {
        // Match both formats
        const match =
          line.match(/^\d+\. \*\*(.+?)\*\*: (.+)$/) ||
          line.match(/^\d+\. \[(.+?)\]: (.+)$/) ||
          line.match(/^\d+\. (.+?): (.+)$/);
        return match
          ? {
              responseType: match[1].trim(),
              responseText: match[2].trim().replace(/^"|"$/g, ""),
            }
          : null;
      })
      .filter(Boolean) as { responseType: string; responseText: string }[];

    const response = await db.$transaction(
      responsesArray.map(({ responseText, responseType }) =>
        db.generatedTweetResponse.create({
          data: {
            tweetId,
            response: responseText,
            engagementType:
              enumEngagementTypeMapping[engagementType.toLowerCase()],
            responseType,
          },
        })
      )
    );
    return response;
  } catch (error) {
    console.log(`Error generating response for tweet ${tweetId}:`, error);
    throw error;
  }
}

async function fetchLatestTweets(twitterAccountId: string) {
  return await db.tweet.findMany({
    where: {
      twitterAccountId,
      isRetweet: false,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });
}

function getTopTweets(tweets: any[]) {
  tweets.sort((a, b) => {
    const aImpressions =
      a.impressionCount +
      a.likeCount +
      a.retweetCount +
      a.replyCount +
      a.quoteCount;

    const bImpressions =
      b.impressionCount +
      b.likeCount +
      b.retweetCount +
      b.replyCount +
      b.quoteCount;
    return bImpressions - aImpressions;
  });
  return tweets.slice(0, 10);
}

export async function generateResponsesForTopTweets(userId: string) {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { userId, status: "ACTIVE" },
    });

    if (twitterAccounts.length === 0) {
      console.log("No active Twitter accounts found.");
      return;
    }
    const engagementTypes = [
      EngagementType.AUTHORITY,
      EngagementType.EMPATHY,
      EngagementType.SOLUTION,
      EngagementType.HUMOR,
      EngagementType.QUESTION,
      EngagementType.CONTRARIAN,
      EngagementType.TREND,
      EngagementType.WHAT_IF,
    ];

    for (const account of twitterAccounts) {
      const latestTweets = await fetchLatestTweets(account.id);
      const bestTweets = getTopTweets(latestTweets);

      for (let i = 0; i < bestTweets.length; i++) {
        const tweet = bestTweets[i];
        const engagementType = engagementTypes[i % engagementTypes.length];

        const {
          id: tweetId,
          text: tweetText,
          twitterAccountId: accountId,
        } = tweet;

        try {
          console.log(
            `Processing tweet ${tweetId} with engagement type ${engagementType}...`
          );
          await generateResponseForTweet(
            tweetId,
            tweetText,
            engagementType,
            accountId
          );
          console.log(
            `Successfully generated response for tweet ${tweetId} with engagement type ${engagementType}.`
          );
        } catch (err) {
          console.log(
            `Error processing tweet ${tweetId} with engagement type ${engagementType}:`,
            err
          );
        }
      }
    }
  } catch (err) {
    console.log("Error in cron job:", err);
  }
}
