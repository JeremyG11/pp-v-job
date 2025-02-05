import OpenAI from "openai";
import { db } from "@/lib/db";
import { assistantMapping } from "@/config/env";
import { EngagementType, Tweet } from "@prisma/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a ** 2, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b ** 2, 0));

  return magA === 0 || magB === 0 ? 0 : dotProduct / (magA * magB);
}

async function getEmbeddings(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    input: text,
    model: "text-embedding-3-small",
  });
  return response.data[0].embedding;
}

/**
 * @param tweetText  The text of the tweet
 * @param engagementType  The type of engagement
 * @returns  The response from the AI assistant
 */ async function processTweetWithAI(
  tweetText: string,
  engagementType: string,
  BusinessName: string
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
      **five diverse responses** based on the following engagement type:
      
      Engagement Type: ${normalizedEngagementType}
      Tweet: "${tweetText}"
      Business Name: "${BusinessName}"

      Please provide **five unique responses**, **mention #${BusinessName} when neccessary as mean of promotion **, each formatted as follows:

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

  return appPainpoint;
}

export async function generateResponseForTweet(
  tweetId: string,
  tweetText: string,
  engagementType: string,
  accountId: string
) {
  try {
    const painPoint = await fetchAppPainpoint(accountId);

    const aiResponse = await processTweetWithAI(
      tweetText,
      engagementType.toLowerCase(),
      painPoint.name
    );

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

    const response = await db.generatedTweetResponse.createMany({
      data: responsesArray.map(({ responseText, responseType }) => ({
        tweetId,
        response: responseText,
        responseType,
        engagementType: engagementType as EngagementType,
      })),
    });

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

async function getTopTweets(tweets: Tweet[], appDescription: string) {
  if (tweets.length === 0) return [];

  try {
    // Get embeddings for app description and tweets
    const appDescriptionEmbedding = await getEmbeddings(appDescription);
    const tweetEmbeddings = await Promise.all(
      tweets.map((tweet) => getEmbeddings(tweet.text))
    );

    // Calculate relevance scores
    const rankedTweets = await Promise.all(
      tweets.map(async (tweet, i) => {
        const cosine = cosineSimilarity(
          appDescriptionEmbedding,
          tweetEmbeddings[i]
        );
        const jaccard = jaccardSimilarity(appDescription, tweet.text);
        const oocPenalty = await calculateOOCPenalty(
          tweet.text,
          appDescription
        );

        const relevanceScore =
          0.85 * cosine + 0.05 * jaccard - 0.1 * oocPenalty;
        return {
          ...tweet,
          relevanceScore,
        };
      })
    );

    // Sort and return top 10 tweets
    return rankedTweets
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);
  } catch (error) {
    console.log("Error ranking tweets:", error);
    return [];
  }
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
      const painPoint = await fetchAppPainpoint(account.id);
      const latestTweets = await fetchLatestTweets(account.id);
      const bestTweets = await getTopTweets(
        latestTweets,
        painPoint.siteSummary
      );

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

async function calculateOOCPenalty(
  text: string,
  appDescription: string
): Promise<number> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a text analysis assistant. Your task is to identify words or phrases in the input text that are unrelated to the following app/business description: "${appDescription}". Return a score between 0 and 1, where 0 means no out-of-context words and 1 means all words are out-of-context.

        Examples:
        1. App/business Description: "A social media management tool for businesses."
          Input: "I love pizza and social media marketing."
          Output: 0.5 (50% of words are out-of-context)

        2. App/business Description: "An analytics platform for e-commerce businesses."
          Input: "The weather is nice, and our sales are growing."
          Output: 0.3 (30% of words are out-of-context)

        3. App/business Description: "A project management tool for remote teams."
          Input: "Let's grab coffee and discuss our project deadlines."
          Output: 0.2 (20% of words are out-of-context)

        Now, process the following text: "${text}"`,
        },
      ],
      max_tokens: 10,
    });

    const score = parseFloat(response.choices[0].message.content);
    return isNaN(score) ? 0 : score;
  } catch (error) {
    console.error("Failed to calculate OOC penalty:", error);
    return 0;
  }
}

function jaccardSimilarity(textA: string, textB: string): number {
  const setA = new Set(textA.toLowerCase().split(" "));
  const setB = new Set(textB.toLowerCase().split(" "));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  return intersection.size / (setA.size + setB.size - intersection.size);
}
