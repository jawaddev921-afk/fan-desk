// Message Library rules: the {name} fill-in and reading pasted rows. Pure and browser-safe (no zod).

export type NameSettings = { fallbackName: string; capitalize: boolean };

/** Fills {name} with the fan's first name, or the fallback nickname when the fan has no usable name. */
export function renderMessage(text: string, fanName: string | null | undefined, s: NameSettings): string {
  const first = (fanName ?? "").trim().split(/\s+/)[0] ?? "";
  const usable = /^[\p{L}][\p{L}'-]*$/u.test(first); // "xX_fan_Xx" or "123" is not a name to greet
  let name = usable ? first : s.fallbackName;
  if (s.capitalize) name = name.charAt(0).toUpperCase() + name.slice(1);
  return text.replace(/\{name\}/gi, name);
}

/** Pasted rows from a sheet: title<TAB>text<TAB>price (price optional). A first row that says "title" is a header and skipped. */
export function parseRows(pasted: string): { title: string; text: string; price: number }[] {
  const rows = pasted
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split("\t"))
    .map(([title = "", text = "", price = ""]) => ({ title: title.trim(), text: text.trim(), price: Number(price.replace(/[$\s]/g, "")) || 0 }));
  return rows.filter((r, i) => r.title && !(i === 0 && r.title.toLowerCase() === "title"));
}
