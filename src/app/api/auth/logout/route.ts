import { logoutHandler } from "@/features/auth/handlers.ts";
import { publicRoute } from "@/app/api/_lib/wrap.ts";

export const POST = publicRoute(logoutHandler);
