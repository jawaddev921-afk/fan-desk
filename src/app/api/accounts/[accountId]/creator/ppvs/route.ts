import { route } from "@/app/api/_lib/wrap.ts";
import { ppvsHandler } from "@/features/creator/handlers.ts";

export const GET = route(ppvsHandler);
