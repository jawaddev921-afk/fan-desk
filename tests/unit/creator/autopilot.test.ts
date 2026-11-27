import assert from "node:assert/strict";
import { test } from "node:test";
import { writerFailed, withPicks, advance, approve, chatterReply, deliver, fanTags, fire, flowResults, giveBack, newSim, pauseChat, priceHint, resume, waitingJobs, type Sim, type SimConfig } from "../../../src/features/creator/components/autopilot.ts";
import { cleanAdvanced, cleanTargeting, flowFromTemplate } from "../../../src/features/creator/schema.ts";

const T0 = Date.UTC(2026, 10, 23, 12, 0, 0); // a Monday, noon UTC
const bump = (id: number, trigger = "Online") => ({ id, live: true, data: { message: "Hey {name}, thinking of you", price: 0, trigger, media: [], onlyLists: [], neverLists: [] } });
const base = (patch: Partial<SimConfig> = {}): SimConfig => ({ creator: "Sara", enabled: true, handleChats: true, bumpOn: true, adv: cleanAdvanced({ timezone: "UTC" }), targeting: cleanTargeting({}), bumps: [bump(1)], flows: [], products: [], lists: [], ...patch });
const cfg = base;
const fan = () => newSim({ name: "Sam", spend: 0, subscribedDays: 30, tags: [], lists: [] }, T0);
const MIN = 60_000;
const HOUR_MS = 3_600_000;
const texts = (s: Sim) => s.entries.filter((e) => e.kind === "jazz").map((e) => e.text);

test("a fan coming online gets a bump after the message delay, with {name} filled in; then it waits", () => {
  let { sim } = { sim: fire(fan(), cfg(), { t: "online" }) };
  assert.deepEqual(texts(sim), []); // not at once: the delay
  ({ sim } = advance(sim, cfg(), 2 * MIN));
  assert.deepEqual(texts(sim), ["Hey Sam, thinking of you"]);
  assert.ok(waitingJobs(sim, cfg()).some((j) => j.label.startsWith("Unsend")));
  // the same fan coming online again soon is not bumped again (messaged within 4 hours)
  const again = fire(sim, cfg(), { t: "online" });
  assert.ok(again.entries.at(-1)!.text.includes("messaged within the last 4 hours"));
});

test("bumps respect Bump fans off, the exclude rules and an unsend time", () => {
  const cfg = (p: Partial<SimConfig> = {}) => base({ adv: cleanAdvanced({ timezone: "UTC", followUp: { on: false } }), ...p }); // no nudge here, so the clock runs straight to the unsend
  assert.ok(fire(fan(), cfg({ bumpOn: false }), { t: "online" }).entries.at(-1)!.text.includes("Bump fans is off"));
  const rules = cfg({ targeting: cleanTargeting({ bump: { oldFans: { on: true, days: 10 } } }) });
  assert.ok(fire(fan(), rules, { t: "online" }).entries.at(-1)!.text.includes("old fan"));
  let { sim } = advance(fire(fan(), cfg(), { t: "online" }), cfg(), 2 * MIN);
  ({ sim } = advance(sim, cfg(), 31 * MIN)); // the default unsend time is 30 minutes
  assert.equal(sim.entries.find((e) => e.kind === "jazz")!.unsent, true);
  // a fan who replied is not unsent
  let ok = advance(fire(fan(), cfg(), { t: "online" }), cfg(), 2 * MIN).sim;
  ok = fire(ok, cfg(), { t: "message", text: "hi!" });
  ok = advance(ok, cfg(), 40 * MIN).sim;
  assert.equal(ok.entries.find((e) => e.kind === "jazz")?.unsent ?? false, false);
});

test("a fan message asks the writer after the delay; the answer is sent on autopilot, or waits as a draft", () => {
  const c = cfg();
  let sim = fire(fan(), c, { t: "message", text: "hey" });
  let r = advance(sim, c, 2 * MIN);
  assert.equal(r.ask?.kind, "reply");
  assert.deepEqual(r.ask!.turns, [{ from: "fan", text: "hey" }]);
  const sent = deliver(r.sim, c, r.ask!, { reply: "hi babe", needsHuman: false, reason: "" }, true);
  assert.deepEqual(texts(sent), ["hi babe"]);
  assert.ok(waitingJobs(sent, c).some((j) => j.label === "Follow-up nudge")); // she is waiting for an answer
  const draft = deliver(r.sim, c, r.ask!, { reply: "hi babe", needsHuman: false, reason: "" }, false);
  assert.equal(draft.entries.at(-1)!.kind, "draft");
  assert.deepEqual(texts(approve(draft, c, draft.entries.at(-1)!.id)), ["hi babe"]);
  // a handoff stops everything for this fan
  const human = deliver(r.sim, c, r.ask!, { reply: "", needsHuman: true, reason: "custom order" }, true);
  assert.equal(human.human, true);
  assert.equal(waitingJobs(human, c).length, 0);
});

