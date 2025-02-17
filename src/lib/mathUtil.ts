/**
 * Computes cosine similarity between two vectors.
 * @param vecA - First vector.
 * @param vecB - Second vector.
 * @returns Cosine similarity score.
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  const dot = a.reduce((acc, val, i) => acc + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0));
  const normB = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0));
  return normA && normB ? dot / (normA * normB) : 0;
};
