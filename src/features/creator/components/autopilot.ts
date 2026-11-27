// The autopilot simulator: everything the platform would do on its own (replies, bumps, follow-ups, flows, unsends, active hours),
// run against ONE made-up fan on a virtual clock. It is pure: nothing is saved and nothing is sent to anyone. The browser keeps the
// state, asks the writer (the AI) for the texts the engine cannot make, and hands the answers back. The same rules can later run
// against real fans; for now they only run here.
import { asksForFacts, isCustomRequest, flowKids, fanTurnsSince, isBotQuestion, type Advanced, type FlowNode, type Targeting } from "../schema.ts";
import type { Item } from "../types.ts";

export type SimConfig = { creator: string; enabled: boolean; handleChats: boolean; bumpOn: boolean; adv: Advanced; targeting: Targeting; bumps: Item<"bump">[]; flows: Item<"flow">[]; scripts?: Item<"script">[]; products: Item<"product">[]; lists: Item<"fanlist">[] };
export type SimFan = { name: string; spend: number; subscribedDays: number; tags: string[]; lists: number[] };
export type Entry = { id: number; at: number; kind: "fan" | "jazz" | "draft" | "system"; text: string; tag?: string; price?: number; media?: number; items?: { id: string; type: string }[]; unlocked?: boolean; unsent?: boolean; note?: string; chatter?: boolean };
type Turn = { from: "fan" | "creator"; text: string };
export type Ask = { kind: "reply" | "followup" | "step"; turns: Turn[]; instruction?: string; run?: number };
export type Answer = { reply: string; needsHuman: boolean; reason: string };
type JobKind = "calm" | "reply" | "followup" | "bump" | "ppv" | "unsend" | "step" | "open" | "script";
type Job = { id: number; at: number; thanks?: number; kind: JobKind; ref?: number; run?: number; node?: string; bump?: number; phase?: number };
type ScriptRun = { id: number; script: number; name: string; step: number; waitingReply: boolean; lastAt: number; unpaid: number; done: boolean };
type Run = { id: number; flow: number; title: string; startedAt: number; spent0: number; done: boolean; lastSentAt: number | null; replied: boolean; sales: number };
export type Sim = { now: number; target: number; start: number; fan: SimFan; online: boolean; human: boolean; entries: Entry[]; jobs: Job[]; runs: Run[]; seq: number; rng: number; lastFanAt: number | null; lastHerAt: number | null; purchasedAt: number | null; waiting: boolean; muted: boolean; paused: boolean; expired: boolean; renewOff: boolean; sent: string[]; purchases: number[]; escalations: { at: number; reason: string }[]; seen: string[]; scriptRuns?: ScriptRun[] };
export type Event = { t: "unlock"; entry: number } | { t: "subscribe" | "online" | "offline" | "like" | "expire" } | { t: "message"; text: string } | { t: "tip" | "buy"; amount: number } | { t: "tag"; tag: string } | { t: "renewoff" | "resubscribe" } | { t: "mass"; text: string; price: number; media: number; items?: { id: string; type: string }[] };

const MIN = 60_000;
const HOUR = 3_600_000;
const UNIT: Record<string, number> = { minutes: MIN, hours: HOUR, days: 24 * HOUR };

export const newSim = (fan: SimFan, start: number): Sim => ({ now: start, target: start, start, fan, online: false, human: false, entries: [], jobs: [], runs: [], seq: 1, rng: 1234567, lastFanAt: null, lastHerAt: null, purchasedAt: null, waiting: false, muted: false, paused: false, expired: false, renewOff: false, sent: [], purchases: [], escalations: [], seen: [] });

// ---- helpers (they change the copy `s` that the public functions own)
const rand = (s: Sim) => { s.rng = (s.rng * 1103515245 + 12345) % 2147483648; return s.rng / 2147483648; };
const between = (s: Sim, a: number, b: number) => a + rand(s) * (b - a);
const say = (s: Sim, kind: Entry["kind"], text: string, extra: Partial<Entry> = {}) => { const e: Entry = { id: s.seq++, at: s.now, kind, text, ...extra }; s.entries.push(e); return e; };
const sys = (s: Sim, text: string) => say(s, "system", text);
const schedule = (s: Sim, at: number, job: Omit<Job, "id" | "at">) => { s.jobs.push({ id: s.seq++, at, ...job }); };
const unschedule = (s: Sim, ...kinds: JobKind[]) => { s.jobs = s.jobs.filter((j) => !kinds.includes(j.kind)); };
const fill = (text: string, s: Sim) => text.replace(/\{name\}/g, s.fan.name.trim() || "babe");

const DAY = 24 * HOUR;
/** The chat goes to a person. Everything Jazz had queued for this fan stops, and the reason is kept for the escalation list. */
function escalate(s: Sim, reason: string) {
  s.human = true;
  unschedule(s, "reply", "followup", "ppv", "open", "calm");
  s.escalations.push({ at: s.now, reason });
  sys(s, `Handed to a person: ${reason}`);
  endScripts(s, "stopped: a person has the chat");
}
/** A person took the chat: a running script stops for good (it does not come back when the chat is given back). */
function endScripts(s: Sim, why: string) {
  for (const r of s.scriptRuns ?? []) if (!r.done) { r.done = true; sys(s, `Script "${r.name}" ${why}`); }
  unschedule(s, "script");
}
// A fan asking for something made just for them is a custom request: the creator has to confirm it, so it is never left to the model.
const CUSTOM = isCustomRequest;
/** A fan asking for something to buy: content, a set, a video, pics, a price. A custom request is not one of these (a person answers that). */
const asksForContent = (text: string) => BUYING.test(text) && !CUSTOM.test(text);
const BUYING = /\b(how much|price|buy|purchase|for sale|videos?|vids?|pics?|photos?|content|bundle|menu)\b/i;

