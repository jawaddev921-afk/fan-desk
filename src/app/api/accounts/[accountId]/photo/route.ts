import { route } from "@/app/api/_lib/wrap.ts";
import { photoHandler } from "@/features/creator/handlers.ts";

export const GET = route(photoHandler);