test("silence brings the follow-up nudge, then the PPV for a silent fan (lowest progression first)", () => {
  const prod = (id: number, progression: number) => ({ id, live: true, data: { name: `Set ${id}`, price: 10 * id, description: "", tags: [], progression, bundle: false, media: [] } });
  const c = cfg({ bumps: [], adv: cleanAdvanced({ timezone: "UTC", silentPpv: { on: true, min: 5, max: 6, limitOn: true, exclusivity: 2 } }), products: [prod(3, 3), prod(2, 2), prod(1, 1)] });
  let r = advance(fire(fan(), c, { t: "message", text: "hey" }), c, MIN);
  r = { sim: deliver(r.sim, c, r.ask!, { reply: "hi", needsHuman: false, reason: "" }, true), ask: null };
  r = advance(r.sim, c, 7 * MIN);
  assert.equal(r.ask?.kind, "followup"); // between 3 and 6 minutes of silence
  const after = resume(deliver(r.sim, c, r.ask!, { reply: "you there?", needsHuman: false, reason: "" }, true), c);
  assert.equal(after.ask, null);
  const last = advance(after.sim, c, 10 * MIN).sim.entries.at(-1)!;
  assert.deepEqual([last.tag, last.text, last.price], ["PPV to a silent fan", "Set 1", 10]);
});

test("active hours: outside them a message is ignored, or answered when she is back", () => {
  const closed = cleanAdvanced({ timezone: "UTC", days: [{ mode: "custom", from: "18:00", to: "23:00" }, ...Array.from({ length: 6 }, () => ({ mode: "on" }))] });
  const ignored = fire(fan(), cfg({ adv: closed }), { t: "message", text: "hey" });
  assert.ok(ignored.entries.at(-1)!.text.includes("ignored"));
  const later = cleanAdvanced({ ...closed, respondWhenBack: true });
  const waits = fire(fan(), cfg({ adv: later }), { t: "message", text: "hey" });
  let r = advance(waits, cfg({ adv: later }), 5 * HOURS(1)); // still before 18:00
  assert.equal(r.ask, null);
  r = advance(r.sim, cfg({ adv: later }), 2 * HOURS(1)); // 19:00: back, so the reply is asked for
  assert.equal(r.ask?.kind, "reply");
});
function HOURS(n: number) { return n * 3_600_000; }

test("targeting hands a matching fan to a person, a tip does too, and the chat setting off writes nothing", () => {
  const c = cfg({ targeting: cleanTargeting({ chats: { highSpender: { on: true, amount: 25 } } }) });
  const rich = newSim({ name: "Sam", spend: 40, subscribedDays: 30, tags: [], lists: [] }, T0);
  const h = fire(rich, c, { t: "message", text: "hey" });
  assert.equal(h.human, true);
  assert.ok(h.entries.at(-1)!.text.includes("high spender"));
  const tipped = fire(fan(), cfg(), { t: "tip", amount: 5 });
  assert.equal(tipped.human, true);
  assert.ok(fire(fan(), cfg({ handleChats: false }), { t: "message", text: "hey" }).entries.at(-1)!.text.includes("chat is off"));
});

test("a flow runs on its own: New Subscriber, wait, a message, and a condition that follows the fan's answer", () => {
  const flow = { ...flowFromTemplate("subscriber"), status: "active" as const };
  const c = cfg({ bumps: [], handleChats: false, adv: cleanAdvanced({ timezone: "UTC", delay: { on: false }, followUp: { on: false } }), flows: [{ id: 9, live: true, data: flow }] });
  let sim = fire(fan(), c, { t: "subscribe" });
  sim = advance(sim, c, MIN).sim;
  assert.deepEqual(texts(sim), []); // the template waits 2 minutes first
  sim = advance(sim, c, 2 * MIN).sim;
  assert.equal(texts(sim).length, 1);
  assert.ok(texts(sim)[0]!.startsWith("Hey Sam! So happy you're here"));
  sim = fire(sim, c, { t: "message", text: "hi!" }); // the fan answers, so the condition is true
  sim = advance(sim, c, 15 * MIN).sim;
  const sys = sim.entries.filter((e) => e.kind === "system").map((e) => e.text).join("|");
  assert.ok(sys.includes("condition true"));
  assert.ok(texts(sim).some((t) => t.startsWith("I love chatting with you Sam")));
  assert.ok(sys.includes("completed"));
});

test("flow exit rules and the goal", () => {
  const flow = { ...flowFromTemplate("subscriber"), status: "active" as const, exit: { superFan: false, spentOn: true, spent: 10 }, goal: { on: true, amount: 20 } };
  const c = cfg({ bumps: [], adv: cleanAdvanced({ timezone: "UTC", delay: { on: false }, followUp: { on: false } }), flows: [{ id: 9, live: true, data: flow }] });
  let sim = fire(fan(), c, { t: "subscribe" });
  sim = fire(sim, c, { t: "tip", amount: 30 }); // goal: more than $20 in the flow; exit rule: more than $10 in total
  assert.ok(sim.entries.some((e) => e.text.includes("Goal reached")));
  sim = advance(sim, c, 5 * MIN).sim;
  assert.ok(sim.entries.some((e) => e.text.includes("exit rule")));
  assert.deepEqual(texts(sim), []);
});