/** The tags the platform puts on a fan by itself (Hot Buyer: bought in the last 48 hours; New Subscriber: the last 7 days; ...) plus the ones set by hand or by a flow. */
export function fanTags(s: Sim): string[] {
  const days = s.fan.subscribedDays + (s.now - s.start) / DAY;
  const out: string[] = [];
  if (days < 7 && !s.expired) out.push("New Subscriber");
  if (s.purchasedAt && s.now - s.purchasedAt < 48 * HOUR) out.push("Hot Buyer");
  if (s.expired) out.push("Expired");
  if (s.renewOff && !s.expired) out.push("Renew Off");
  if (s.fan.spend > 0) out.push("Buyer");
  else if (days >= 7 && s.entries.filter((e) => e.kind === "fan").length >= 3) out.push("Freeloader");
  const lastFan = [...s.entries].reverse().find((e) => e.kind === "fan");
  if (s.fan.spend === 0 && lastFan && BUYING.test(lastFan.text)) out.push("Hot Lead");
  if (s.human && !s.paused && s.escalations.length) out.push("Urgent Priority");
  if (!s.human && s.entries.some((e) => e.kind === "jazz" && !e.chatter)) out.push("AI Chat");
  return [...out, ...s.fan.tags];
}
/** A tag that just appeared is announced (and can start a "Fan Tagged As..." flow); a tag that went away can appear again later. */
function syncTags(s: Sim, cfg: SimConfig) {
  const now = fanTags(s).filter((t) => !s.fan.tags.includes(t));
  for (const t of now) {
    if (s.seen.includes(t)) continue;
    s.seen.push(t);
    if (t !== "AI Chat" && t !== "Buyer" && t !== "Urgent Priority") sys(s, `The platform tags the fan "${t}"`);
    startFlows(s, cfg, (st) => st.config.trigger === "Fan Tagged As..." && String(st.config.tag).toLowerCase() === t.toLowerCase());
  }
  s.seen = s.seen.filter((t) => now.includes(t));
}
/** What this fan has paid for PPVs and tips so far (Max and Avg, like the Pricing Copilot popup). */
export function priceHint(s: Sim): { count: number; max: number; avg: number } {
  const n = s.purchases.length;
  return { count: n, max: n ? Math.max(...s.purchases) : 0, avg: n ? Math.round(s.purchases.reduce((a, b) => a + b, 0) / n) : 0 };
}
/** PriceGuard idea: keep a price inside what this fan usually spends (half to one and a half times his average). With no history the price is left as it is. */
function personalPrice(s: Sim, base: number): { price: number; note?: string } {
  const h = priceHint(s);
  if (!base || !h.count) return { price: base };
  const price = Math.round(Math.min(Math.max(base, h.avg * 0.5), h.avg * 1.5));
  return price === base ? { price } : { price, note: `AI pricing: $${base} became $${price} (this fan usually pays about $${h.avg})` };
}

/** The creator's weekday (0 = Monday) and minutes since midnight at `ms`, in her time zone (UTC when none is set). */
function localParts(ms: number, tz: string): { day: number; min: number } {
  let zone = tz || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch { zone = "UTC"; }
  const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")), min: Number(get("hour")) * 60 + Number(get("minute")) };
}
export const clockText = (ms: number, tz: string) => { const p = localParts(ms, tz); return `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][p.day]} ${String(Math.floor(p.min / 60)).padStart(2, "0")}:${String(p.min % 60).padStart(2, "0")}`; };
const hhmm = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
/** Is she "available" at `ms` (Active Hours)? */
export function isOpen(adv: Advanced, ms: number): boolean {
  const { day, min } = localParts(ms, adv.timezone);
  const d = adv.days[day];
  if (!d || d.mode === "off") return false;
  if (d.mode === "on") return true;
  const a = hhmm(d.from), b = hhmm(d.to);
  return a <= b ? min >= a && min < b : min >= a || min < b; // a window that crosses midnight
}
const nextOpen = (adv: Advanced, from: number): number | null => { for (let t = from; t < from + 8 * 24 * HOUR; t += 15 * MIN) if (isOpen(adv, t)) return t; return null; };
const replyDelay = (s: Sim, cfg: SimConfig) => (cfg.adv.delay.on ? between(s, cfg.adv.delay.min, cfg.adv.delay.max) * 1000 : 0);

/** Why the fan must not be handled by the writer ("Choose who Jazz messages"), or null. */
function verdict(s: Sim, cfg: SimConfig): string | null {
  const t = cfg.targeting.chats, f = s.fan;
  if (t.onlyOnLists && !t.onlyLists.some((id) => f.lists.includes(id))) return "not on the fan lists the writer is limited to";
  if (t.excludeLists.some((id) => f.lists.includes(id))) return "on an excluded fan list";
  if (t.highSpender.on && f.spend >= t.highSpender.amount) return `high spender ($${f.spend} spent, limit $${t.highSpender.amount})`;
  if (t.newFans.on && f.subscribedDays < t.newFans.days) return `new fan (subscribed ${Math.floor(f.subscribedDays)} days ago, limit ${t.newFans.days})`;
  if (t.oldFans.on && f.subscribedDays > t.oldFans.days) return `old fan (subscribed ${Math.floor(f.subscribedDays)} days ago, limit ${t.oldFans.days})`;
  if (t.timeWasters.on) {
    const w = t.timeWasters;
    const limit = f.spend <= 0 ? w.noSpend : f.spend >= w.overAmount ? w.overAfter : w.underAfter;
    const turns = fanTurnsSince(s.entries.filter((e) => e.kind === "fan" || e.kind === "jazz").map((e) => ({ source: e.kind === "fan" ? "fan" : "assistant", created_at: e.at })), s.purchasedAt);
    if (limit > 0 && turns >= limit) return `time waster (${turns} messages since the last purchase, limit ${limit})`;
  }
  return null;
}

/** After the writer or a flow sent something: arm the follow-up nudge and the "silent fan" PPV. */
function afterSend(s: Sim, cfg: SimConfig, nudge = true) {
  unschedule(s, "followup", "ppv");
  if (!cfg.enabled || !cfg.handleChats || s.human) return;
  if (nudge && cfg.adv.followUp.on) schedule(s, s.now + between(s, cfg.adv.followUp.min, cfg.adv.followUp.max) * MIN, { kind: "followup" });
  if (cfg.adv.silentPpv.on && cfg.bumpOn) schedule(s, s.now + between(s, cfg.adv.silentPpv.min, cfg.adv.silentPpv.max) * MIN, { kind: "ppv" });
}

// ---- spam: a flood of messages is answered once (after the fan stops), and a real flood is muted until the fan calms down
const FLOOD = { count: 6, within: 2 * MIN, calm: 10 * MIN };
/** The fan wrote many messages in a short time, or the same thing again and again, with no reply from her in between. */
function flooding(s: Sim): boolean {
  const since = s.lastHerAt ?? 0;
  const fresh = s.entries.filter((e) => e.kind === "fan" && e.at > since);
  const recent = fresh.filter((e) => s.now - e.at <= FLOOD.within);
  const same = fresh.slice(-4).map((e) => e.text.trim().toLowerCase());
  return recent.length >= FLOOD.count || (same.length >= 4 && new Set(same).size === 1);
}

