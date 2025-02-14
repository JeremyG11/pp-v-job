import mongoose from "mongoose";

const tweetEmbeddingSchema = new mongoose.Schema({
  tweetId: { type: String, required: true, unique: true },
  embedding: { type: [Number], required: true },
});

export const TweetEmbedding = mongoose.model(
  "TweetEmbedding",
  tweetEmbeddingSchema
);