test("a fan who sends many messages in a row gets ONE reply (after the last one), not one each", () => {
  const c = cfg();
  let sim = fan();
  for (const t of ["hi", "are you there", "hello??"]) { sim = fire(sim, c, { t: "message", text: t }); sim = advance(sim, c, 5_000).sim; }
  assert.equal(sim.jobs.filter((j) => j.kind === "reply").length, 1);
  const r = advance(sim, c, 2 * MIN);
  assert.equal(r.ask?.kind, "reply");
  assert.deepEqual(r.ask!.turns.map((t) => t.text), ["hi", "are you there", "hello??"]); // the writer sees all of them at once
});

test("a flood is muted without calling the writer, and replies come back when the fan calms down", () => {
  const c = cfg();
  let sim = fan();
  for (let i = 0; i < 6; i++) sim = fire(sim, c, { t: "message", text: `msg ${i}` });
  assert.equal(sim.muted, true);
  assert.ok(sim.entries.some((e) => e.text.startsWith("Spam:")));
  let r = advance(sim, c, 5 * MIN);
  assert.equal(r.ask, null); // still muted, the writer is not called
  assert.equal(r.sim.jobs.some((j) => j.kind === "reply"), false);
  r = advance(r.sim, c, 11 * MIN);
  assert.equal(r.sim.muted, false);
  assert.equal(r.ask?.kind, "reply"); // one answer for what the fan wrote
  // the same words again and again is spam too, even if slowly
  let same = fan();
  for (let i = 0; i < 3; i++) { same = fire(same, c, { t: "message", text: "Hi!" }); same = advance(same, c, 20 * MIN).sim; }
  assert.equal(same.muted, false);
  assert.equal(fire(same, c, { t: "message", text: "hi!" }).muted, true); // the 4th time
});

test("the platform tags the fan by itself: New Subscriber for 7 days, Hot Buyer for 48 hours, Expired, Renew Off", () => {
  const c = cfg();
  let sim = newSim({ name: "Sam", spend: 0, subscribedDays: 2, tags: [], lists: [] }, T0);
  assert.ok(fanTags(sim).includes("New Subscriber"));
  sim = advance(sim, c, 6 * 24 * 3_600_000).sim; // 8 days old now
  assert.ok(!fanTags(sim).includes("New Subscriber"));
  sim = fire(sim, cfg({ handleChats: false }), { t: "buy", amount: 20 });
  assert.ok(fanTags(sim).includes("Hot Buyer") && fanTags(sim).includes("Buyer"));
  sim = advance(sim, c, 49 * 3_600_000).sim;
  assert.ok(!fanTags(sim).includes("Hot Buyer")); // 48 hours later it is gone
  sim = fire(sim, c, { t: "renewoff" });
  assert.ok(fanTags(sim).includes("Renew Off"));
  sim = fire(sim, c, { t: "expire" });
  assert.deepEqual([fanTags(sim).includes("Expired"), fanTags(sim).includes("Renew Off")], [true, false]);
  assert.ok(sim.entries.some((e) => e.text.includes("Follow-back bot")));
});

test("a tag the platform puts on a fan can start a flow, and a custom request goes straight to a person", () => {
  const flow = { ...flowFromTemplate("subscriber"), status: "active" as const };
  flow.nodes = flow.nodes.map((n) => (n.kind === "start" ? { ...n, config: { ...n.config, trigger: "Fan Tagged As...", tag: "Hot Buyer" } } : n));
  const c = cfg({ bumps: [], handleChats: false, adv: cleanAdvanced({ timezone: "UTC", delay: { on: false }, followUp: { on: false } }), flows: [{ id: 9, live: true, data: flow }] });
  const sim = fire(fan(), c, { t: "buy", amount: 10 });
  assert.ok(sim.entries.some((e) => e.text.includes('Flow "New Subscriber Funnel" started')));
  const custom = fire(fan(), cfg(), { t: "message", text: "can you make me a custom video with my name?" });
  assert.equal(custom.human, true);
  assert.equal(custom.jobs.some((j) => j.kind === "reply"), false); // the model is not asked
  assert.ok(custom.escalations[0]!.reason.includes("custom request"));
  assert.ok(fanTags(custom).includes("Urgent Priority"));
});

test("a person can pause Jazz, answer, and give the chat back; Jazz then answers what was left unread", () => {
  const c = cfg();
  let sim = pauseChat(fan(), c);
  assert.equal(sim.human, true);
  sim = fire(sim, c, { t: "message", text: "anyone there?" });
  assert.equal(sim.jobs.some((j) => j.kind === "reply"), false); // Jazz stays out while a person has the chat
  assert.deepEqual(texts(chatterReply(sim, c, "hi, it's the team")), ["hi, it's the team"]);
  assert.deepEqual(chatterReply(fan(), c, "x").entries, []); // only possible while Jazz is off the chat
  sim = giveBack(sim, c);
  assert.equal(sim.human, false);
  assert.equal(advance(sim, c, 2 * MIN).ask?.kind, "reply"); // the unread message gets an answer
});

test("the same bump, product or flow message is never sent to a fan twice", () => {
  const c = cfg({ bumps: [bump(1)], adv: cleanAdvanced({ timezone: "UTC", followUp: { on: false } }) });
  let sim = advance(fire(fan(), c, { t: "online" }), c, 2 * MIN).sim;
  assert.equal(texts(sim).length, 1);
  sim = fire(advance(sim, c, 5 * 3_600_000).sim, c, { t: "online" }); // well past the "don't bump recently" window
  assert.ok(sim.entries.at(-1)!.text.includes("already sent"));
  assert.equal(texts(advance(sim, c, 5 * MIN).sim).length, 1);
});