// ---- bumps
const BUMP_OF: Record<string, keyof Advanced["triggers"]> = { Online: "online", Tipped: "purchase", "Engaged with a post": "engage" };
/** The bump rules that also hold for a script started by the same event (recent message, Exclude fans from Bump). Null = allowed. */
function bumpBlocked(s: Sim, cfg: SimConfig): string | null {
  const recent = Math.max(s.lastFanAt ?? 0, s.lastHerAt ?? 0);
  if (recent && s.now - recent < cfg.adv.noBumpHours * HOUR) return "messaged recently";
  const t = cfg.targeting.bump;
  if (t.newFans.on && s.fan.subscribedDays < t.newFans.days) return "new fan";
  if (t.oldFans.on && s.fan.subscribedDays > t.oldFans.days) return "old fan";
  if (t.excludeLists.some((id) => s.fan.lists.includes(id))) return "excluded list";
  return null;
}
function startBump(s: Sim, cfg: SimConfig, trigger: string) {
  const skip = (why: string) => sys(s, `Bump skipped (${trigger}): ${why}`);
  if (!cfg.enabled || !cfg.bumpOn) return skip("Bump fans is off");
  if (!cfg.adv.triggers[BUMP_OF[trigger]!]) return skip("this trigger is switched off in Advanced Settings");
  if (s.human) return skip("a person has the chat");
  const recent = Math.max(s.lastFanAt ?? 0, s.lastHerAt ?? 0);
  if (recent && s.now - recent < cfg.adv.noBumpHours * HOUR) return skip(`messaged within the last ${cfg.adv.noBumpHours} hours`);
  const t = cfg.targeting.bump;
  if (t.newFans.on && s.fan.subscribedDays < t.newFans.days) return skip("new fan (Exclude fans from Bump)");
  if (t.oldFans.on && s.fan.subscribedDays > t.oldFans.days) return skip("old fan (Exclude fans from Bump)");
  if (t.excludeLists.some((id) => s.fan.lists.includes(id))) return skip("on an excluded fan list");
  const fits = cfg.bumps.filter((b) => b.live && b.data.trigger === trigger && !b.data.neverLists.some((id) => s.fan.lists.includes(id)) && (!b.data.onlyLists.length || b.data.onlyLists.some((id) => s.fan.lists.includes(id))));
  if (!fits.length) return skip("no live bump message matches");
  const fresh = fits.filter((b) => !s.sent.includes(`b:${b.id}`));
  if (!fresh.length) return skip("every matching bump was already sent to this fan");
  const pick = fresh[Math.floor(rand(s) * fresh.length)]!;
  schedule(s, s.now + replyDelay(s, cfg), { kind: "bump", bump: pick.id });
  sys(s, `Bump chosen (${trigger}), going out after the message delay`);
}

