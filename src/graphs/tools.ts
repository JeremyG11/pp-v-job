import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createBatchEmbeddings, searchHybridTweets } from "@/lib/util";
import {
  ExtendedUpdateKeywordGraphSchema,
  TweetRelevanceResultSchema,
} from "@/schemas";

export const tweetRelevanceTool = tool(
  async (input) => {
    try {
      const businessDescription = input.businessDescription;
      const [businessEmbedding] = await createBatchEmbeddings([
        businessDescription,
      ]);

      // Call searchHybridTweets which leverages pgvector's ANN operator
      const similarTweets = await searchHybridTweets(
        businessDescription,
        businessEmbedding,
        50
      );

      // Map the results to our desired format
      const tweetResults = similarTweets.map((tweet) => ({
        tweet: tweet.text,
        relevanceScore: tweet.similarity,
      }));

      // Calculate the average relevance score
      const totalScore = tweetResults.reduce(
        (acc, tweet) => acc + tweet.relevanceScore,
        0
      );
      const averageScore =
        tweetResults.length > 0 ? totalScore / tweetResults.length : 0;

      return {
        averageScore,
        tweets: tweetResults,
      };
    } catch (error: any) {
      console.error("Error in tweet_relevance tool:", error.message);
      throw new Error("Failed to grade tweet relevance.");
    }
  },
  {
    name: "tweet_relevance",
    description:
      "Analyzes and ranks the relevance of tweets with respect to a provided business description. " +
      "It returns both an average relevance score and a list of tweets with their corresponding relevance scores.",
    schema: TweetRelevanceResultSchema,
  }
);

export const updateKeywordGraphTool = tool(
  async (input) => {
    try {
      const {
        keywords,
        suggestion,
        businessDescription,
        tweets,
        averageScore,
      } = input;

      // If suggestion does not include "refining", return the current keywords.
      if (!suggestion.includes("refining")) {
        return JSON.stringify(
          {
            originalKeywords: keywords,
            updatedGraph: keywords,
          },
          null,
          2
        );
      }

      const promptTemplateStr = `You are a social media expert. Your task is to generate exactly 5 short keywords (each 1-2 words) for targeted Twitter queries based on the context below.

                                Business Description:
                                {businessDescription}

                                Existing Keywords:
                                {existingKeywords}

                                Returned Tweets:
                                {tweets}

                                Average Relevance Score: {averageScore}

                                Output:
                                Return a JSON array of exactly 5 strings.
                                Example: ["patents", "innovation", "alerts", "search", "trends"]

                                Do not include any extra text.`;

      // Create a ChatPromptTemplate from the template string.
      const promptTemplate = ChatPromptTemplate.fromTemplate(promptTemplateStr);

      // Create an LLM instance.
      const llm = new ChatOpenAI({
        model: "gpt-4o",
        temperature: 0.7,
      });

      // Chain the prompt with the LLM using the pipe() method.
      const chain = promptTemplate.pipe(llm);

      // Invoke the chain with the required parameters.
      const chainResponse = await chain.invoke({
        businessDescription,
        existingKeywords: keywords.join(", "),
        tweets: tweets.join("\n"),
        averageScore: averageScore.toFixed(2),
      });

      // Parse the chain's output (expected to be a JSON array as a string).
      const refinedKeywords = JSON.parse(chainResponse.text) as string[];

      return JSON.stringify(
        {
          originalKeywords: keywords,
          updatedGraph: refinedKeywords,
        },
        null,
        2
      );
    } catch (e: any) {
      console.error("Error updating keyword graph:", e.message);
      return `An error occurred while updating the keyword graph: ${e.message}`;
    }
  },
  {
    name: "update_keyword_graph",
    description:
      "Refines the keyword graph using the current keywords, business description, and tweet analysis. " +
      "Call this tool with the current keywords, a suggestion (e.g., 'refining'), the business description, and the returned tweets.",
    schema: ExtendedUpdateKeywordGraphSchema,
  }
);

//
export async function generateRefinedKeywords(
  businessDescription: string,
  existingKeywords: string[],
  tweets: string[],
  averageScore: number
): Promise<string[]> {
  const promptStr = `You are a social media expert. Your task is to generate exactly 5 short keywords (each 1-2 words) for targeted Twitter queries based on the context below.

Business Description:
${businessDescription}

Existing Keywords:
${existingKeywords.join(", ")}

Returned Tweets:
${tweets.join("\n")}

Average Relevance Score: ${averageScore.toFixed(2)}

Output:
Return a JSON array of exactly 5 strings.
Example: ["patents", "innovation", "alerts", "search", "trends"]

Do not include any extra text.`;

  const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.7,
  });

  const response: AIMessage = await llm.invoke([
    { role: "system", content: promptStr },
  ]);
  console.log("LLM Response Content:", response.content);

  let keywords: string[] = [];
  try {
    if (typeof response.content === "string") {
      keywords = JSON.parse(response.content);
    } else {
      console.error("Response content is not a string:", response.content);
    }
  } catch (e) {
    console.error("Failed to parse generated keywords as JSON:", e);
  }

  console.log("🔑 Generated keywords:", keywords);
  return keywords;
}

export const ALL_TOOLS_LIST = [tweetRelevanceTool, updateKeywordGraphTool];
