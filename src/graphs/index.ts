import {
  Annotation,
  END,
  START,
  StateGraph,
  MessagesAnnotation,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { type AIMessage } from "@langchain/core/messages";

// local imports
import { TtweetRelevanceResult } from "@/types";
import { ALL_TOOLS_LIST, tweetRelevanceTool } from "./tools";

const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  tweetRelevanceResult: Annotation<TtweetRelevanceResult>(),
  updateKeywordGraphResult: Annotation<unknown>(),
});

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
      "You're an expert analyst who evaluates tweet relevance to business descriptions and updates keyword graphs as needed.",
  };

  const llmWithTools = llm.bindTools(ALL_TOOLS_LIST);
  const result = await llmWithTools.invoke([systemMessage, ...messages]);
  return { messages: result };
};

/**
 * Determines whether it should refine the keywords based on the tweet relevance suggestions.
 * @param state - The current state of the graph.
 * @returns The next node to transition to.
 * @throws An error if there is a problem updating the keyword graph.
 */
const shouldRefineKeywords = (state: typeof GraphAnnotation.State) => {
  const { messages, tweetRelevanceResult } = state;

  const lastMessage = messages[messages.length - 1];
  const aiMessage = lastMessage as AIMessage;

  if (aiMessage._getType() !== "ai" || !aiMessage.tool_calls?.length) {
    return END;
  }

  if (tweetRelevanceResult?.result) {
    const results = JSON.parse(tweetRelevanceResult.result);
    const suggestion = results.suggestion;

    if (suggestion?.includes("refining")) {
      return "update_keyword";
    }
  }

  return END;
};

/**
 * Updates the keywords based on the tweet relevance suggestions.
 * @param state - The current state of the graph.
 *
 */
const updateKeywords = async (state: typeof GraphAnnotation.State) => {
  const { messages } = state;

  const lastMessage = messages[messages.length - 1] as AIMessage;

  if (lastMessage._getType() !== "ai") {
    throw new Error("Expected the last message to be an AI message");
  }

  // Cast AI message to access tool calls
  const aiMessage = lastMessage as AIMessage;
  const updateKeywordsToolCall = aiMessage.tool_calls?.find(
    (tc) => tc.name === "update_keyword"
  );

  if (!updateKeywordsToolCall) {
    throw new Error(
      "Expected the last AI message to have an `update_keyword` tool call"
    );
  }

  const { args } = updateKeywordsToolCall;
  console.log("Updating keywords with arguments:", args);

  const updatedKeywords = args.keywords?.map((kw: string) => `${kw}-refined`);
  console.log("Updated Keywords:", updatedKeywords);

  return updatedKeywords;
};

const workflow = new StateGraph(GraphAnnotation)
  .addNode("agent", callModel)
  .addEdge(START, "agent")
  .addNode("tools", toolsNode)
  .addNode("update_keyword", updateKeywords)
  .addConditionalEdges("agent", shouldRefineKeywords, ["update_keyword", END])
  .addEdge("update_keyword", "tools");

export const graph = workflow.compile({});
