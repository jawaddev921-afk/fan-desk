import { releaseHandler } from "@/features/inbox/handlers.ts";
import { route } from "@/app/api/_lib/wrap.ts";

export const POST = route(releaseHandler);
