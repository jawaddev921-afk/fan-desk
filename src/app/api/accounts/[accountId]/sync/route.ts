import { syncHandler } from "@/features/inbox/handlers.ts";
import { route } from "@/app/api/_lib/wrap.ts";

export const POST = route(syncHandler, { withMe: true });
