import { updateAccountHandler } from "@/features/accounts/handlers.ts";
import { route } from "@/app/api/_lib/wrap.ts";

export const PUT = route(updateAccountHandler, { withMe: true });
