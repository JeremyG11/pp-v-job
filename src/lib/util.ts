import { Pool } from "pg";
import OpenAI from "openai";
import dotenv from "dotenv";

import { db } from "../lib/db";
dotenv.config();

export const getUserTimezone = async (userId: string): Promise<string> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  return user?.timezone || "UTC";
};

// Initialize PostgreSQL connection pool
export const _pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  } catch (error: any) {
    console.error("❌ Error generating embeddings:", error.message);
    throw new Error("Failed to generate embeddings.");
  }
};

export const storeBatchTweetEmbeddings = async (
  tweetEmbeddings: { tweetId: string; tweetText: string; embedding: number[] }[]
) => {
  try {
    // Perform individual upserts.
    for (const { tweetId, tweetText, embedding } of tweetEmbeddings) {
      const embeddingLiteral = formatEmbedding(embedding);
      await _pool.query(
        `INSERT INTO tweet_embeddings (tweet_id, tweet_text, embedding) 
         VALUES ($1, $2, $3::vector)
         ON CONFLICT (tweet_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
        [tweetId, tweetText, embeddingLiteral]
      );
    }
    console.log(`✅ Stored ${tweetEmbeddings.length} tweet embeddings.`);
  } catch (error: any) {
    console.error(
      "❌ Error storing batch embeddings for tweet ID:",
      error.message
    );
    throw new Error("Failed to store embeddings.");
  }
};

const formatEmbedding = (embedding: number[]): string => {
  return `[${embedding.join(",")}]`;
};

/**
 * Searches for tweets using a hybrid approach (Keyword + Vector).
 * Uses pgvector’s ANN operator (<=>) to compare embeddings.
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
    // Convert the business embedding to a vector literal string.
    const businessEmbeddingLiteral = formatEmbedding(businessEmbedding);
    const { rows } = await _pool.query(
      `SELECT tweet_id, tweet_text, embedding <=> $1::vector AS similarity 
       FROM tweet_embeddings 
       ORDER BY similarity ASC 
       LIMIT $2`,
      [businessEmbeddingLiteral, limit]
    );

    return rows.map((row) => ({
      tweetId: row.tweet_id,
      text: row.tweet_text,
      similarity: row.similarity,
    }));
  } catch (error: any) {
    console.log("❌ Error retrieving hybrid tweets:", error.message);
    throw new Error("Failed to search for hybrid tweets.");
  }
};
