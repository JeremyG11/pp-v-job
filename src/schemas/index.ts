import z from "zod";

export const TweetRelevanceSchema = z.object({
  businessDescription: z
    .string()
    .describe("A detailed description of the business."),
  keywords: z
    .array(z.string())
    .describe("A list of keywords associated with the business."),
  tweets: z.array(z.string()).describe("An array of tweets to analyze."),
});

export const updateKeywordGraphSchema = z.object({
  keywords: z
    .array(z.string())
    .describe("A list of keywords associated with the business."),
  suggestion: z
    .string()
    .describe("Suggestion for improving keyword relevance."),
});
