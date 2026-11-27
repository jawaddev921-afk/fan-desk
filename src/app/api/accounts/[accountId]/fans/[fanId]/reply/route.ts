import { replyHandler } from "@/features/assistant/handlers.ts";
import { route } from "@/app/api/_lib/wrap.ts";

export const POST = route(replyHandler);
