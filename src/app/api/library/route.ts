import { route } from "@/app/api/_lib/wrap.ts";
import { libraryHandler } from "@/features/library/handlers.ts";

export const GET = route(libraryHandler);