// ---- scripts that start by themselves: on an event (subscribe, online, tip...) or on keywords in a fan message.
// Steps go out in order, word for word with {name} filled in: each after the fan answers the one before, or after a wait.
// A script whose start comes while a person has the chat (money moved, escalation) offers its first step as a draft for that person.
type ScriptStart = NonNullable<Item<"script">["data"]["startsOn"]>;
const activeScript = (s: Sim) => (s.scriptRuns ?? []).find((r) => !r.done);
const keywordHit = (keywords: string[] | undefined, text: string) => (keywords ?? []).some((k) => k.trim() && text.toLowerCase().includes(k.trim().toLowerCase()));
function startScripts(s: Sim, cfg: SimConfig, on: ScriptStart, text = ""): boolean {
  if (!cfg.enabled || !cfg.handleChats) return false;
  const fits = (cfg.scripts ?? []).filter((x) => x.live && x.data.startsOn === on && x.data.steps.length && (on !== "keywords" || keywordHit(x.data.keywords, text)));
  if (on === "content" && !asksForContent(text)) return false;
  const sc = fits[0];
  if (!sc) return false;
  const running = activeScript(s);
  // a script that only waits on a timer gives way to a script the fan's own words call for; any other running script keeps going
  if (running && !running.waitingReply && (on === "keywords" || on === "content")) endScripts(s, `interrupted by "${sc.data.name}"`);
  else if (running) { sys(s, `Script "${sc.data.name}" not started: another script is running`); return false; }
  const why = verdict(s, cfg);
  if (why) { sys(s, `Script "${sc.data.name}" not started: ${why} (targeting)`); return false; }
  if (s.human) {
    say(s, "draft", fill(sc.data.steps[0]!, s), { tag: `Script draft: ${sc.data.name}` });
    sys(s, `Script "${sc.data.name}" would start, but a person has the chat: its first step waits as a draft for them`);
    return false;
  }
  const run: ScriptRun = { id: s.seq++, script: sc.id, name: sc.data.name, step: 0, waitingReply: false, lastAt: s.now, unpaid: 0, done: false };
  (s.scriptRuns ??= []).push(run);
  sys(s, `Script "${sc.data.name}" started (${on === "keywords" ? "the fan's message matched a keyword" : on === "content" ? "the fan asked for content" : on})`);
  const first = sc.data.stepOptions?.[0];
  schedule(s, s.now + (first?.afterReply === false && first.waitMinutes ? first.waitMinutes * MIN : replyDelay(s, cfg)), { kind: "script", run: run.id });
  return true;
}
/** The fan answered while a script waits for an answer: the next step goes out (no writer call). */
function scriptHeardFan(s: Sim, cfg: SimConfig): boolean {
  const run = activeScript(s);
  if (!run) return false;
  // A step that is about to go out (within a few minutes) absorbs his message; a long timed wait does not: he gets an answer (a keyword script, or the writer) instead of silence.
  if (!run.waitingReply) return s.jobs.some((j) => j.kind === "script" && j.run === run.id && j.phase !== 1 && j.at - s.now <= 3 * MIN);
  run.waitingReply = false;
  unschedule(s, "reply");
  schedule(s, s.now + replyDelay(s, cfg), { kind: "script", run: run.id });
  return true;
}
function stepScript(s: Sim, cfg: SimConfig, job: Job, turns: () => Turn[]): Ask | null {
  const run = (s.scriptRuns ?? []).find((r) => r.id === job.run);
  const sc = (cfg.scripts ?? []).find((x) => x.id === run?.script);
  if (!run || run.done || !sc) return null;
  const end = (why: string): null => { run.done = true; sys(s, `Script "${run.name}" ${why}`); return null; };
  if (job.phase === 1) { if (run.waitingReply && run.lastAt === job.at - (sc.data.expiresHours ?? 6) * HOUR) end(`expired: no answer for ${sc.data.expiresHours ?? 6} h`); return null; }
  if (s.human) return end("stopped: a person has the chat");
  const why = verdict(s, cfg);
  if (why) return end(`stopped: ${why}`);
  if (!isOpen(cfg.adv, s.now)) {
    const at = nextOpen(cfg.adv, s.now);
    if (!at) return end("stopped: outside active hours");
    sys(s, `Script "${run.name}": the next step waits for active hours`);
    schedule(s, at, { kind: "script", run: run.id });
    return null;
  }
  const opt = sc.data.stepOptions?.[run.step];
  // "Jazz writes it in her voice": the writer gets the step as an instruction and reacts to what the fan just said
  if (opt?.mode === "rewrite") {
    const product = stepProduct(s, cfg, opt.productId);
    return { kind: "step", turns: turns(), instruction: `${sc.data.steps[run.step]!}${product ? ` (the offer: "${product.data.name}" for $${product.data.price}; name it and give that exact price)` : ""}`, run: run.id };
  }
  sendStep(s, cfg, run, sc, fill(sc.data.steps[run.step]!, s));
  return null;
}
const SMALL = new Set(["you", "your", "have", "any", "the", "and", "for", "with", "how", "much", "are", "can", "want", "some", "this", "that", "what", "get", "does", "send", "show", "see", "pics", "pic", "videos", "video", "set", "content", "hey", "babe", "baby", "thank", "please", "love", "just", "like", "look", "around", "let", "know", "there"]);
const wordsOf = (t: string) => new Set((t.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []).filter((w) => !SMALL.has(w)));
function bestProduct(s: Sim, cfg: SimConfig): Item<"product"> | undefined {
  const asked = wordsOf(s.entries.filter((e) => e.kind === "fan").slice(-3).map((e) => e.text).join(" "));
  const bought = s.purchases.length; // the more he has bought, the further up her ladder
  const live = cfg.products.filter((p) => p.live && !p.data.bundle).sort((a, b) => a.data.progression - b.data.progression);
  const fit = (p: Item<"product">) => { let n = 0; for (const w of wordsOf(`${p.data.name} ${p.data.tags.join(" ")} ${p.data.description}`)) if (asked.has(w)) n++; return n; };
  const unseen = live.filter((p) => !s.sent.includes(`p:${p.id}`)); // never the same thing twice while there is something he has not been offered
  const pool = unseen.length ? unseen : live;
  const ranked = pool.map((p, i) => ({ p, i, n: fit(p) })).sort((a, b) => b.n - a.n || a.p.data.progression - b.p.data.progression || a.i - b.i);
  const top = ranked[0];
  if (top && top.n > 0) return top.p;
  return pool[Math.min(unseen.length ? 0 : bought, pool.length - 1)]; // nothing matches his words: the next rung of her ladder
}
const stepProduct = (s: Sim, cfg: SimConfig, productId: number | null | undefined): Item<"product"> | undefined => {
  if (productId === 0) return bestProduct(s, cfg);
  const fixed = productId ? cfg.products.find((p) => p.id === productId && p.live) : undefined;
  if (fixed && s.sent.includes(`p:${fixed.id}`)) return bestProduct(s, cfg) ?? fixed; // already offered to this fan: a different product
  return fixed;
};
/** Sends one step (the text is final), then arms what comes next: the next step, the end, or the wait for an answer. */
function sendStep(s: Sim, cfg: SimConfig, run: ScriptRun, sc: Item<"script">, text: string) {
  const end = (why: string) => { run.done = true; sys(s, `Script "${run.name}" ${why}`); };
  const opt = sc.data.stepOptions?.[run.step];
  const product = stepProduct(s, cfg, opt?.productId);
  if (product) s.sent.push(`p:${product.id}`);
  say(s, "jazz", text, { tag: `Script: ${run.name} \u00b7 step ${run.step + 1}/${sc.data.steps.length}`, price: product?.data.price || undefined, media: product?.data.media.length || undefined, items: product?.data.media.slice(0, 6), note: product ? `Offer: ${product.data.name}` : undefined });
  s.lastHerAt = s.now; run.lastAt = s.now; run.step++;
  if (product) run.unpaid++;
  unschedule(s, "followup", "ppv"); // the script is talking: no nudge and no silent-fan PPV on top of it
  if (sc.data.exitOn && run.unpaid >= (sc.data.exitLimit ?? 2)) return end(`ended: ${run.unpaid} PPVs sent in the script are not bought`);
  if (run.step >= sc.data.steps.length) { end("completed"); return afterSend(s, cfg, false); }
  const next = sc.data.stepOptions?.[run.step];
  if (next?.afterReply === false) schedule(s, s.now + (next.waitMinutes ?? 0) * MIN, { kind: "script", run: run.id });
  else { run.waitingReply = true; const hours = sc.data.expiresHours ?? 6; if (hours > 0) schedule(s, s.now + hours * HOUR, { kind: "script", run: run.id, phase: 1 }); }
}

