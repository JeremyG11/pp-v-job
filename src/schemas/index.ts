import { z } from "zod";

export const TweetRelevanceResultSchema = z.object({
  averageScore: z
    .number()
    .describe("The average relevance score calculated from the tweets."),
  tweets: z
    .array(
      z.object({
        tweet: z.string().describe("The tweet text."),
        relevanceScore: z
          .number()
          .describe("The computed relevance score for the tweet."),
      })
    )
    .describe(
      "An array of tweet analysis results with their relevance scores."
    ),

  businessDescription: z.string().describe("The business description."),
  keywords: z.array(z.string()).describe("The current list of keywords."),
});

export const UpdateKeywordGraphResultSchema = z.object({
  originalKeywords: z
    .array(z.string())
    .describe("The original list of keywords."),
  updatedGraph: z
    .array(z.string())
    .describe("The updated/refined list of keywords."),
});

export type UpdateKeywordGraphResult = z.infer<
  typeof UpdateKeywordGraphResultSchema
>;

export const ExtendedUpdateKeywordGraphSchema = z.object({
  averageScore: z
    .number()
    .describe("The average relevance score calculated from the tweets."),
  keywords: z.array(z.string()).describe("Current list of keywords."),
  suggestion: z.string().describe("A suggestion string, e.g., 'refining'."),
  businessDescription: z.string().describe("The business description text."),
  tweets: z
    .array(z.string())
    .describe("An array of tweet texts, e.g. a summary of returned tweets."),
});

export type TweetRelevanceResult = z.infer<typeof TweetRelevanceResultSchema>;
