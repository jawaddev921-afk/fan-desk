import { publicRoute } from "@/app/api/_lib/wrap.ts";
import { requestGetHandler, requestSaveHandler } from "@/features/creator/handlers.ts";

export const GET = publicRoute(requestGetHandler);
export const PUT = publicRoute(requestSaveHandler);
