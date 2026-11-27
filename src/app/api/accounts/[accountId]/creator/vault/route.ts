import { route } from "@/app/api/_lib/wrap.ts";
import { vaultHandler } from "@/features/creator/handlers.ts";

export const GET = route(vaultHandler);
