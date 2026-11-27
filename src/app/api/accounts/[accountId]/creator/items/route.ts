import { route } from "@/app/api/_lib/wrap.ts";
import { addItemHandler, listItemsHandler } from "@/features/creator/handlers.ts";

export const GET = route(listItemsHandler);
export const POST = route(addItemHandler);
