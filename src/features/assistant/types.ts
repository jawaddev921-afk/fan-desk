// What the API sends the dashboard about drafts and AI usage. Types only, so browser code can use them.
export type OutboxView = {
  id: string;
  fan_id: string;
  text: string;
  source: string;
  status: string;
  error: string | null;
};

export type UsageView = {
  days: number;
  byModel: { model: string; calls: number; input: number; output: number }[];
  estimatedCostUsd: number;
};