// ---- flows
function startFlows(s: Sim, cfg: SimConfig, match: (start: FlowNode) => boolean) {
  for (const f of cfg.flows) {
    if (!f.live || f.data.status !== "active") continue;
    const start = f.data.nodes.find((n) => n.kind === "start");
    if (!start || !match(start) || s.runs.some((r) => r.flow === f.id && !r.done)) continue;
    const run: Run = { id: s.seq++, flow: f.id, title: f.data.title, startedAt: s.now, spent0: s.fan.spend, done: false, lastSentAt: null, replied: false, sales: 0 };
    s.runs.push(run);
    sys(s, `Flow "${f.data.title}" started (${String(start.config.trigger)})`);
    const first = flowKids(f.data.nodes, start.id)[0];
    if (first) schedule(s, s.now, { kind: "step", run: run.id, node: first.id });
    else { run.done = true; sys(s, `Flow "${f.data.title}" completed`); }
  }
}
function stepRun(s: Sim, cfg: SimConfig, job: Job) {
  const run = s.runs.find((r) => r.id === job.run);
  const flow = cfg.flows.find((f) => f.id === run?.flow);
  const node = flow?.data.nodes.find((n) => n.id === job.node);
  if (!run || run.done || !flow || !node) return;
  const done = (why: string) => { run.done = true; sys(s, `Flow "${run.title}" ${why}`); };
  const next = (from: FlowNode, branch: FlowNode["branch"] = null, at = s.now) => { const n = flowKids(flow.data.nodes, from.id, branch)[0]; if (n) schedule(s, at, { kind: "step", run: run.id, node: n.id }); else done("completed"); };
  const ex = flow.data.exit;
  if (ex.superFan && s.fan.tags.includes("Super Fan")) return done("ended: exit rule (Super Fan)");
  if (ex.spentOn && s.fan.spend > ex.spent) return done(`ended: exit rule (spent more than $${ex.spent})`);
  const c = node.config;
  if (node.kind === "delay") {
    const ms = Number(c.amount) * (UNIT[String(c.unit)] ?? MIN);
    sys(s, `Flow "${run.title}": waiting ${c.amount} ${c.unit}`);
    return next(node, null, s.now + ms);
  }
  if (node.kind === "condition") {
    if (!job.phase && Number(c.waitSeconds) > 0) return schedule(s, s.now + Number(c.waitSeconds) * 1000, { kind: "step", run: run.id, node: node.id, phase: 1 });
    const since = run.lastSentAt ?? run.startedAt;
    const yes = c.type === "replied" ? (s.lastFanAt ?? 0) > since : c.type === "purchased" ? (s.purchasedAt ?? 0) > since : c.more ? s.fan.spend > Number(c.amount) : s.fan.spend < Number(c.amount);
    sys(s, `Flow "${run.title}": condition ${yes ? "true" : "false"}`);
    return next(node, yes ? "true" : "false");
  }
  if (node.kind === "tag") {
    const tag = String(c.tag);
    if (!s.fan.tags.includes(tag)) s.fan.tags.push(tag);
    sys(s, `Flow "${run.title}": tagged the fan "${tag}"`);
    next(node);
    return startFlows(s, cfg, (st) => st.config.trigger === "Fan Tagged As..." && String(st.config.tag).toLowerCase() === tag.toLowerCase());
  }
  if (node.kind === "message") {
    if (!isOpen(cfg.adv, s.now)) { const at = nextOpen(cfg.adv, s.now); sys(s, "Flow message waits for active hours"); return at ? schedule(s, at, { kind: "step", run: run.id, node: node.id }) : done("stopped: never inside active hours"); }
    if (!job.phase && cfg.adv.delay.on) return schedule(s, s.now + replyDelay(s, cfg), { kind: "step", run: run.id, node: node.id, phase: 1 });
    if (c.skipIfBought && s.purchasedAt && s.purchasedAt >= run.startedAt) { sys(s, `Flow "${run.title}": message skipped (the fan already purchased)`); return next(node); }
    if (c.skipRecent && s.lastFanAt && s.now - s.lastFanAt < HOUR) { sys(s, `Flow "${run.title}": message skipped (the fan wrote recently)`); return next(node); }
    const key = `m:${String(c.text).trim().toLowerCase()}`;
    if (s.sent.includes(key)) { sys(s, `Flow "${run.title}": message skipped (this fan already got it)`); return next(node); }
    const items = (Array.isArray(c.media) ? c.media : []).slice(0, 6) as { id: string; type: string }[];
    const media = Array.isArray(c.media) ? c.media.length : 0;
    const pr = c.aiPricing ? personalPrice(s, Number(c.price)) : { price: Number(c.price), note: undefined };
    const e = say(s, "jazz", fill(String(c.text), s), { tag: `Flow: ${run.title}`, price: pr.price || undefined, note: pr.note, media: media || undefined, items });
    s.sent.push(key);
    run.lastSentAt = s.now; s.lastHerAt = s.now;
    if (c.unsendOn) schedule(s, s.now + 8 * HOUR, { kind: "unsend", ref: e.id });
    afterSend(s, cfg);
    return next(node);
  }
  next(node); // merge
}

