import { db } from "@/lib/db";
import { ChatOpenAI } from "@langchain/openai";
import { NotificationType, TweetAccountStatus } from "@prisma/client";
import {
  StateGraph,
  Annotation,
  MessagesAnnotation,
  END,
  START,
} from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ALL_TOOLS_LIST, generateRefinedKeywords } from "./tools";
import {
  createBatchEmbeddings,
  searchHybridTweets,
  storeBatchTweetEmbeddings,
} from "@/lib/util";
import { io } from "../index";
import { TweetRelevanceResult, UpdateKeywordGraphResult } from "@/schemas";
import { activeUsers } from "@/socket";

const RELEVANCE_THRESHOLD = 0.5;

const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  tweetRelevanceResult: Annotation<TweetRelevanceResult>(),
  updateKeywordGraphResult: Annotation<UpdateKeywordGraphResult>(),
  userId: Annotation<string>(),
});

// Initialize OpenAI API
const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
});

const toolsNode = new ToolNode(ALL_TOOLS_LIST);

const callModel = async (state: typeof GraphAnnotation.State) => {
  const { messages } = state;

  const systemMessage = {
    role: "system",
    content:
      "You are an expert analyst evaluating tweet relevance to a business description. " +
      "If you determine that the tweets are not sufficiently relevant (i.e. if the average relevance score is low), " +
      "you must call the tool `update_keyword_graph`. " +
      'For example, if the current keywords are ["patent tracking", "patent insights"] and the tweets are not matching well, ' +
      'output a tool call like: { "name": "update_keyword_graph", "args": { "keywords": ["patent tracking", "patent insights"], "suggestion": "refining" } }.',
  };

  const llmWithTools = llm.bindTools(ALL_TOOLS_LIST);
  const result: AIMessage = await llmWithTools.invoke([
    systemMessage,
    ...messages,
  ]);

  // Ensure tool calls are processed
  if (result.tool_calls?.length) {
    for (const toolCall of result.tool_calls) {
      if (toolCall.name === "tweet_relevance") {
        const toolResult = await ALL_TOOLS_LIST.find(
          (tool) => tool.name === "tweet_relevance"
        )?.invoke(toolCall.args);

        if (toolResult) {
          state.tweetRelevanceResult = toolResult;
        }
      }
    }
  }

  return { messages: result };
};

const shouldRefineKeywords = (state: typeof GraphAnnotation.State) => {
  console.log("Reached...");
  const { messages } = state;

  const lastMessage = messages[messages.length - 1] as AIMessage;

  const args = lastMessage.tool_calls[0].args;
  const avgScore = args.averageScore;

  if (avgScore && avgScore < RELEVANCE_THRESHOLD) {
    return "update_keyword";
  }
  console.log("🚫 No need to refine keywords.");
  return END;
};

const updateKeywords = async (state: typeof GraphAnnotation.State) => {
  try {
    const { messages, userId } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    if (lastMessage._getType() !== "ai" || !lastMessage.tool_calls?.length) {
      return END;
    }

    // Extract and transform args from the first tool call.
    const rawArgs = lastMessage.tool_calls[0].args;
    const transformedArgs = {
      averageScore: rawArgs.averageScore,
      keywords: rawArgs.keywords,
      suggestion: rawArgs.suggestion || "refining",
      businessDescription: rawArgs.businessDescription,
      tweets: Array.isArray(rawArgs.tweets)
        ? rawArgs.tweets.map((t: any) =>
            typeof t === "object" && t.tweet ? t.tweet : t
          )
        : [],
    };

    // Call the LLM to generate refined keywords
    const refinedKeywords = await generateRefinedKeywords(
      transformedArgs.businessDescription,
      transformedArgs.keywords,
      transformedArgs.tweets,
      transformedArgs.averageScore
    );

    const recipientSocketId = activeUsers.get(userId);
    console.log("🛠️ Active users map:", activeUsers);
    console.log(`👤 Checking if user ${userId} is online...`);

    if (!recipientSocketId) {
      console.log(
        `⚠️ User ${userId} is not online. Notification will not be delivered.`
      );
      return;
    }

    console.log(
      `📡 Sending WebSocket notification to socket ID: ${recipientSocketId}`
    );

    io.to(recipientSocketId).emit("newNotification", {
      userId,
      message: "Your pain point keywords update suggestion",
      data: refinedKeywords,
      seen: false,
      type: NotificationType.KEYWORDREFINEMENT,
      createdAt: new Date().toISOString(),
    });

    await db.notification.create({
      data: {
        userId,
        message: "Your pain point keywords update suggestion",
        data: refinedKeywords,
        seen: false,
        type: NotificationType.KEYWORDREFINEMENT,
      },
    });

    console.log("✅ Refined Keywords from LLM:", refinedKeywords);
    return { messages: [new AIMessage(refinedKeywords.join(", "))] };
  } catch (error: any) {
    console.error("❌ Error in updateKeywords:", error.message);
    throw new Error("Keyword refinement failed.");
  }
};

// --- Construct LangChain Workflow Graph ---
const workflow = new StateGraph(GraphAnnotation)
  .addNode("agent", callModel)
  .addEdge(START, "agent")
  .addNode("tools", toolsNode)
  .addNode("update_keyword", updateKeywords)
  .addConditionalEdges("agent", shouldRefineKeywords, ["update_keyword", END])
  .addEdge("update_keyword", "tools");

export const graph = workflow.compile({});

export const initializeState = async ({ userId }: { userId: string }) => {
  try {
    const twitterAccounts = await db.twitterAccount.findMany({
      where: { userId, status: TweetAccountStatus.ACTIVE },
      include: { painPoint: { select: { siteSummary: true, keywords: true } } },
    });

    if (!twitterAccounts.length) {
      throw new Error("No active Twitter accounts found.");
    }

    const account = twitterAccounts[0];
    const { painPoint } = account;
    const businessDescription = painPoint.siteSummary || "";
    const keywords = painPoint.keywords || [];

    if (!businessDescription.trim()) {
      throw new Error("Business description is empty.");
    }

    const tweets = await db.tweet.findMany({
      where: {
        twitterAccountId: account.id,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    if (!tweets.length) {
      throw new Error("No tweets found for today.");
    }

    const embeddings = await createBatchEmbeddings(tweets.map((t) => t.text));
    await storeBatchTweetEmbeddings(
      tweets.map((t, i) => ({
        tweetId: t.id,
        tweetText: t.text,
        embedding: embeddings[i],
      }))
    );

    const [businessEmbedding] = await createBatchEmbeddings([
      businessDescription,
    ]);

    await searchHybridTweets(businessDescription, businessEmbedding, 10);

    return {
      messages: [
        {
          role: "system",
          content: "Analyze the relevance of these tweets to the business.",
        },
        {
          role: "user",
          content: JSON.stringify({ tweets, businessDescription, keywords }),
        },
      ],
      userId,
    };
  } catch (error: any) {
    console.error("❌ Error in initializeState:", error);
    throw new Error("Failed to initialize state.");
  }
};
