import { route } from "@/app/api/_lib/wrap.ts";
import { previewHandler } from "@/features/assistant/handlers.ts";

export const POST = route(previewHandler);
