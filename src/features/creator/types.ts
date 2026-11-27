// What the creator API sends the browser.
import type { Advanced, BioValues, Flow, RuleGroup, Targeting } from "./schema.ts";

/** What starts a script by itself. "jazz" (or none) = only the trigger text, read by Jazz; "keywords" = a fan message containing one of the keywords; the rest are events. */
export type ScriptStart = "jazz" | "keywords" | "content" | "subscribe" | "resubscribe" | "online" | "like" | "tip" | "buy" | "expire";
/** How one step goes out (productId 0 = the product that best fits what the fan asked for): after the fan answers the step before (default), or a number of minutes after it; and an optional product (price and media) attached. */
export type ScriptStep = { afterReply?: boolean; waitMinutes?: number; productId?: number | null; mode?: "exact" | "rewrite" };
export type ItemKind = "update" | "product" | "bump" | "script" | "sample" | "fanlist" | "flow";
type Media = { id: string; type: string; free?: boolean };
export type ItemData = {
  product: { name: string; price: number; description: string; tags: string[]; progression: number; bundle: boolean; media: Media[] };
  bump: { message: string; price: number; trigger: string; media: Media[]; onlyLists: number[]; neverLists: number[] };
  script: { name: string; trigger: string; steps: string[]; expiresHours?: number; exitOn?: boolean; exitLimit?: number; startsOn?: ScriptStart; keywords?: string[]; stepOptions?: ScriptStep[] };
  flow: Flow;
  update: { content: string; endsAt: number; startsAt?: number };
  sample: { category: string; title: string; fan: string[] };
  /** A group of fans. `ofId` is set when it was copied from an OnlyFans list (a snapshot of its name and size); `rules` when it is defined by rules. */
  fanlist: { name: string; ofId: string | null; count: number | null; rules?: RuleGroup; updatedAt?: number; /** a list copied from OnlyFans is filled a page at a time: */ done?: boolean; cursor?: string | null; capped?: boolean; total?: number };
};
export type Item<K extends ItemKind = ItemKind> = { id: number; live: boolean; data: ItemData[K] };
export type CreatorView = {
  values: BioValues;
  train: Record<string, string>;
  flags: { enabled: boolean; bump: boolean };
  targeting: Targeting;
  advanced: Advanced;
  /** When the bio was last saved (ms), or null if it never was. */
  updatedAt: number | null;
  counts: Record<ItemKind, number>;
};

export type OfList = { id: string; name: string; type: string; usersCount: number };
export type VaultFolder = { id: string; name: string; photos: number; videos: number; audios: number };
export type SentPpv = { text: string; price: number; media: Media[]; sentAt: number; fans?: number };

/** "Live preview" of a set of rules over the fans we know. */
export type FanPreview = {
  total: number;
  spend: number;
  buckets: [number, number, number, number]; // $0 or less, over $0 under $50, $50 to under $200, $200+
  fans: { id: string; username: string | null; name: string | null; spend: number; lastMessageAt: number | null; subscribedAt: number | null; human: boolean; avatar: string | null }[];
};
