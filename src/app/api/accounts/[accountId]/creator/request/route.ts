import { route } from "@/app/api/_lib/wrap.ts";
import { requestLinkHandler } from "@/features/creator/handlers.ts";

export const POST = route(requestLinkHandler);
