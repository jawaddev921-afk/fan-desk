import { publicRoute } from "@/app/api/_lib/wrap.ts";
import { verifyHandler } from "@/features/auth/handlers.ts";

export const POST = publicRoute(verifyHandler);
