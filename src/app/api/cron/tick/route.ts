import { publicRoute } from "@/app/api/_lib/wrap.ts";
import { cronTickHandler } from "@/features/assistant/handlers.ts";

export const maxDuration = 300; // seconds: a tick may draft replies, send up to 10 messages and run an import step of up to about 2 minutes

// The host's cron calls this every minute (vercel.json); it carries its own secret instead of the browser's CSRF header.
export const GET = publicRoute(cronTickHandler, { csrf: false });
