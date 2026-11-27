import { route } from "@/app/api/_lib/wrap.ts";
import { avatarHandler } from "@/features/inbox/handlers.ts";

export const GET = route(avatarHandler);
