// What the API sends the dashboard about the user's connection and accounts. Types only, so browser code can use them.
import type { Settings } from "./schema.ts";

export type AccountView = {
  accountId: string;
  username: string | null;
  displayName: string | null;
  aiEnabled: boolean;
  /** The creator's profile photo is available at /api/accounts/:id/photo. */
  hasAvatar: boolean;
  sendMode: "draft" | "auto";
  note: string | null;
  settings: Settings;
  counts: { pending: number; total: number; human: number; hot: number };
  /** The first import runs in the background; this is how far it is. */
  sync: { status: "idle" | "running" | "done" | "failed"; chats: number; messages: number; windowDays: number; error: string | null };
};

type ConnectionInfo = {
  keyLast4: string;
  teamName: string | null;
  creditsBalance: number | null;
  webhook: { url: string | null; registered: boolean; error: string | null; publicUrlConfigured: boolean };
};

export type MeView = {
  email: string;
  name: string | null;
  aiProvider: "claude" | "ollama";
  aiModel: string;
  /** The Claude key this user pasted (only its last 4 characters). When set, every AI call for their accounts uses it. */
  aiKey: { last4: string } | null;
  connection: ConnectionInfo | null;
  accounts: AccountView[];
};
