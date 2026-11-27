import { route } from "@/app/api/_lib/wrap.ts";
import { vaultThumbHandler } from "@/features/creator/handlers.ts";

export const GET = route(vaultThumbHandler);