// ---- the clock
type Due = { ask: Ask | null };
/** What the fan could see around one of her texts, as a note for the writer: a bump, a locked offer (price, media). */
function marks(e: Entry): string {
  if (e.kind !== "jazz") return "";
  const parts = [e.tag?.startsWith("Bump") ? "a bump message" : e.tag === "Mass Message" ? "a mass message" : e.tag?.startsWith("Script:") ? "a script step" : "", e.price ? `locked PPV $${e.price}${e.note?.startsWith("Offer: ") ? ` "${e.note.slice(7)}"` : ""}${e.media ? ` with ${e.media} media` : ""}` : e.media ? `${e.media} media` : ""].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function runJob(s: Sim, cfg: SimConfig, job: Job): Due {
  const turns = (): Turn[] => s.entries.filter((e) => (e.kind === "fan" || e.kind === "jazz") && !e.unsent).slice(-12).map((e) => ({ from: e.kind === "fan" ? "fan" : "creator", text: e.text + marks(e) }));
  const quiet = (sinceAt: number) => (s.lastFanAt ?? 0) <= sinceAt;
  if (job.kind === "calm") {
    if (s.muted && s.now - (s.lastFanAt ?? 0) >= FLOOD.calm) { s.muted = false; sys(s, "The fan calmed down: replies are back on"); if ((s.lastFanAt ?? 0) > (s.lastHerAt ?? 0)) schedule(s, s.now, { kind: "reply" }); }
    else if (s.muted) schedule(s, (s.lastFanAt ?? s.now) + FLOOD.calm, { kind: "calm" });
    return { ask: null };
  }
  if (job.kind === "step") { stepRun(s, cfg, job); return { ask: null }; }
  if (job.kind === "script") return { ask: stepScript(s, cfg, job, turns) };
  if (job.kind === "open") { if ((s.lastFanAt ?? 0) > (s.lastHerAt ?? 0)) schedule(s, s.now + replyDelay(s, cfg), { kind: "reply" }); return { ask: null }; }
  if (job.kind === "reply" && job.thanks) {
    if (s.human) return { ask: null };
    const next = bestProduct(s, cfg);
    const seen = cfg.products.filter((p) => s.sent.includes(`p:${p.id}`)).map((p) => p.data.name);
    return { ask: { kind: "reply", turns: turns().length ? turns() : [{ from: "fan", text: `(paid $${job.thanks})` }], instruction: `The fan just paid $${job.thanks}. Thank him warmly in a few words${next ? `, then offer ONE thing he has not been offered yet (the offer: "${next.data.name}" for $${next.data.price}; name it and give that exact price)` : ""}.${seen.length ? ` Already offered to him, do not offer again: ${seen.join(", ")}.` : ""}` } };
  }
  if (job.kind === "reply") return { ask: s.human ? null : { kind: "reply", turns: turns() } };
  if ((job.kind === "followup" || job.kind === "ppv") && activeScript(s)) return { ask: null };
  if (job.kind === "followup") {
    if (s.human || !quiet(s.lastHerAt ?? s.now) || !isOpen(cfg.adv, s.now)) return { ask: null };
    // a bump text is written for its trigger ("you're online", "you liked my post"), so only an Online bump, and only while the fan is online, can be the nudge
    const b = cfg.bumpOn && s.online && !s.expired ? cfg.bumps.find((x) => x.live && x.data.trigger === "Online" && !s.sent.includes(`b:${x.id}`)) : undefined;
    if (b) {
      const e = say(s, "jazz", fill(b.data.message, s), { tag: "Bump · Follow-up", price: b.data.price || undefined, media: b.data.media.length || undefined, items: b.data.media.slice(0, 6) });
      s.sent.push(`b:${b.id}`);
      s.lastHerAt = s.now;
      if (cfg.adv.unsend.on) schedule(s, s.now + cfg.adv.unsend.hours * HOUR + cfg.adv.unsend.minutes * MIN, { kind: "unsend", ref: e.id });
      afterSend(s, cfg, false);
      return { ask: null };
    }
    return { ask: { kind: "followup", turns: turns() } };
  }
  if (job.kind === "bump") {
    const b = cfg.bumps.find((x) => x.id === job.bump);
    if (!b || s.human) return { ask: null };
    if (!isOpen(cfg.adv, s.now)) { sys(s, "Bump skipped: outside active hours"); return { ask: null }; }
    const e = say(s, "jazz", fill(b.data.message, s), { tag: `Bump · ${b.data.trigger}`, price: b.data.price || undefined, media: b.data.media.length || undefined, items: b.data.media.slice(0, 6) });
    s.sent.push(`b:${b.id}`);
    s.lastHerAt = s.now;
    if (cfg.adv.unsend.on) schedule(s, s.now + cfg.adv.unsend.hours * HOUR + cfg.adv.unsend.minutes * MIN, { kind: "unsend", ref: e.id });
    afterSend(s, cfg);
    return { ask: null };
  }
  if (job.kind === "unsend") {
    const e = s.entries.find((x) => x.id === job.ref);
    if (e && !e.unsent && quiet(e.at)) { e.unsent = true; sys(s, `Unsent: "${e.text.slice(0, 40)}": the fan did not reply in time`); }
    return { ask: null };
  }
  if (job.kind === "ppv") {
    if (s.human || !quiet(s.lastHerAt ?? s.now) || !isOpen(cfg.adv, s.now)) return { ask: null };
    const lim = cfg.adv.silentPpv.limitOn ? cfg.adv.silentPpv.exclusivity : 4;
    const fits = cfg.products.filter((x) => x.live && x.data.progression <= lim).sort((a, b) => a.data.progression - b.data.progression);
    const p = fits.find((x) => !s.sent.includes(`p:${x.id}`));
    if (!p) { sys(s, fits.length ? "Silent fan: every product that fits was already sent to this fan" : "Silent fan: no live product fits the exclusivity limit"); return { ask: null }; }
    const pr = personalPrice(s, p.data.price);
    say(s, "jazz", `${p.data.name}${p.data.description ? `: ${p.data.description}` : ""}`, { tag: "PPV to a silent fan", price: pr.price, note: pr.note, media: p.data.media.length || undefined, items: p.data.media.slice(0, 6) });
    s.sent.push(`p:${p.id}`);
    s.lastHerAt = s.now;
    return { ask: null };
  }
  return { ask: null };
}

/** Runs the clock forward to `s.target`; stops early when the writer has to be asked (the answer goes to `deliver`, then call `resume`). */
function pump(s: Sim, cfg: SimConfig): Ask | null {
  for (;;) {
    s.jobs.sort((a, b) => a.at - b.at || a.id - b.id);
    const job = s.jobs[0];
    if (!job || job.at > s.target) { s.now = s.target; s.waiting = false; return null; }
    s.jobs.shift();
    s.now = Math.max(s.now, job.at);
    const { ask } = runJob(s, cfg, job);
    syncTags(s, cfg);
    if (ask) { s.waiting = true; return ask; }
  }
}
const copy = (sim: Sim): Sim => structuredClone(sim);

export function advance(sim: Sim, cfg: SimConfig, ms: number): { sim: Sim; ask: Ask | null } {
  const s = copy(sim);
  s.target = Math.max(s.target, s.now) + ms;
  return { sim: s, ask: pump(s, cfg) };
}
export function resume(sim: Sim, cfg: SimConfig): { sim: Sim; ask: Ask | null } {
  const s = copy(sim);
  return { sim: s, ask: pump(s, cfg) };
}

/** The writer's answer to an ask. `autopilot` sends it; otherwise it waits as a draft for `approve`. */
export function deliver(sim: Sim, cfg: SimConfig, ask: Ask, a: Answer, autopilot: boolean): Sim {
  const s = copy(sim);
  s.waiting = false;
  if (a.needsHuman) { escalate(s, a.reason || "the writer asked for help"); syncTags(s, cfg); return s; }
  if (!a.reply.trim() && ask.kind !== "step") { sys(s, "The writer wrote nothing (treated as spam)"); return s; }
  if (ask.kind === "step") {
    const run = (s.scriptRuns ?? []).find((r) => r.id === ask.run);
    const sc = (cfg.scripts ?? []).find((x) => x.id === run?.script);
    if (!run || run.done || !sc) return s;
    // a refusal or an empty answer never leaves the step silent: the step's own text goes out
    const offered = stepProduct(s, cfg, sc.data.stepOptions?.[run.step]?.productId);
    const usable = a.reply.trim() && (!offered || a.reply.toLowerCase().includes(offered.data.name.toLowerCase())); // a step with an offer must name it
    if (usable) { sendStep(s, cfg, run, sc, a.reply); return s; }
    // The step text of a "Jazz writes it" step is an instruction, not a message: it never goes to the fan. A step with an offer sends a plain offer line; otherwise the script stops and the writer answers normally.
    if (sc.data.stepOptions?.[run.step]?.mode === "rewrite") {
      if (offered) sendStep(s, cfg, run, sc, `I have something for you ${s.fan.name.trim() || "babe"} \u{1F618} ${offered.data.name} for $${offered.data.price}`);
      else { run.done = true; sys(s, `Script "${run.name}" stopped: the writer did not answer the step`); schedule(s, s.now, { kind: "reply" }); }
      return s;
    }
    sendStep(s, cfg, run, sc, fill(sc.data.steps[run.step]!, s));
    return s;
  }
  const named = cfg.products.find((p) => p.live && p.data.name.trim() && a.reply.toLowerCase().includes(p.data.name.trim().toLowerCase()));
  if (named) s.sent.push(`p:${named.id}`);
  const offer = named ? { price: named.data.price || undefined, media: named.data.media.length || undefined, items: named.data.media.slice(0, 6), note: `Offer: ${named.data.name}` } : {};
  if (!autopilot) { say(s, "draft", a.reply, { tag: ask.kind === "followup" ? "Follow-up draft" : "Draft", ...offer }); return s; }
  say(s, "jazz", a.reply, { tag: ask.kind === "followup" ? "Follow-up" : "Reply", ...offer });
  s.lastHerAt = s.now;
  afterSend(s, cfg, ask.kind !== "followup"); // one nudge per silence
  return s;
}
export function approve(sim: Sim, cfg: SimConfig, id: number): Sim {
  const s = copy(sim);
  const e = s.entries.find((x) => x.id === id && x.kind === "draft");
  if (!e) return s;
  const nudge = e.tag !== "Follow-up draft";
  e.kind = "jazz"; e.at = s.now; e.tag = nudge ? "Reply" : "Follow-up";
  s.lastHerAt = s.now;
  afterSend(s, cfg, nudge);
  return s;
}
export function discard(sim: Sim, id: number): Sim { const s = copy(sim); s.entries = s.entries.filter((x) => !(x.id === id && x.kind === "draft")); return s; }

/** A manager pauses Jazz for this chat (by default only managers may). Nothing Jazz had queued for this fan runs. */
export function pauseChat(sim: Sim, cfg: SimConfig): Sim {
  const s = copy(sim);
  if (s.human) return s;
  s.human = true; s.paused = true;
  unschedule(s, "reply", "followup", "ppv", "open", "calm");
  sys(s, "A manager paused Jazz for this chat");
  endScripts(s, "stopped: a manager paused the chat");
  syncTags(s, cfg);
  return s;
}
/** A human chatter answers while Jazz is off this chat. */
export function chatterReply(sim: Sim, cfg: SimConfig, text: string): Sim {
  const s = copy(sim);
  if (!s.human || !text.trim()) return s;
  say(s, "jazz", text.trim(), { tag: "Chatter", chatter: true });
  s.lastHerAt = s.now;
  syncTags(s, cfg);
  return s;
}
/** The chat goes back to Jazz. If the fan wrote last and nobody answered, Jazz answers (like "reply to unread messages"). */
export function giveBack(sim: Sim, cfg: SimConfig): Sim {
  const s = copy(sim);
  if (!s.human) return s;
  s.human = false; s.paused = false; s.escalations = [];
  sys(s, "The chat is back with Jazz");
  if (cfg.enabled && cfg.handleChats && (s.lastFanAt ?? 0) > (s.lastHerAt ?? 0)) { sys(s, "Replying to the unread message"); schedule(s, s.now + replyDelay(s, cfg), { kind: "reply" }); }
  syncTags(s, cfg);
  s.target = Math.max(s.target, s.now);
  return s;
}

/** How each flow is doing for this fan (the Started / Replied / Sales counters). */
export function flowResults(sim: Sim): { title: string; running: boolean; replied: boolean; sales: number }[] {
  return sim.runs.map((r) => ({ title: r.title, running: !r.done, replied: r.replied, sales: r.sales }));
}

/** Something the fan did. */
export function fire(sim: Sim, cfg: SimConfig, ev: Event): Sim {
  const s = copy(sim);
  if (ev.t === "message") {
    say(s, "fan", ev.text, {});
    s.lastFanAt = s.now;
    for (const r of s.runs) if (r.lastSentAt && !r.replied) r.replied = true; // replies are credited to the flow that was talking to him
    unschedule(s, "followup", "ppv");
    if (!cfg.enabled || !cfg.handleChats) sys(s, `${cfg.creator}'s AI chat is off: nothing is written`);
    else if (!s.human) {
      const why = verdict(s, cfg);
      if (why) escalate(s, `Targeting: ${why}`);
      else if (CUSTOM.test(ev.text)) escalate(s, "custom request (the creator has to confirm it)");
      else if (isBotQuestion(ev.text)) escalate(s, "the fan asks whether this is a bot or a real person");
      else if (asksForFacts(ev.text)) escalate(s, "the fan asks for a promise or a fact only the creator can give");
      else if (!isOpen(cfg.adv, s.now)) {
        const at = cfg.adv.respondWhenBack ? nextOpen(cfg.adv, s.now) : null;
        if (at) { schedule(s, at, { kind: "open" }); sys(s, "Outside active hours: the reply waits until she is back"); } else sys(s, "Outside active hours: the message is ignored");
      } else if (s.muted || flooding(s)) {
        if (!s.muted) { s.muted = true; sys(s, "Spam: too many messages in a row. Jazz stops replying until the fan calms down"); }
        unschedule(s, "reply");
        schedule(s, s.now + FLOOD.calm, { kind: "calm" });
      } else if (!scriptHeardFan(s, cfg) && !startScripts(s, cfg, "keywords", ev.text) && !startScripts(s, cfg, "content", ev.text)) {
        unschedule(s, "reply"); // several messages in a row: one reply, after the last one
        schedule(s, s.now + replyDelay(s, cfg), { kind: "reply" });
      }
    }
  } else if (ev.t === "online") { s.online = true; sys(s, "The fan comes online"); if (bumpBlocked(s, cfg) || !startScripts(s, cfg, "online")) startBump(s, cfg, "Online"); }
  else if (ev.t === "offline") { s.online = false; sys(s, "The fan goes offline"); }
  else if (ev.t === "unlock") {
    const e = s.entries.find((x) => x.id === ev.entry);
    if (!e || !e.price || e.unlocked || e.unsent) return s;
    return fire(s, cfg, { t: "buy", amount: e.price }); // the unlock is a purchase of that PPV: it opens the media
  }
  else if (ev.t === "mass") { say(s, "jazz", fill(ev.text, s), { tag: "Mass Message", price: ev.price || undefined, media: ev.media || undefined, items: ev.items?.slice(0, 6) }); s.lastHerAt = s.now; afterSend(s, cfg, false); }
  else if (ev.t === "like") { sys(s, "The fan likes a post"); if (bumpBlocked(s, cfg) || !startScripts(s, cfg, "like")) startBump(s, cfg, "Engaged with a post"); }
  else if (ev.t === "subscribe") { sys(s, "A new subscriber"); s.fan.subscribedDays = 0; startFlows(s, cfg, (st) => st.config.trigger === "New Subscriber"); startScripts(s, cfg, "subscribe"); }
  else if (ev.t === "expire") {
    s.expired = true; s.online = false;
    sys(s, "The subscription expires");
    sys(s, "Follow-back bot: the expired fan is followed so he can be messaged again");
    startFlows(s, cfg, (st) => st.config.trigger === "Expired Fan Followed");
    startScripts(s, cfg, "expire");
  } else if (ev.t === "renewoff") { s.renewOff = true; sys(s, "The fan turns auto-renew off"); }
  else if (ev.t === "resubscribe") {
    s.expired = false; s.renewOff = false; s.fan.subscribedDays = 0; s.start = s.now;
    sys(s, "The fan resubscribes");
    for (const r of s.runs) if (r.lastSentAt) sys(s, `Resubscribe credited to flow "${r.title}"`);
    startScripts(s, cfg, "resubscribe");
  }
  else if (ev.t === "tag") { if (!s.fan.tags.includes(ev.tag)) s.fan.tags.push(ev.tag); sys(s, `The fan is tagged "${ev.tag}"`); startFlows(s, cfg, (st) => st.config.trigger === "Fan Tagged As..." && String(st.config.tag).toLowerCase() === ev.tag.toLowerCase()); }
  else if (ev.t === "tip" || ev.t === "buy") {
    const before = s.fan.spend;
    s.fan.spend += ev.amount; s.purchasedAt = s.now;
    const locked = [...s.entries].reverse().find((x) => x.kind === "jazz" && x.price && !x.unlocked && !x.unsent);
    if (locked) { locked.unlocked = true; sys(s, `The fan unlocks "${locked.text.slice(0, 40)}" ($${locked.price})`); }
    sys(s, ev.t === "tip" ? `The fan tips $${ev.amount}` : `The fan buys a PPV for $${ev.amount}`);
    for (const r of s.runs) {
      const goal = cfg.flows.find((f) => f.id === r.flow)?.data.goal;
      if (!r.done && goal?.on && before - r.spent0 <= goal.amount && s.fan.spend - r.spent0 > goal.amount) sys(s, `Goal reached in flow "${r.title}" (spent more than $${goal.amount})`);
    }
    s.purchases.push(ev.amount);
    for (const r of s.runs) if (r.lastSentAt && s.now - r.lastSentAt < 3 * DAY) { r.sales += ev.amount; sys(s, `$${ev.amount} credited to flow "${r.title}"`); }
    startFlows(s, cfg, (st) => st.config.trigger === "Fan Total Spent Exceeded..." && before <= Number(st.config.amount) && s.fan.spend > Number(st.config.amount));
    if (cfg.enabled && cfg.handleChats && !s.human && cfg.adv.afterPayment !== "jazz") escalate(s, `${ev.t === "tip" ? "a tip" : "a purchase"} (the writer stops after money moves)`);
    else if (cfg.enabled && cfg.handleChats && !s.human) sys(s, "Jazz keeps the chat after the payment (Advanced Settings)");
    const started = startScripts(s, cfg, ev.t);
    const sentBefore = s.jobs.length;
    if (!started) startBump(s, cfg, "Tipped");
    // nothing of hers is on its way (no tip script, no Tipped bump): Jazz thanks him and offers something he has not been offered yet
    if (cfg.adv.afterPayment === "jazz" && cfg.enabled && cfg.handleChats && !s.human && !started && s.jobs.length === sentBefore) schedule(s, s.now + replyDelay(s, cfg), { kind: "reply", thanks: ev.amount });
  }
  syncTags(s, cfg);
  s.target = Math.max(s.target, s.now);
  return s;
}

/** What is queued, for the "waiting" list (soonest first). */
export function waitingJobs(sim: Sim, cfg: SimConfig): { in: number; label: string }[] {
  const name: Record<JobKind, string> = { calm: "Spam cool-down ends", reply: "Write the reply", followup: "Follow-up nudge", bump: "Send a bump message", ppv: "PPV to a silent fan", unsend: "Unsend a message", step: "Flow step", open: "Reply after hours", script: "Script step" };
  return [...sim.jobs].sort((a, b) => a.at - b.at).map((j) => ({ in: Math.max(0, j.at - sim.now), label: j.kind === "step" ? `Flow "${sim.runs.find((r) => r.id === j.run)?.title ?? ""}": ${cfg.flows.find((f) => f.id === sim.runs.find((r) => r.id === j.run)?.flow)?.data.nodes.find((n) => n.id === j.node)?.kind ?? "step"}` : j.kind === "script" ? `Script "${(sim.scriptRuns ?? []).find((r) => r.id === j.run)?.name ?? ""}": ${j.phase === 1 ? "expires if no answer" : "next step"}` : name[j.kind] }));
}

/** Try Jazz "this test uses": products, bump messages and flows switched on or off for this test only (nothing is saved). A flow switched on runs even when it is a draft. */
export function withPicks(cfg: SimConfig, picks: Record<string, boolean>): SimConfig {
  const on = (key: string, dflt: boolean) => picks[key] ?? dflt;
  return {
    ...cfg,
    products: cfg.products.map((p) => ({ ...p, live: on(`p:${p.id}`, p.live) })),
    bumps: cfg.bumps.map((b) => ({ ...b, live: on(`b:${b.id}`, b.live) })),
    scripts: (cfg.scripts ?? []).map((x) => ({ ...x, live: on(`s:${x.id}`, x.live) })),
    flows: cfg.flows.map((f) => {
      const v = on(`f:${f.id}`, f.live && f.data.status === "active");
      return { ...f, live: v, data: { ...f.data, status: v ? "active" : f.data.status === "active" ? "stopped" : f.data.status } };
    }),
  };
}

/** The writer did not answer (a timeout, an error). That is not a reason to hand the chat to a person: the fan's message is simply still unanswered. */
export function writerFailed(sim: Sim, why: string): Sim {
  const s = copy(sim);
  s.waiting = false;
  sys(s, `The writer did not answer (${why}). Nothing was sent: send the message again or press +1 min.`);
  return s;
}

