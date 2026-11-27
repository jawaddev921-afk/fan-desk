import { route } from "@/app/api/_lib/wrap.ts";
import { deleteFolderHandler } from "@/features/library/handlers.ts";

export const DELETE = route(deleteFolderHandler);
