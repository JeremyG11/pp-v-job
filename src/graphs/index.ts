import { db } from "@/lib/db";
import { TweetAccountStatus } from "@prisma/client";
import { ChatOpenAI } from "@langchain/openai";
import {
  StateGraph,
  Annotation,
  MessagesAnnotation,
  END,
  START,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { TtweetRelevanceResult } from "@/types";
import { ALL_TOOLS_LIST, tweetRelevanceTool } from "./tools";

//
// --- Constants & Configurations ---
//
const RELEVANCE_THRESHOLD = 2; // Threshold to trigger keyword refinement

//
// --- Define LangChain Graph Annotations & Memory ---
//
const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  tweetRelevanceResult: Annotation<TtweetRelevanceResult>(),
  updateKeywordGraphResult: Annotation<unknown>(),
});

//
// --- LLM & Tool Setup ---
//
const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
});

const toolsNode = new ToolNode(ALL_TOOLS_LIST);

//
// --- Function to Call LLM with Memory Integration ---
//
const callModel = async (state: typeof GraphAnnotation.State) => {
  try {
    const { messages } = state;

    const systemMessage = {
      role: "system",
      content:
        "You're an expert analyst who evaluates tweet relevance to business descriptions and updates keyword graphs as needed.",
    };

    const llmWithTools = llm.bindTools(ALL_TOOLS_LIST);
    const result = await llmWithTools.invoke([systemMessage, ...messages]);

    return { messages: result };
  } catch (error) {
    console.error("Error in callModel:", error);
    throw new Error("Failed to process LLM request.");
  }
};

//
// --- Decision Function for Feedback Loop ---
//
const shouldRefineKeywords = (state: typeof GraphAnnotation.State) => {
  try {
    const { messages, tweetRelevanceResult } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    if (lastMessage._getType() !== "ai" || !lastMessage.tool_calls?.length) {
      return END;
    }

    if (tweetRelevanceResult?.result) {
      const results = JSON.parse(tweetRelevanceResult.result);
      const avgScore =
        results.reduce(
          (acc: number, curr: { relevanceScore: number }) =>
            acc + curr.relevanceScore,
          0
        ) / results.length;

      if (avgScore < RELEVANCE_THRESHOLD) {
        return "update_keyword";
      }
    }
    return END;
  } catch (error) {
    console.error("Error in shouldRefineKeywords:", error);
    return END;
  }
};

//
// --- Keyword Refinement Process ---
//
const updateKeywords = async (state: typeof GraphAnnotation.State) => {
  try {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    if (lastMessage._getType() !== "ai") {
      throw new Error("Expected the last message to be an AI message");
    }

    // Find the tool call for keyword graph update
    const updateKeywordsToolCall = lastMessage.tool_calls?.find(
      (tc) => tc.name === "update_keyword_graph"
    );

    if (!updateKeywordsToolCall) {
      throw new Error(
        "Expected an `update_keyword_graph` tool call in the last AI message"
      );
    }

    const { args } = updateKeywordsToolCall;
    console.log("Updating keywords with arguments:", args);

    const updatedKeywords = args.keywords?.map((kw: string) => `${kw}-refined`);
    console.log("Updated Keywords:", updatedKeywords);

    return updatedKeywords;
  } catch (error) {
    console.error("Error in updateKeywords:", error);
    throw new Error("Keyword refinement failed.");
  }
};

//
// --- Construct LangChain Workflow Graph ---
//
const workflow = new StateGraph(GraphAnnotation)
  .addNode("agent", callModel)
  .addEdge(START, "agent")
  .addNode("tools", toolsNode)
  .addNode("update_keyword", updateKeywords)
  .addConditionalEdges("agent", shouldRefineKeywords, ["update_keyword", END])
  .addEdge("update_keyword", "tools");

export const graph = workflow.compile({});

//
// --- Initialization with Vector Database & Optimized Queries ---
//import { db } from "@/lib/db";

import {
  createBatchEmbeddings,
  searchHybridTweets,
  storeBatchTweetEmbeddings,
} from "@/lib/vectorUtils";

export const initializeState = async () => {
  try {
    // Fetch active Twitter accounts
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { status: TweetAccountStatus.ACTIVE },
      include: { painPoint: { select: { siteSummary: true, keywords: true } } },
    });

    if (!twitterAccounts.length) {
      throw new Error("No active Twitter accounts found.");
    }

    const account = twitterAccounts[0];
    const { painPoint } = account;
    const businessDescription = painPoint.siteSummary;
    const keywords = painPoint.keywords;

    // Fetch today's tweets
    const tweets = await db.tweet.findMany({
      where: {
        twitterAccountId: account.id,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    if (!tweets.length) {
      throw new Error("No tweets found for today.");
    }

    // Generate and store embeddings
    const embeddings = await createBatchEmbeddings(tweets.map((t) => t.text));
    await storeBatchTweetEmbeddings(
      tweets.map((t, i) => ({ tweetId: t.id, embedding: embeddings[i] }))
    );

    // Generate business profile embedding and perform Hybrid Search
    const profileEmbedding = await createBatchEmbeddings([businessDescription]);
    const relevantTweets = await searchHybridTweets(
      businessDescription,
      profileEmbedding[0],
      10
    );

    return {
      messages: [
        {
          role: "system",
          content: "Analyze the relevance of these tweets to the business.",
        },
        {
          role: "user",
          content: JSON.stringify({
            tweets: relevantTweets.map((t) => t.text),
            businessDescription,
            keywords,
          }),
        },
      ],
    };
  } catch (error) {
    console.error("❌ Error in initializeState:", error);
    throw new Error("Failed to initialize state.");
  }
};
