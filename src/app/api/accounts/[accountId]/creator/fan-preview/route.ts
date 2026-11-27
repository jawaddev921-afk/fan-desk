import { route } from "@/app/api/_lib/wrap.ts";
import { fanPreviewHandler } from "@/features/creator/handlers.ts";

export const POST = route(fanPreviewHandler);
