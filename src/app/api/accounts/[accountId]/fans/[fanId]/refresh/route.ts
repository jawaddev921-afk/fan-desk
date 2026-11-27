import { route } from "@/app/api/_lib/wrap.ts";
import { refreshFanHandler } from "@/features/inbox/handlers.ts";

export const POST = route(refreshFanHandler);
