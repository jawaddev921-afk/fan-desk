import { route } from "@/app/api/_lib/wrap.ts";
import { creatorHandler, saveBioHandler } from "@/features/creator/handlers.ts";

export const GET = route(creatorHandler);
export const PUT = route(saveBioHandler);
