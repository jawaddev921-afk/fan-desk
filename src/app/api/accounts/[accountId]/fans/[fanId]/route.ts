import { fanHandler } from "@/app/api/_lib/views.ts";
import { route } from "@/app/api/_lib/wrap.ts";

export const GET = route(fanHandler);
