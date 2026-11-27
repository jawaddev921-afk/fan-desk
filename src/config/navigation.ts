import { AI_NAME } from "./ai.ts";
// The dashboard's top-bar tabs.
export const TABS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/creator", label: "Creator" },
  { href: "/communications", label: "Communications" },
  { href: "/assistant", label: AI_NAME },
  { href: "/connection", label: "Connection" },
] as const;
