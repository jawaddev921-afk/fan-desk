import { route } from "@/app/api/_lib/wrap.ts";
import { deleteMessageHandler, updateMessageHandler } from "@/features/library/handlers.ts";

export const PUT = route(updateMessageHandler);
export const DELETE = route(deleteMessageHandler);
