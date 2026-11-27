import { route } from "@/app/api/_lib/wrap.ts";
import { importListHandler } from "@/features/creator/handlers.ts";

export const POST = route(importListHandler);
