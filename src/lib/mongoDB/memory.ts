import { OpenAIEmbeddings } from "@langchain/openai";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { VectorStoreRetrieverMemory } from "langchain/memory";
import { connectToMongoDB } from "@/lib/vectorUtils";

const COLLECTION_NAME = "conversation_memory";

/**
 * Initializes long-term memory with MongoDB Atlas Vector Search.
 * @returns {VectorStoreRetrieverMemory} The memory retriever.
 */
export const initializeMemory =
  async (): Promise<VectorStoreRetrieverMemory> => {
    const mongoClient = await connectToMongoDB();

    const vectorStore = new MongoDBAtlasVectorSearch(new OpenAIEmbeddings(), {
      collection: mongoClient.db().collection(COLLECTION_NAME),
      indexName: "memory_vector_index",
    });

    return new VectorStoreRetrieverMemory({
      vectorStoreRetriever: vectorStore.asRetriever(),
      memoryKey: "history",
      inputKey: "input",
      outputKey: "output",
    });
  };
