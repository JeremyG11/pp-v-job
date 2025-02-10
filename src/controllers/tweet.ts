import OpenAI from "openai";
import { db } from "@/lib/db";
import { Request, Response } from "express";
import { EngagementType, PainPoint } from "@prisma/client";
import { assistantMapping } from "@/config/env";

// OpenAI client initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * Renders a system message template by replacing placeholders with dynamic values.
 */
function renderSystemMessage(
  template: string,
  values: {
    name: string;
    businessType: string;
    siteSummary: string;
    businessRole: string;
    brandingKeywords: string;
    keywords: string;
    engagementType: string;
    tweetText: string;
  }
): string {
  return template
    .replace(/\$\{name\}/g, values.name)
    .replace(/\$\{businessType\}/g, values.businessType)
    .replace(/\$\{siteSummary\}/g, values.siteSummary)
    .replace(/\$\{businessRole\}/g, values.businessRole)
    .replace(/\$\{brandingKeywords\}/g, values.brandingKeywords)
    .replace(/\$\{keywords\}/g, values.keywords)
    .replace(/\$\{engagementType\}/g, values.engagementType)
    .replace(/\$\{tweetText\}/g, values.tweetText);
}

/**
 * Retrieves the assistant's system message template and renders it with dynamic values.
 */
async function fetchAndRenderSystemMessage(
  assistantId: string,
  business: PainPoint,
  engagementType: EngagementType,
  tweetText: string
): Promise<string> {
  const myAssistant = await openai.beta.assistants.retrieve(assistantId);

  const systemTemplate = myAssistant.instructions;

  return renderSystemMessage(systemTemplate, {
    name: business.name,
    businessType: business.businessType,
    siteSummary: business.siteSummary,
    businessRole: business.businessRole,
    brandingKeywords: business.brandingKeywords.join(", "),
    keywords: business.keywords.join(", "),
    engagementType: engagementType.toLowerCase(),
    tweetText,
  });
}

/**
 * Creates a new thread and sends initial messages:
 * - The rendered system message (as an assistant message).
 * - The tweet text as a user message.
 */
async function createThreadWithMessages(
  renderedSystemMessage: string,
  tweetText: string
): Promise<string> {
  const thread = await openai.beta.threads.create();

  // Send the rendered system message as an assistant message.
  await openai.beta.threads.messages.create(thread.id, {
    role: "assistant",
    content: renderedSystemMessage,
  });

  // Send the tweet text as a user message.
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: tweetText,
  });

  return thread.id;
}

/**
 * Starts a run on the thread and polls until the run is completed.
 */
async function startRunAndPoll(
  threadId: string,
  assistantId: string,
  business: PainPoint
): Promise<void> {
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
    metadata: {
      business_name: business.name,
      business_role: business.businessRole,
    },
  });

  let attempts = 0;
  while (attempts++ < 30) {
    const status = await openai.beta.threads.runs.retrieve(threadId, run.id);
    if (status.status === "completed") return;
    if (status.status === "failed") {
      throw new Error("AI processing failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("AI run did not complete within the expected time");
}

/**
 * Retrieves and returns the assistant's response text from the thread.
 */
async function getResponseFromThread(threadId: string): Promise<string> {
  const messages = await openai.beta.threads.messages.list(threadId);
  const responseMessage = messages.data.find((m) => m.role === "assistant")
    ?.content[0];
  if (!responseMessage || !("text" in responseMessage)) {
    throw new Error("No valid response generated");
  }
  return responseMessage.text.value;
}

/**
 * Optionally applies post-processing filters to the response text.
 */
function applyPostFilters(text: string, business: PainPoint): string {
  const forbiddenTerms = [" proprietary", " our platform"];
  let filtered = text;
  forbiddenTerms.forEach((term) => {
    filtered = filtered.replace(new RegExp(term, "gi"), `[${business.name}]`);
  });
  return filtered;
}

/**
 * Orchestrates the entire process of handling a tweet:
 * - Renders the system message.
 * - Creates a thread with the proper messages.
 * - Starts the run and polls for its completion.
 * - Retrieves and post-processes the assistant's response.
 */
async function processTweetWithAI(
  tweetText: string,
  engagementType: EngagementType,
  business: PainPoint
): Promise<string> {
  const assistantId = assistantMapping[engagementType.toLowerCase()];
  if (!assistantId) {
    throw new Error(`Unsupported engagement type: ${engagementType}`);
  }

  // Fetch and render the dynamic system message.
  const renderedSystemMessage = await fetchAndRenderSystemMessage(
    assistantId,
    business,
    engagementType,
    tweetText
  );

  // Create a thread and send the system and user messages.
  const threadId = await createThreadWithMessages(
    renderedSystemMessage,
    tweetText
  );

  // Start the run and poll until it completes.
  await startRunAndPoll(threadId, assistantId, business);

  // Retrieve the assistant's response.
  const responseText = await getResponseFromThread(threadId);

  // post-processing filters.
  return applyPostFilters(responseText, business);
}

/**
 * Express controller for processing incoming tweet requests and saving generated responses.
 */
export const TweetsController = async (req: Request, res: Response) => {
  try {
    const { accountId, tweetId, tweetText, engagementType } = req.body;
    if (!accountId || !tweetId || !tweetText || !engagementType) {
      res.status(400).json({ error: "Missing required parameters." });
      return;
    }

    // Retrieve tweet and related account/pain point info.
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

    // Process the tweet using the AI assistant.
    const aiResponse = await processTweetWithAI(
      tweetText,
      engagementType,
      appPainpoint
    );
    console.log("AI response:", aiResponse);

    // Parse the AI response into an array of response options.
    type Response = {
      "Response Type": string;
      "Response Text": string;
    };

    const responsesArray: { responseType: string; responseText: string }[] =
      JSON.parse(aiResponse).responses.map((response: Response) => ({
        responseType: response["Response Type"],
        responseText: response["Response Text"],
      }));

    // Save generated responses within a transaction.
    await db.$transaction(
      responsesArray.map(({ responseText, responseType }) =>
        db.generatedTweetResponse.create({
          data: {
            tweetId,
            response: responseText,
            engagementType,
            responseType,
          },
        })
      )
    );

    console.log("Generated responses:", responsesArray);

    res.status(200).json({
      message: "Generated responses successfully.",
      responses: responsesArray,
    });
  } catch (error) {
    console.log("TweetsController error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
