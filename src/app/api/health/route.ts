import { publicRoute } from "@/app/api/_lib/wrap.ts";

export const GET = publicRoute(() => new Response("ok"));