test("a price stays inside what this fan usually pays, and results are credited to the flow", () => {
  const flow = { ...flowFromTemplate("subscriber"), status: "active" as const };
  flow.nodes = flow.nodes.map((n) => (n.kind === "message" ? { ...n, config: { ...n.config, price: 100, aiPricing: true, skipIfBought: false } } : n));
  const c = cfg({ bumps: [], handleChats: false, adv: cleanAdvanced({ timezone: "UTC", delay: { on: false }, followUp: { on: false } }), flows: [{ id: 9, live: true, data: flow }] });
  let sim = fire(newSim({ name: "Sam", spend: 0, subscribedDays: 30, tags: [], lists: [] }, T0), c, { t: "tip", amount: 10 });
  assert.deepEqual(priceHint(sim), { count: 1, max: 10, avg: 10 });
  sim = fire(sim, c, { t: "subscribe" });
  sim = advance(sim, c, 5 * MIN).sim;
  const sent = sim.entries.find((e) => e.kind === "jazz")!;
  assert.equal(sent.price, 15); // a $100 offer for a fan who pays about $10 becomes $15 (one and a half times his average)
  assert.ok(sent.note!.includes("$100 became $15"));
  sim = fire(sim, c, { t: "buy", amount: 15 });
  assert.equal(flowResults(sim)[0]!.sales, 15);
});

test("a follow-up to a silent fan is an unused bump message; the writer is told about the bump when the fan answers it", () => {
  const withBump = { id: 7, live: true, data: { message: "thinking of you, want a peek?", price: 15, trigger: "Online", media: [{ id: "1", type: "photo" }], onlyLists: [], neverLists: [] } } as never;
  const c = cfg({ bumpOn: true, bumps: [withBump], adv: cleanAdvanced({ timezone: "UTC", silentPpv: { on: false } }) });
  let r = advance(fire(fan(), c, { t: "message", text: "hey" }), c, MIN);
  r = { sim: deliver(r.sim, c, r.ask!, { reply: "hi you", needsHuman: false, reason: "" }, true), ask: null };
  r.sim.online = true; // only an online fan gets an Online bump as the nudge
  r = advance(r.sim, c, 7 * MIN);
  const sent = r.sim.entries.filter((e) => e.kind === "jazz").at(-1)!;
  assert.deepEqual([sent.tag, sent.text, sent.price], ["Bump · Follow-up", "thinking of you, want a peek?", 15]);
  assert.equal(r.ask, null); // no writer call: the bump is the nudge
  const answered = advance(fire(r.sim, c, { t: "message", text: "yes how much?" }), c, MIN);
  assert.ok(answered.ask!.turns.some((t) => t.from === "creator" && t.text.includes("(a bump message, locked PPV $15 with 1 media)")));
});

test("a reply that names a live product carries its price and media; one that names none does not", () => {
  const prod = { id: 1, live: true, data: { name: "Beach set", price: 12, description: "", tags: [], progression: 1, bundle: false, media: [{ id: "1", type: "photo" }, { id: "2", type: "video" }] } } as never;
  const c = cfg({ products: [prod] });
  const ask = { kind: "reply" as const, turns: [{ from: "fan" as const, text: "what do you have?" }] };
  const withOffer = deliver(fan(), c, ask, { reply: "I have the Beach set babe 😘", needsHuman: false, reason: "" }, true).entries.at(-1)!;
  assert.deepEqual([withOffer.price, withOffer.media], [12, 2]);
  const plain = deliver(fan(), c, ask, { reply: "mm tell me more", needsHuman: false, reason: "" }, true).entries.at(-1)!;
  assert.equal(plain.price, undefined);
});

test("a mass message arrives with its price, and the writer is told it was a mass message when the fan answers", () => {
  const c = cfg();
  let sim = fire(fan(), c, { t: "mass", text: "new set just dropped {name}", price: 20, media: 3 });
  const m = sim.entries.at(-1)!;
  assert.deepEqual([m.tag, m.text, m.price, m.media], ["Mass Message", "new set just dropped Sam", 20, 3]);
  sim = fire(sim, c, { t: "message", text: "ooh how much?" });
  const r = advance(sim, c, MIN);
  assert.ok(r.ask!.turns.some((t) => t.from === "creator" && t.text.includes("(a mass message, locked PPV $20 with 3 media)")));
});

test("test picks switch products, bumps and flows on or off for the test only; a draft flow can be switched on", () => {
  const draftFlow = { ...flowFromTemplate(""), status: "draft" as const };
  const c = cfg({ products: [{ id: 1, live: true, data: { name: "A", price: 5, description: "", tags: [], progression: 1, bundle: false, media: [] } } as never], flows: [{ id: 9, live: false, data: draftFlow } as never] });
  const picked = withPicks(c, { "p:1": false, "f:9": true, "b:1": false });
  assert.equal(picked.products[0]!.live, false);
  assert.equal(picked.flows[0]!.live, true);
  assert.equal(picked.flows[0]!.data.status, "active");
  assert.equal(picked.bumps.every((b) => !b.live || b.id !== 1), true);
  assert.equal(c.products[0]!.live, true); // the account's own setup is untouched
  assert.equal(withPicks(c, {}).flows[0]!.live, false); // no pick: as saved
});

