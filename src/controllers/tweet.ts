import OpenAI from "openai";
import { db } from "@/lib/db";
import { Request, Response } from "express";
import { assistantMapping } from "@/config/env";
import { EngagementType } from "@prisma/client";

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * @param tweetText  The text of the tweet
 * @param engagementType  The type of engagement
 * @returns  The response from the AI assistant
 */ async function processTweetWithAI(
  tweetText: string,
  engagementType: EngagementType,
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

      Please provide **five unique responses**, **mention #${BusinessName} when neccessary**, each formatted as follows:

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

export const TweetsController = async (req: Request, res: Response) => {
  try {
    const { accountId, tweetId, tweetText, engagementType } = await req.body;

    if (!accountId || !tweetId || !tweetText || !engagementType) {
      res.status(400).json({ error: "Missing required parameters." });
      return;
    }

    const tweet = await db.tweet.findFirst({ where: { id: tweetId } });
    if (!tweet) throw new Error(`Tweet with ID ${tweetId} not found.`);

    const twitterAccount = await db.twitterAccount.findFirst({
      where: { id: accountId },
    });
    if (!twitterAccount)
      throw new Error(`Twitter account with ID ${accountId} not found.`);

    const appPainpoint = await db.painPoint.findFirst({
      where: { twitterAccountId: accountId },
    });
    if (!appPainpoint || appPainpoint.siteSummary === "N/A") {
      throw new Error("App's pain point is not properly configured.");
    }
    const aiResponse = await processTweetWithAI(
      tweetText,
      engagementType,
      appPainpoint.name
    );

    const responsesArray = aiResponse
      .split("\n")
      .map((line) => {
        // Match all formats
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

    await db.$transaction(
      responsesArray.map(({ responseText, responseType }) =>
        db.generatedTweetResponse.create({
          data: {
            tweetId,
            response: responseText,
            engagementType: engagementType,
            responseType,
          },
        })
      )
    );

    res.status(200).json({
      message: "Generated responses successfully.",
      responses: responsesArray,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).send("Internal Server Error");
    return;
  }
};
