import { EngagementType } from "@prisma/client";

export const enumEngagementTypeMapping: Record<string, EngagementType> = {
  agreeableness_agree: EngagementType.AGREEABLENESS_AGREE,
  agreeableness_disagree: EngagementType.AGREEABLENESS_DISAGREE,
  authority: EngagementType.AUTHORITY,
  empathy: EngagementType.EMPATHY,
  solution: EngagementType.SOLUTION,
  humor: EngagementType.HUMOR,
  question: EngagementType.QUESTION,
  contrarian: EngagementType.CONTRARIAN,
  trend: EngagementType.TREND,
  what_if: EngagementType.WHAT_IF,
};
