import { connectToMongoDB } from "@/lib/vectorUtils";
import { TweetEmbedding } from "./model";

/**
 * Searches for tweets using a hybrid approach (Keyword + Vector Search).
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
          index: "memory_vector_index",
          compound: {
            should: [
              {
                text: {
                  query,
                  path: "tweetText",
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

    return hybridResults.map((tweet) => ({
      tweetId: tweet.tweetId,
      text: tweet.tweetText,
      similarity: tweet._score,
    }));
  } catch (error) {
    console.error("❌ Error retrieving hybrid tweets:", error);
    throw new Error("Failed to search for hybrid tweets.");
  }
};
