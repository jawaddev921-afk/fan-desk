import { disconnectHandler, saveKeyHandler } from "@/features/accounts/handlers.ts";
import { route } from "@/app/api/_lib/wrap.ts";

export const PUT = route(saveKeyHandler, { withMe: true });
export const DELETE = route(disconnectHandler, { withMe: true });
