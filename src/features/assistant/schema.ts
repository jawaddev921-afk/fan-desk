// What the assistant endpoints accept. Pure rules, no server code.
import { z } from "zod";

/** POST /api/outbox/:id/approve (an edited text is optional) */
export const ApproveBody = z.object({ text: z.string().optional() });

/** POST /api/accounts/:id/fans/:id/reply */
export const ReplyBody = z.object({ text: z.string().default("") });


