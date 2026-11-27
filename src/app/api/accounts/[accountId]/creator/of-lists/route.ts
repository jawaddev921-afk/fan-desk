import { route } from "@/app/api/_lib/wrap.ts";
import { ofListsHandler } from "@/features/creator/handlers.ts";

export const GET = route(ofListsHandler);
