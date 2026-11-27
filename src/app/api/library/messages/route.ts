import { route } from "@/app/api/_lib/wrap.ts";
import { addMessageHandler } from "@/features/library/handlers.ts";

export const POST = route(addMessageHandler);
