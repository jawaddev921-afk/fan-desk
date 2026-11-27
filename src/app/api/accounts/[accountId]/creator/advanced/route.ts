import { route } from "@/app/api/_lib/wrap.ts";
import { advancedHandler } from "@/features/creator/handlers.ts";

export const PUT = route(advancedHandler);
