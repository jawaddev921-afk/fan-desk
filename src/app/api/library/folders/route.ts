import { route } from "@/app/api/_lib/wrap.ts";
import { addFolderHandler } from "@/features/library/handlers.ts";

export const POST = route(addFolderHandler);
