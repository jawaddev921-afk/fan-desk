import { route } from "@/app/api/_lib/wrap.ts";
import { vaultFoldersHandler } from "@/features/creator/handlers.ts";

export const GET = route(vaultFoldersHandler);