const script = (id: number, data: Record<string, unknown>) => ({ id, live: true, data: { name: `S${id}`, trigger: "t", expiresHours: 6, exitOn: true, exitLimit: 2, ...data } }) as never;
const said = (sim: Sim) => sim.entries.filter((e) => e.kind === "jazz").map((e) => e.text);

test("a subscribe script sends its first step, waits for the fan's answer, then the next (no writer call), then completes", () => {
  const c = cfg({ bumps: [], scripts: [script(1, { startsOn: "subscribe", steps: ["welcome {name}", "what made you subscribe?"] })] });
  let r = advance(fire(fan(), c, { t: "subscribe" }), c, MIN);
  assert.deepEqual(said(r.sim), ["welcome Sam"]);
  r = advance(fire(r.sim, c, { t: "message", text: "hi! your pics" }), c, MIN);
  assert.equal(r.ask, null); // the script answered, not the writer
  assert.deepEqual(said(r.sim), ["welcome Sam", "what made you subscribe?"]);
  assert.ok(r.sim.entries.some((e) => e.text.includes('Script "S1" completed')));
  r = advance(fire(r.sim, c, { t: "message", text: "you're hot" }), c, MIN);
  assert.equal(r.ask?.kind, "reply"); // after the script, the writer answers again
});

test("a keyword script starts on a matching message; a step can wait minutes and carry a product; unbought PPVs end it", () => {
  const prod = { id: 5, live: true, data: { name: "Small set", price: 7, description: "", tags: [], progression: 1, bundle: false, media: [{ id: "1", type: "photo" }] } } as never;
  const c = cfg({ bumps: [], products: [prod], scripts: [script(2, { startsOn: "keywords", keywords: ["too expensive"], exitLimit: 1, steps: ["no pressure babe", "here's a smaller one"], stepOptions: [{}, { afterReply: false, waitMinutes: 5, productId: 5 }] })] });
  let r = advance(fire(fan(), c, { t: "message", text: "that's TOO expensive" }), c, MIN);
  assert.equal(r.ask, null);
  assert.deepEqual(said(r.sim), ["no pressure babe"]);
  r = advance(r.sim, c, 6 * MIN);
  const last = r.sim.entries.filter((e) => e.kind === "jazz").at(-1)!;
  assert.deepEqual([last.text, last.price, last.media], ["here's a smaller one", 7, 1]);
  assert.ok(r.sim.entries.some((e) => e.text.includes("PPVs sent in the script are not bought")));
});

test("a tip script never runs while a person has the chat: its first step waits as a draft for them", () => {
  const c = cfg({ bumps: [], scripts: [script(3, { startsOn: "tip", steps: ["thank you so much babe"] })] });
  const sim = fire(fan(), c, { t: "tip", amount: 20 });
  assert.equal(sim.human, true);
  assert.deepEqual(said(sim), []);
  assert.ok(sim.entries.some((e) => e.kind === "draft" && e.text === "thank you so much babe"));
});

test("an unanswered script expires after its expiration time, and only one script runs at a time", () => {
  const c = cfg({ bumps: [], scripts: [script(4, { startsOn: "online", expiresHours: 1, steps: ["hey you", "still there?"] }), script(5, { startsOn: "keywords", keywords: ["hey"], steps: ["other"] })] });
  let r = advance(fire(fan(), c, { t: "online" }), c, MIN);
  assert.deepEqual(said(r.sim), ["hey you"]);
  r = advance(r.sim, c, 2 * HOUR_MS);
  assert.ok(r.sim.entries.some((e) => e.text.includes("expired: no answer for 1 h")));
});

test("review fixes: a bot or fact question during a script goes to a person and ends the script", () => {
  const c = cfg({ bumps: [], scripts: [script(10, { startsOn: "subscribe", steps: ["welcome", "a PPV pitch"] })] });
  let r = advance(fire(fan(), c, { t: "subscribe" }), c, MIN);
  r = advance(fire(r.sim, c, { t: "message", text: "are you a bot?" }), c, MIN);
  assert.equal(r.sim.human, true);
  assert.deepEqual(said(r.sim), ["welcome"]); // the pitch never went out
  assert.ok(r.sim.entries.some((e) => e.text.includes('Script "S10" stopped: a person has the chat')));
  const f = advance(fire(advance(fire(fan(), c, { t: "subscribe" }), c, MIN).sim, c, { t: "message", text: "will it get taken down again?" }), c, MIN);
  assert.equal(f.sim.human, true);
});

