import { route } from "@/app/api/_lib/wrap.ts";
import { targetingHandler } from "@/features/creator/handlers.ts";

export const PUT = route(targetingHandler);
