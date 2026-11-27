import { startAssistant } from "./features/assistant/service.ts";
import { startInbox } from "./features/inbox/service.ts";
import { purgeExpiredSessions } from "./features/auth/service.ts";
import { singleton } from "./lib/singleton.ts";

// The AI reply and sending loop, and the hourly clean-up. Started once per server process.
// On Vercel there is no process to keep a loop alive: the cron endpoint (/api/cron/tick) does this work every minute.
const state = singleton("background-started", () => ({ started: false }));
if (!state.started) {
  state.started = true;
  startInbox();
  startAssistant({ loop: !process.env.VERCEL });
  if (!process.env.VERCEL) setInterval(() => void purgeExpiredSessions().catch((err) => console.error("[purge]", err)), 60 * 60 * 1000).unref();
}