test("review fixes: a targeted-out fan gets no event script; a script waits for active hours", () => {
  const out = cfg({ bumps: [], targeting: cleanTargeting({ chats: { highSpender: { on: true, amount: 10 } } }), scripts: [script(11, { startsOn: "online", steps: ["hey"] })] });
  const rich = newSim({ name: "Sam", spend: 500, subscribedDays: 30, tags: [], lists: [] }, T0);
  const r = advance(fire(rich, out, { t: "online" }), out, MIN);
  assert.deepEqual(said(r.sim), []);
  assert.ok(r.sim.entries.some((e) => e.text.includes('Script "S11" not started')));
  const closed = cleanAdvanced({ timezone: "UTC", days: Array.from({ length: 7 }, () => ({ mode: "custom", from: "18:00", to: "23:00" })) });
  const c = cfg({ bumps: [], adv: closed, scripts: [script(12, { startsOn: "subscribe", steps: ["evening hello"] })] });
  const noon = advance(fire(fan(), c, { t: "subscribe" }), c, MIN);
  assert.deepEqual(said(noon.sim), []); // T0 is noon: closed
  const evening = advance(noon.sim, c, 7 * HOUR_MS);
  assert.deepEqual(said(evening.sim), ["evening hello"]);
});

test("review fixes: a second fan message while a step is on its way does not add a writer reply; no silent PPV during a script", () => {
  const c = cfg({ bumps: [], adv: cleanAdvanced({ timezone: "UTC", delay: { on: true, min: 30, max: 30 }, silentPpv: { on: true, min: 1, max: 2, limitOn: false, exclusivity: 4 } }), products: [{ id: 1, live: true, data: { name: "P", price: 5, description: "", tags: [], progression: 1, bundle: false, media: [] } } as never], scripts: [script(13, { startsOn: "subscribe", expiresHours: 2, steps: ["one", "two", "three"] })] });
  let r = advance(fire(fan(), c, { t: "subscribe" }), c, MIN);
  let sim = fire(r.sim, c, { t: "message", text: "hi" });
  sim = fire(sim, c, { t: "message", text: "hello??" }); // while step two is still on its way
  r = advance(sim, c, MIN);
  assert.equal(r.ask, null);
  assert.deepEqual(said(r.sim), ["one", "two"]);
  r = advance(r.sim, c, 30 * MIN); // waiting for the answer to step two: no silent-fan PPV on top of the script
  assert.ok(!r.sim.entries.some((e) => e.tag === "PPV to a silent fan"));
});

test("review fixes: a tip ends the running script; it does not come back when the chat is given back", () => {
  const c = cfg({ bumps: [], scripts: [script(14, { startsOn: "subscribe", steps: ["one", "two"] })] });
  let sim = advance(fire(fan(), c, { t: "subscribe" }), c, MIN).sim;
  sim = fire(sim, c, { t: "tip", amount: 5 });
  assert.ok(sim.entries.some((e) => e.text.includes('Script "S14" stopped')));
  sim = giveBack(sim, c);
  const r = advance(fire(sim, c, { t: "message", text: "hey again" }), c, MIN);
  assert.equal(r.ask?.kind, "reply"); // the writer, not step two
});

test("a 'Jazz writes it' step asks the writer with the step as an instruction, keeps the offer, and never goes silent", () => {
  const prod = { id: 8, live: true, data: { name: "Tiny set", price: 6, description: "", tags: [], progression: 1, bundle: false, media: [{ id: "1", type: "photo" }] } } as never;
  const c = cfg({ bumps: [], products: [prod], scripts: [script(20, { startsOn: "subscribe", steps: ["welcome {name}", "offer the Tiny set for $6"], stepOptions: [{}, { mode: "rewrite", productId: 8 }] })] });
  let r = advance(fire(fan(), c, { t: "subscribe" }), c, MIN);
  r = advance(fire(r.sim, c, { t: "message", text: "i found your posts" }), c, MIN);
  assert.equal(r.ask?.kind, "step");
  assert.ok(r.ask?.instruction?.startsWith("offer the Tiny set for $6")); // the offer and its exact price follow in the instruction
  assert.ok(r.ask!.turns.some((t) => t.from === "fan" && t.text === "i found your posts"));
  const sent = deliver(r.sim, c, r.ask!, { reply: "aww nice, glad you found me 😘 I have the Tiny set for $6 if you want a peek", needsHuman: false, reason: "" }, true);
  const last = sent.entries.filter((e) => e.kind === "jazz").at(-1)!;
  assert.deepEqual([last.tag?.startsWith("Script:"), last.price, last.media], [true, 6, 1]);
  assert.ok(sent.entries.some((e) => e.text.includes('Script "S20" completed')));
  // the writer wrote nothing: a plain offer line goes out (the step text is an instruction)
  const empty = deliver(r.sim, c, r.ask!, { reply: "", needsHuman: false, reason: "" }, true);
  assert.ok(empty.entries.filter((e) => e.kind === "jazz").at(-1)!.text.includes("Tiny set for $6")); // a plain offer line, not the instruction
  // the writer hands the chat to a person (for example a bot question it caught): the script stops
  const human = deliver(r.sim, c, r.ask!, { reply: "", needsHuman: true, reason: "asks if this is a bot" }, true);
  assert.equal(human.human, true);
  assert.ok(human.entries.some((e) => e.text.includes('Script "S20" stopped: a person has the chat')));
});

