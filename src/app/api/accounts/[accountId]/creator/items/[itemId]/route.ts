import { route } from "@/app/api/_lib/wrap.ts";
import { deleteItemHandler, updateItemHandler } from "@/features/creator/handlers.ts";

export const PUT = route(updateItemHandler);
export const DELETE = route(deleteItemHandler);
