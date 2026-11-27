export const ago = (t: number | null): string => {
  if (!t) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

/** Up to two letters or digits from the first words of a name. Emoji and symbols are skipped (a plain `w[0]` would cut an emoji in half). */
export const initials = (n: string | null | undefined): string =>
  String(n || "?")
    .replace(/^@/, "")
    .split(/\s+/)
    .map((w) => /[\p{L}\p{N}]/u.exec(w)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

/** One of six avatar colours, the same for the same key every time. */
export const avatarTone = (key: string): number => [...key].reduce((h, c) => h + c.charCodeAt(0), 0) % 6;
