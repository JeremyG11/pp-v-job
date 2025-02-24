import OpenAI from "openai";
import { db } from "@/lib/db";
import { assistantMapping } from "@/config/env";
import { processTweetWithAI } from "@/controllers/tweet";
import { EngagementType, PainPoint, Tweet } from "@prisma/client";

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
  engagementType: EngagementType,
  accountId: string
) {
  try {
    const painPoint = await fetchAppPainpoint(accountId);

    const aiResponse = await processTweetWithAI(
      tweetText,
      engagementType,
      painPoint
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
        if (!appDescriptionEmbedding || !tweetEmbeddings[i]) {
          console.warn(`Invalid embeddings for tweet ${tweet.id}`);
          return { ...tweet, relevanceScore: 0 };
        }

        const cosine =
          cosineSimilarity(appDescriptionEmbedding, tweetEmbeddings[i]) || 0;
        const jaccard = jaccardSimilarity(appDescription, tweet.text) || 0;
        const oocPenalty =
          (await calculateOOCPenalty(tweet.text, appDescription)) || 0;

        const relevanceScore =
          0.85 * cosine + 0.05 * jaccard - 0.1 * oocPenalty;

        console.log(
          `Tweet ID: ${tweet.id}, Relevance Score: ${relevanceScore}`
        );

        return {
          ...tweet,
          relevanceScore,
        };
      })
    );

    // Batch update relevance scores in the database
    const updates = rankedTweets.map((tweet) =>
      db.tweet.update({
        where: { id: tweet.id },
        data: { relevanceScore: tweet.relevanceScore },
      })
    );

    await Promise.all(updates);

    // Sort and return top 10 tweets
    return rankedTweets
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, 10);
  } catch (error) {
    console.error("Error ranking tweets:", error);
    return [];
  }
}

async function recommendEngagementType(
  tweetText: string,
  business: PainPoint
): Promise<EngagementType> {
  try {
    const thread = await openai.beta.threads.create();

    const { name, businessType, description, businessRole, keywords } =
      business;

    const prompt = `
      Analyze the following tweet and business description, and recommend the best engagement type. Choose from: AUTHORITY, EMPATHY, SOLUTION, HUMOR, QUESTION, CONTRARIAN, TREND, WHAT_IF.

      Tweet: "${tweetText}"
      Business Description: "${description}"
      Business Name: "${name}"
      Business Type: "${businessType}"
      Business Role: "${businessRole}"
      Keywords: "${keywords}"
      

      Consider the following:
      - The tweet's sentiment and intent.
      - The business's goals and target audience.
      - The most effective way to engage with the tweet.

      Respond with ONLY the engagement type provided (e.g., "HUMOR").
    `;

    // Add the user message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: prompt,
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantMapping["ai_recommended"],
    });

    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (runStatus.status !== "completed");

    const messages = await openai.beta.threads.messages.list(thread.id);

    const assistantResponse = messages.data[0]?.content[0];

    let recommendedType = EngagementType.SOLUTION;

    if ("text" in assistantResponse) {
      try {
        // ✅ Parse JSON response
        const parsedResponse = JSON.parse(assistantResponse.text.value.trim());

        if (parsedResponse.engagementType in EngagementType) {
          recommendedType = parsedResponse.engagementType;
        } else {
          console.warn(
            `Invalid engagement type received: "${parsedResponse.engagementType}". Defaulting to SOLUTION.`
          );
        }
      } catch (err) {
        console.warn(
          "Failed to parse assistant response. Defaulting to SOLUTION."
        );
      }
    }

    return recommendedType;
  } catch (error: any) {
    console.error(
      "Error recommending engagement type:",
      error.response ?? error
    );
    return EngagementType.SOLUTION;
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

    for (const account of twitterAccounts) {
      const painPoint = await fetchAppPainpoint(account.id);
      const latestTweets = await fetchLatestTweets(account.id);
      const bestTweets = await getTopTweets(
        latestTweets,
        painPoint.siteSummary
      );

      for (let i = 0; i < bestTweets.length; i++) {
        const tweet = bestTweets[i];

        // Use AI to recommend the best engagement type for this tweet
        const engagementType = await recommendEngagementType(
          tweet.text,
          painPoint
        );

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

async function getBusinessContext(twitterAccountId: string) {
  return await db.painPoint.findUnique({
    where: { twitterAccountId },
    select: {
      name: true,
      businessType: true,
      businessRole: true,
      brandingKeywords: true,
      keywords: true,
    },
  });
}
