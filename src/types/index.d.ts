export type Job = {
  id: string;
  schedule: string;
  handler: () => Promise<void>;
  timezone?: string;
};

export type TtweetRelevanceResult = {
  result: string;
  suggestion?: string;
};
