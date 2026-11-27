import { registerWebhookHandler } from "@/features/accounts/handlers.ts";
import { route } from "@/app/api/_lib/wrap.ts";

export const POST = route(registerWebhookHandler, { withMe: true });
