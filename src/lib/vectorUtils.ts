import OpenAI from "openai";
import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import { TweetEmbedding } from "./mongoDB/model";

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Establish MongoDB connection if not already connected.
 */
export const connectToMongoDB = async (): Promise<MongoClient> => {
  if (mongoose.connection.readyState === 1) return;

  try {
    await mongoose.connect(process.env.MONGODB_URI as string, {
      dbName: "yourDatabaseName",
    });
    console.log("✅ Connected to MongoDB.");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    throw new Error("Failed to connect to MongoDB.");
  }
};

/**
 * Generates embeddings for multiple texts in parallel.
 * Uses OpenAI API to create vector embeddings.
 * @param texts - An array of input texts.
 * @returns A list of float array embeddings.
 */
export const createBatchEmbeddings = async (
  texts: string[]
): Promise<number[][]> => {
  if (!texts.length) throw new Error("No text provided for embedding.");

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: texts,
    });

    return response.data.map((d) => d.embedding);
  } catch (error) {
    console.error("❌ Error generating embeddings:", error);
    throw new Error("Failed to generate embeddings.");
  }
};

/**
 * Stores or updates tweet embeddings in MongoDB in batch.
 * @param tweetEmbeddings - Array of { tweetId, embedding }
 */
export const storeBatchTweetEmbeddings = async (
  tweetEmbeddings: { tweetId: string; embedding: number[] }[]
) => {
  try {
    await connectToMongoDB();

    const bulkOps = tweetEmbeddings.map(({ tweetId, embedding }) => ({
      updateOne: {
        filter: { tweetId },
        update: { embedding },
        upsert: true, // Insert if not exists
      },
    }));

    await TweetEmbedding.bulkWrite(bulkOps);
    console.log(`✅ Stored ${tweetEmbeddings.length} tweet embeddings.`);
  } catch (error) {
    console.error("❌ Error storing batch embeddings:", error);
    throw new Error("Failed to store embeddings.");
  }
};

/**
 * Searches for tweets using a hybrid approach (Keyword + Vector).
 * Uses MongoDB Atlas `$search` and `$vectorSearch`.
 * @param query - The user query (text-based).
 * @param businessEmbedding - The business profile embedding.
 * @param limit - Number of similar tweets to return.
 */
export const searchHybridTweets = async (
  query: string,
  businessEmbedding: number[],
  limit: number = 5
) => {
  try {
    await connectToMongoDB();

    const hybridResults = await TweetEmbedding.aggregate([
      {
        $search: {
          index: "vector_index", // Must match MongoDB Atlas Index
          compound: {
            should: [
              {
                text: {
                  query,
                  path: "tweetText", // Ensure this matches your database field
                  score: { boost: { value: 2 } },
                },
              },
              {
                knnBeta: {
                  path: "embedding",
                  queryVector: businessEmbedding,
                  k: 100,
                  numCandidates: 200,
                },
              },
            ],
          },
        },
      },
      {
        $limit: limit,
      },
    ]);

    return hybridResults.map((tweet: any) => ({
      tweetId: tweet.tweetId,
      text: tweet.tweetText,
      similarity: tweet._score,
    }));
  } catch (error) {
    console.error("❌ Error retrieving hybrid tweets:", error);
    throw new Error("Failed to search for hybrid tweets.");
  }
};
