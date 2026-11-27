import { webhookHandler } from "@/features/inbox/handlers.ts";
import { publicRoute } from "@/app/api/_lib/wrap.ts";

export const POST = publicRoute(webhookHandler, { csrf: false });