test("a fan asking for content starts the content script, with the product that fits his words (else the next rung of her ladder); a custom request does not", () => {
  const prod = (id: number, name: string, tags: string[], progression: number, price: number) => ({ id, live: true, data: { name, price, description: "", tags, progression, bundle: false, media: [{ id: String(id), type: "photo" }] } }) as never;
  const c = cfg({ bumps: [], products: [prod(1, "Beach set", ["beach", "bikini"], 1, 8), prod(2, "Gym set", ["gym", "workout"], 2, 14)], scripts: [script(30, { startsOn: "content", steps: ["let me show you something", "tell me what you think"], stepOptions: [{ productId: 0 }, {}] })] });
  const gym = advance(fire(fan(), c, { t: "message", text: "do you have any gym videos?" }), c, MIN);
  assert.equal(gym.ask, null);
  const sent = gym.sim.entries.filter((e) => e.kind === "jazz").at(-1)!;
  assert.deepEqual([sent.text, sent.price, sent.note], ["let me show you something", 14, "Offer: Gym set"]);
  // his words match nothing: the first rung of her ladder
  const vague = advance(fire(fan(), c, { t: "message", text: "send me a pic" }), c, MIN);
  assert.equal(vague.sim.entries.filter((e) => e.kind === "jazz").at(-1)!.price, 8);
  // a custom video request is not "asking for content": a person answers it
  const custom = fire(fan(), c, { t: "message", text: "can you make me a custom video?" });
  assert.equal(custom.human, true);
  assert.deepEqual(said(custom), []);
  // a greeting does not start it
  assert.equal(advance(fire(fan(), c, { t: "message", text: "hey how are you" }), c, MIN).ask?.kind, "reply");
});

test("a 'Jazz writes it' step with an offer names the product; a reply that forgot it becomes a plain offer line (never the instruction)", () => {
  const prod = { id: 1, live: true, data: { name: "Gym set", price: 14, description: "", tags: ["gym"], progression: 1, bundle: false, media: [] } } as never;
  const c = cfg({ bumps: [], products: [prod], scripts: [script(31, { startsOn: "content", steps: ["offer something"], stepOptions: [{ mode: "rewrite", productId: 0 }] })] });
  const r = advance(fire(fan(), c, { t: "message", text: "any gym content?" }), c, MIN);
  assert.equal(r.ask?.kind, "step");
  assert.ok(r.ask!.instruction!.includes('"Gym set" for $14'));
  const good = deliver(r.sim, c, r.ask!, { reply: "ooh I do babe, my Gym set is $14 😘", needsHuman: false, reason: "" }, true).entries.filter((e) => e.kind === "jazz").at(-1)!;
  assert.deepEqual([good.text, good.price], ["ooh I do babe, my Gym set is $14 😘", 14]);
  const forgot = deliver(r.sim, c, r.ask!, { reply: "Hi there! what pictures do you like?", needsHuman: false, reason: "" }, true).entries.filter((e) => e.kind === "jazz").at(-1)!;
  assert.deepEqual([forgot.text.includes("Gym set for $14"), forgot.text.includes("offer something"), forgot.price], [true, false, 14]); // the instruction never reaches the fan
});

test("a 'Jazz writes it' step with no offer and no writer answer stops the script and lets the writer reply", () => {
  const c = cfg({ bumps: [], scripts: [script(32, { startsOn: "subscribe", steps: ["welcome", "ask about her day"], stepOptions: [{}, { mode: "rewrite" }] })] });
  let r = advance(fire(fan(), c, { t: "subscribe" }), c, MIN);
  r = advance(fire(r.sim, c, { t: "message", text: "hi" }), c, MIN);
  assert.equal(r.ask?.kind, "step");
  const sim = deliver(r.sim, c, r.ask!, { reply: "", needsHuman: false, reason: "" }, true);
  assert.deepEqual(said(sim), ["welcome"]); // "ask about her day" was an instruction and was not sent
  assert.ok(sim.entries.some((e) => e.text.includes("stopped: the writer did not answer the step")));
  assert.equal(advance(sim, c, MIN).ask?.kind, "reply");
});

test("a PPV carries its media locked; the fan unlocking it (or any purchase) opens the newest locked PPV and a person takes over", () => {
  const prod = { id: 3, live: true, data: { name: "Stories set", price: 10, description: "", tags: [], progression: 1, bundle: false, media: [{ id: "a", type: "photo" }, { id: "b", type: "video" }] } } as never;
  const c = cfg({ bumps: [], products: [prod], scripts: [script(40, { startsOn: "subscribe", steps: ["a little treat"], stepOptions: [{ productId: 3 }] })] });
  const sim = advance(fire(fan(), c, { t: "subscribe" }), c, MIN).sim;
  const ppv = sim.entries.filter((e) => e.kind === "jazz").at(-1)!;
  assert.deepEqual([ppv.price, ppv.items?.map((m) => m.id), ppv.unlocked], [10, ["a", "b"], undefined]);
  const paid = fire(sim, c, { t: "unlock", entry: ppv.id });
  assert.equal(paid.entries.find((e) => e.id === ppv.id)!.unlocked, true);
  assert.equal(paid.fan.spend, 10);
  assert.equal(paid.human, true); // money moved: a person has the chat
  assert.equal(fire(paid, c, { t: "unlock", entry: ppv.id }).fan.spend, 10); // unlocking twice pays once
  // the plain "Buys a PPV" button opens the newest locked one too
  assert.equal(fire(sim, c, { t: "buy", amount: 10 }).entries.find((e) => e.id === ppv.id)!.unlocked, true);
});

