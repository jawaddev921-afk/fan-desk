import { route } from "@/app/api/_lib/wrap.ts";
import { importHandler } from "@/features/library/handlers.ts";

export const POST = route(importHandler);
