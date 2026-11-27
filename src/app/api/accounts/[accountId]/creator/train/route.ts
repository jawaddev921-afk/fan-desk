import { route } from "@/app/api/_lib/wrap.ts";
import { trainHandler } from "@/features/creator/handlers.ts";

export const PUT = route(trainHandler);