test("afterPayment 'jazz': a tip does not hand over; the tip bump goes out; with none, Jazz thanks him and offers something he has not seen; every tip a different product", () => {
  const prod = (id: number, name: string, price: number, progression: number) => ({ id, live: true, data: { name, price, description: "", tags: [], progression, bundle: false, media: [{ id: String(id), type: "photo" }] } }) as never;
  const adv = cleanAdvanced({ timezone: "UTC", afterPayment: "jazz" });
  const products = [prod(1, "Set A", 5, 1), prod(2, "Set B", 9, 2), prod(3, "Set C", 14, 3)];
  // with a Tipped bump: it goes out and nothing is handed over
  const tipBump = { id: 9, live: true, data: { message: "you're the best {name} 💕", price: 0, trigger: "Tipped", media: [], onlyLists: [], neverLists: [] } } as never;
  const c1 = cfg({ adv, products, bumps: [tipBump] });
  const r1 = advance(fire(fan(), c1, { t: "tip", amount: 10 }), c1, MIN);
  assert.equal(r1.sim.human, false);
  assert.ok(said(r1.sim).includes("you're the best Sam 💕"));
  // without any: the writer is asked to thank him and offer a product he has not been offered
  const c2 = cfg({ adv, products, bumps: [] });
  let r = advance(fire(fan(), c2, { t: "tip", amount: 10 }), c2, MIN);
  assert.equal(r.sim.human, false);
  assert.equal(r.ask?.kind, "reply");
  assert.ok(r.ask!.instruction!.includes('"Set A" for $5'));
  r = { sim: deliver(r.sim, c2, r.ask!, { reply: "thank you babe 😘 my Set A is $5 if you want it", needsHuman: false, reason: "" }, true), ask: null };
  assert.equal(r.sim.entries.filter((e) => e.kind === "jazz").at(-1)!.price, 5);
  // the next tip: a different one, and the instruction says what he already saw
  const again = advance(fire(r.sim, c2, { t: "tip", amount: 20 }), c2, MIN);
  assert.ok(again.ask!.instruction!.includes('"Set B" for $9'));
  assert.ok(again.ask!.instruction!.includes("do not offer again: Set A"));
  // the default stays: a person takes over after money moves
  const stays = fire(fan(), cfg({ products }), { t: "tip", amount: 10 });
  assert.equal(stays.human, true);
});

test("a script product that was already offered to this fan is swapped for one he has not seen", () => {
  const prod = (id: number, name: string, progression: number) => ({ id, live: true, data: { name, price: 5 * id, description: "", tags: [], progression, bundle: false, media: [] } }) as never;
  const c = cfg({ bumps: [], products: [prod(1, "One", 1), prod(2, "Two", 2)], scripts: [script(50, { startsOn: "online", steps: ["offer"], stepOptions: [{ productId: 1 }] }), script(51, { startsOn: "like", steps: ["offer again"], stepOptions: [{ productId: 1 }] })] });
  let sim = advance(fire(fan(), c, { t: "online" }), c, MIN).sim;
  assert.equal(sim.entries.filter((e) => e.kind === "jazz").at(-1)!.note, "Offer: One");
  sim = advance(sim, c, 5 * HOUR_MS).sim; // past the "do not bump a fan messaged recently" window
  sim = advance(fire(sim, c, { t: "like" }), c, MIN).sim;
  assert.equal(sim.entries.filter((e) => e.kind === "jazz").at(-1)!.note, "Offer: Two");
});

test("a fan message during a long timed wait of a script is answered (writer or a keyword script), not swallowed", () => {
  const c = cfg({ bumps: [], scripts: [script(60, { startsOn: "online", steps: ["hey stranger", "second, ten minutes later"], stepOptions: [{}, { afterReply: false, waitMinutes: 10 }] }), script(61, { startsOn: "keywords", keywords: ["discount"], steps: ["no pressure babe"] })] });
  let sim = advance(fire(fan(), c, { t: "online" }), c, MIN).sim;
  assert.deepEqual(said(sim), ["hey stranger"]);
  // a plain question: the writer answers it
  const q = advance(fire(sim, c, { t: "message", text: "what are you up to?" }), c, MIN);
  assert.equal(q.ask?.kind, "reply");
  // "discount": the keyword script takes over from the waiting script
  const d = advance(fire(sim, c, { t: "message", text: "can i get a discount?" }), c, MIN);
  assert.deepEqual(said(d.sim), ["hey stranger", "no pressure babe"]);
  assert.ok(d.sim.entries.some((e) => e.text.includes('Script "S60" interrupted by "S61"')));
  // the waiting script's second step never goes out afterwards
  assert.ok(!said(advance(d.sim, c, 20 * MIN).sim).includes("second, ten minutes later"));
});

test("a writer that times out is not a hand-off: the chat stays with Jazz and says so", () => {
  const c = cfg({ bumps: [] });
  const r = advance(fire(fan(), c, { t: "message", text: "hey" }), c, MIN);
  assert.equal(r.ask?.kind, "reply");
  const sim = writerFailed(r.sim, "The operation was aborted due to timeout");
  assert.equal(sim.human, false);
  assert.equal(sim.waiting, false);
  assert.ok(sim.entries.some((e) => e.text.includes("The writer did not answer")));
  assert.equal(sim.escalations.length, 0);
});
