export const serverUrl = process.env.NEXT_PUBLIC_NODE_SERVER_URL!;

export const assistantMapping: Record<string, string> = {
  agreeableness_agree: process.env.NEXT_PUBLIC_ASSISTANT_AGREE!,
  agreeableness_disagree: process.env.NEXT_PUBLIC_ASSISTANT_DISAGREE!,
  authority: process.env.NEXT_PUBLIC_ASSISTANT_AUTHORITY!,
  empathy: process.env.NEXT_PUBLIC_ASSISTANT_EMPATHY!,
  solution: process.env.NEXT_PUBLIC_ASSISTANT_SOLUTION!,
  humor: process.env.NEXT_PUBLIC_ASSISTANT_HUMOR!,
  question: process.env.NEXT_PUBLIC_ASSISTANT_QUESTION!,
  contrarian: process.env.NEXT_PUBLIC_ASSISTANT_CONTRARIAN!,
  trend: process.env.NEXT_PUBLIC_ASSISTANT_TREND!,
  what_if: process.env.NEXT_PUBLIC_ASSISTANT_WHAT_IF!,
};
