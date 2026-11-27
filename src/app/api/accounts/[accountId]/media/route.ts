import { route } from "@/app/api/_lib/wrap.ts";
import { mediaHandler } from "@/features/inbox/handlers.ts";

export const GET = route(mediaHandler);
