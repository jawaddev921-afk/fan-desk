// Pure rules of the inbox feature (browser-safe).

/** A fan's photo link is only fetched if it is an https address on OnlyFans' own domain (nothing a user or a fan could point elsewhere). */
export function isAvatarUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "onlyfans.com" || u.hostname.endsWith(".onlyfans.com"));
  } catch {
    return false;
  }
}

/**
 * What a stored message text means. Fan Desk writes a few markers into the text when OnlyFans sends no words:
 * `[tip] <words>` for a tip, `[sent N media]` for a message that is only pictures, `[empty message]`, and (as system messages) `[tip $N]` / `[PPV purchase $N]`.
 * The page shows them as small labels instead of the raw text.
 */
export type MessageNote =
  | { kind: "text"; text: string }
  | { kind: "tip"; text: string; amount: number | null } // `text` is what the fan wrote with the tip
  | { kind: "media-only"; count: number }
  | { kind: "empty" }
  | { kind: "payment"; label: string; amount: number | null }; // a system message: a tip or a PPV purchase happened

export function readMessage(text: string): MessageNote {
  const payment = /^\[(tip|PPV purchase) \$(\d+(?:\.\d+)?)\]$/.exec(text);
  if (payment) return { kind: "payment", label: payment[1] === "tip" ? "Tip received" : "PPV unlocked", amount: Number(payment[2]) };
  const tip = /^\[tip\]\s*([\s\S]*)$/.exec(text);
  if (tip) {
    const amount = /\$\s?(\d+(?:[.,]\d{1,2})?)/.exec(tip[1]);
    return { kind: "tip", text: tip[1].trim(), amount: amount ? Number(amount[1].replace(",", ".")) : null };
  }
  const media = /^\[sent (\d+) media\]$/.exec(text);
  if (media) return { kind: "media-only", count: Number(media[1]) };
  if (text === "[empty message]") return { kind: "empty" };
  return { kind: "text", text };
}

/**
 * The words for the locked (paid) media of one message. The provider gives no picture for them, only the kind, the size, the length of a
 * video and the message's price, so the page shows a lock with these words. One item: "Locked video · 0:42 · $9.99"; several: "3 locked items: 2 photos, 1 video · $9.99".
 */
export function lockedLabel(items: { type: string; price: number; duration?: number | null }[]): string {
  if (!items.length) return "";
  const p = Number(items[0].price);
  const price = p > 0 ? ` \u00b7 $${Number.isInteger(p) ? p : p.toFixed(2)}` : ""; // $28 or $21.30, never $21.3
  if (items.length === 1) {
    const [x] = items;
    const secs = Math.round(x.duration ?? 0);
    const length = x.type === "video" && secs > 0 ? ` \u00b7 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "";
    return `Locked ${x.type}${length}${price}`;
  }
  const kinds = new Map<string, number>();
  for (const x of items) kinds.set(x.type, (kinds.get(x.type) ?? 0) + 1);
  const parts = [...kinds].map(([t, n]) => `${n} ${t}${n === 1 ? "" : "s"}`).join(", ");
  return `${items.length} locked items: ${parts}${price}`;
}
