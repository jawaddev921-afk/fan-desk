import { route } from "@/app/api/_lib/wrap.ts";
import { saveSettingsHandler } from "@/features/library/handlers.ts";

export const PUT = route(saveSettingsHandler);
