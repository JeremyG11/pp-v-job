import { tool } from "@langchain/core/tools";
import { TweetRelevanceSchema, updateKeywordGraphSchema } from "@/schemas";

/**
 * Grades the relevance of tweets to a business description and keywords.
 * Outputs relevance scores and grades.
 * @param input - The input data for the tool.
 * @returns The relevance scores and grades of the tweets.
 * @throws An error if there is a problem grading the tweets.
 */

export const tweetRelevanceTool = tool(
  async (input) => {
    try {
      const tweets = input.tweets;
      const businessDescription = input.businessDescription;
      const keywords = input.keywords;

      const results = tweets.map((tweet) => {
        const relevanceScore = calculateRelevance(
          tweet,
          businessDescription,
          keywords
        );
        return {
          tweet,
          relevanceScore,
        };
      });

      return JSON.stringify(results, null, 2);
    } catch (e: any) {
      console.warn("Error grading tweets", e.message);
      return `An error occurred while grading tweets: ${e.message}`;
    }
  },
  {
    name: "tweet_relevance",
    description:
      "Grades the relevance of tweets to a business description and keywords. Outputs relevance scores and grades.",
    schema: TweetRelevanceSchema,
  }
);

/**
 * Calculates the relevance of a tweet to a business description and keywords.
 * @param tweetText - The text of the tweet to analyze.
 * @param businessDescription - A detailed description of the business.
 * @param keywords - A list of keywords associated with the business.
 * @returns The relevance score of the tweet.
 */
function calculateRelevance(
  tweetText: string,
  businessDescription: string,
  keywords: string[]
) {
  // Placeholder logic for calculating relevance score
  const lowerTweet = tweetText.toLowerCase();
  const lowerDescription = businessDescription.toLowerCase();
  const keywordMatches = keywords.filter((kw) =>
    lowerTweet.includes(kw.toLowerCase())
  ).length;

  const descriptionRelevance = lowerTweet.includes(lowerDescription) ? 1 : 0;
  return descriptionRelevance + keywordMatches;
}

/**
 * Refines the keyword graph based on tweet relevance suggestions.
 * Outputs the original and updated graph.
 * @param input - The input data for the tool.
 * @returns The original and updated keyword graph.
 * @throws An error if there is a problem updating the keyword graph.
 */
const updateKeywordGraphTool = tool(
  async (input) => {
    try {
      const keywords = input.keywords;
      const suggestion = input.suggestion;

      const updatedGraph = suggestion.includes("refining")
        ? refineKeywordGraph(keywords)
        : keywords;

      return JSON.stringify(
        {
          originalKeywords: keywords,
          updatedGraph,
        },
        null,
        2
      );
    } catch (e: any) {
      console.log("Error updating keyword graph", e.message);
      return `An error occurred while updating the keyword graph: ${e.message}`;
    }
  },
  {
    name: "update_keyword_graph",
    description:
      "Refines the keyword graph based on tweet relevance suggestions. Outputs the original and updated graph.",
    schema: updateKeywordGraphSchema,
  }
);

function refineKeywordGraph(keywords: string[]) {
  // Placeholder logic for refining the keyword graph
  return keywords.map((kw) => `${kw}-refined`);
}

export const ALL_TOOLS_LIST = [tweetRelevanceTool, updateKeywordGraphTool];
