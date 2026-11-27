import { route } from "@/app/api/_lib/wrap.ts";
import { flagsHandler } from "@/features/creator/handlers.ts";

export const PUT = route(flagsHandler, { withMe: true });
