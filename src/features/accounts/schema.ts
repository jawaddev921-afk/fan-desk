import { z } from "zod";

/** Per-account assistant settings, edited by the account owner in the dashboard. */
/** PUT /api/ai-key */
export const SaveClaudeKeyBody = z.object({ apiKey: z.string().trim().max(300) });

/** PUT /api/connection */
export const SaveKeyBody = z.object({ apiKey: z.string().default("") });

const SettingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  persona: z.string().trim().max(500),
  menu: z
    .array(
      z.object({
        item: z.string().trim().min(1).max(80),
        price: z.number().min(0).max(10000),
        details: z.string().trim().max(200).optional(),
      }),
    )
    .max(30),
  rules: z.array(z.string().trim().min(1).max(200)).max(20),
  // Fans who already spent at least this much go straight to a human. null = off.
  humanSpendThreshold: z.number().min(0).max(1_000_000).nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type MenuItem = Settings["menu"][number];

export const AccountPatchSchema = SettingsSchema.extend({
  ai_enabled: z.boolean(),
  send_mode: z.enum(["draft", "auto"]),
});

export function defaultSettings(name: string): Settings {
  return {
    name,
    persona: "Friendly, warm, short messages.",
    menu: [],
    rules: [],
    humanSpendThreshold: 100,
  };
}

export function parseSettings(json: string): Settings {
  try {
    const r = SettingsSchema.safeParse(JSON.parse(json));
    if (r.success) return r.data;
  } catch {
    /* fall through */
  }
  return defaultSettings("the creator");
}
