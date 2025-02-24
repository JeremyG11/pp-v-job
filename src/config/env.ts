export const assistantMapping: Record<string, string> = {
  agreeableness_agree: process.env.ASSISTANT_AGREE!,
  agreeableness_disagree: process.env.ASSISTANT_DISAGREE!,
  authority: process.env.ASSISTANT_AUTHORITY!,
  empathy: process.env.ASSISTANT_EMPATHY!,
  solution: process.env.ASSISTANT_SOLUTION!,
  humor: process.env.ASSISTANT_HUMOR!,
  question: process.env.ASSISTANT_QUESTION!,
  contrarian: process.env.ASSISTANT_CONTRARIAN!,
  trend: process.env.ASSISTANT_TREND!,
  what_if: process.env.ASSISTANT_WHAT_IF!,
  ai_recommended: process.env.ASSISTANT_AI_RECOMMENDED!,
};
