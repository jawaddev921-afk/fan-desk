import { removeClaudeKeyHandler, saveClaudeKeyHandler } from "@/features/accounts/handlers.ts";
import { route } from "@/app/api/_lib/wrap.ts";

export const PUT = route(saveClaudeKeyHandler, { withMe: true });
export const DELETE = route(removeClaudeKeyHandler, { withMe: true });
