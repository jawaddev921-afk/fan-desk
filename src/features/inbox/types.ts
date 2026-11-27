// What the API sends the dashboard about fans and messages. Types only, so browser code can use them.
export type FanView = {
  account_id: string;
  fan_id: string;
  username: string | null;
  name: string | null;
  total_spend: number;
  intent: string;
  score: number;
  tier: string;
  mode: "assistant" | "human";
  handoff_reason: string | null;
  ai_summary: string | null;
  last_paid_at: number | null;
  last_message_at: number | null;
  avatar_url: string | null;
  /** When the fan subscribed and when spend/subscribe date were last read from the provider (set by the Creator rules). */
  subscribed_at?: number | null;
  stats_at?: number | null;
};
/** A fan in a list, with how many AI drafts wait for a person. */
export type FanRow = FanView & { pending: number };

/** A photo, video, audio or gif in a message. `viewable` is false for paid (locked) media; `gone` means the sender removed it from the chat. The page asks our media route for the file by message and media id. */
export type MediaView = { id: string; type: string; locked: boolean; price: number; viewable: boolean; gone?: boolean; width?: number | null; height?: number | null; duration?: number | null };

export type MessageView = {
  id: number;
  direction: "in" | "out";
  source: string;
  text: string;
  created_at: number;
  media: MediaView[];
};

