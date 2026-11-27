import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFakeOfmapi } from "../../support/fakeofmapi.ts";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

const pg = await startTestDb();
const fake = await startFakeOfmapi([1, 2, 3]);
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
process.env.OFMAPI_BASE_URL = fake.base;
const { db } = await import("../../../src/lib/db.ts");
const { encrypt } = await import("../../../src/lib/crypto.ts");
const users = await import("../../../src/features/auth/queries.ts");
const accounts = await import("../../../src/features/accounts/queries.ts");
const inbox = await import("../../../src/features/inbox/queries.ts");
const creator = await import("../../../src/features/creator/service.ts");
const { buildWriterContext, closestAnswer, fanTurnsSince, polishReply } = await import("../../../src/features/creator/schema.ts");

after(async () => {
  await fake.stop();
  await closeAppPool();
  await pg.stop();
});

const user = await users.insertUser("rules@example.com", "x");
await accounts.insertConnection(user.id, { keyEnc: encrypt("ofmapi_test_key_000000000000"), last4: "0000", teamName: null, teamSlug: null, credits: null, webhookToken: "t".repeat(24), webhookSecretEnc: encrypt("s") });
const ACCT = "acct_rules";
await accounts.insertAccount(ACCT, user.id, "rules", "Rules", "{}");
const rules = (chats: Record<string, unknown>) => creator.updateTargeting(ACCT, { chats });
const fan = (id: number) => inbox.upsertFan(ACCT, String(id), { username: `fan${id}`, name: `Fan ${id}` });
const say = (id: number, source: string, at: number) => inbox.addMessage(ACCT, String(id), source === "fan" ? "in" : "out", source, `m${at}`, { createdAt: at });

test("with no rules on, nobody is excluded and the provider is not asked", async () => {
  await fan(1);
  assert.equal(await creator.targetingVerdict(user.id, ACCT, "1"), null);
});

test("high spenders are handed over, using what the provider says they spent", async () => {
  await fan(2);
  fake.setSpend(2, 40);
  await rules({ highSpender: { on: true, amount: 25 } });
  assert.match((await creator.targetingVerdict(user.id, ACCT, "2"))!, /high spender \(\$40 spent, limit \$25\)/);
  await fan(3);
  fake.setSpend(3, 5);
  assert.equal(await creator.targetingVerdict(user.id, ACCT, "3"), null);
});

test("new and old fans are told apart by the real subscribe date", async () => {
  await fan(4);
  fake.setSubscribed(4, new Date(Date.now() - 2 * 86400000).toISOString());
  await rules({ newFans: { on: true, days: 5 } });
  assert.match((await creator.targetingVerdict(user.id, ACCT, "4"))!, /new fan \(subscribed 2 days ago, limit 5\)/);
  await fan(5);
  fake.setSubscribed(5, new Date(Date.now() - 200 * 86400000).toISOString());
  assert.equal(await creator.targetingVerdict(user.id, ACCT, "5"), null); // old, but only the new-fan rule is on
  await rules({ oldFans: { on: true, days: 180 } });
  assert.match((await creator.targetingVerdict(user.id, ACCT, "5"))!, /old fan/);
});

test("time wasters: messages since the last purchase, several in a row count once, the limit depends on what they spent", async () => {
  await fan(6);
  const now = Date.now();
  for (let i = 0; i < 6; i++) { await say(6, "fan", now - 60_000 + i * 1000); await say(6, "fan", now - 60_000 + i * 1000 + 500); await say(6, "assistant", now - 60_000 + i * 1000 + 800); }
  await rules({ timeWasters: { on: true, noSpend: 5, underAmount: 100, underAfter: 25, overAmount: 100, overAfter: 25 } });
  assert.match((await creator.targetingVerdict(user.id, ACCT, "6"))!, /time waster \(6 messages since the last purchase, limit 5\)/);
  await rules({ timeWasters: { on: true, noSpend: 7, underAmount: 100, underAfter: 25, overAmount: 100, overAfter: 25 } });
  assert.equal(await creator.targetingVerdict(user.id, ACCT, "6"), null);
  assert.equal(fanTurnsSince([{ source: "fan", created_at: 1 }, { source: "fan", created_at: 2 }, { source: "human", created_at: 3 }, { source: "fan", created_at: 4 }], null), 2);
  assert.equal(fanTurnsSince([{ source: "fan", created_at: 1 }, { source: "fan", created_at: 9 }], 5), 1); // only after the purchase
});

test("a list copied from OnlyFans fills in steps, and the fan lists decide who is excluded or the only ones handled", async () => {
  await rules({});
  await creator.importOfList(user.id, ACCT, "Old fans", "77");
  const [list] = await creator.itemsOf(ACCT, "fanlist");
  assert.equal(list!.data.done, false);
  for (let i = 0; i < 6 && !(await creator.itemsOf(ACCT, "fanlist"))[0]!.data.done; i++) await creator.runListSyncs();
  const done = (await creator.itemsOf(ACCT, "fanlist"))[0]!;
  assert.deepEqual([done.data.done, done.data.count], [true, 25]);
  assert.equal(fake.stats.memberCalls, 1); // 25 members came in one call of 5 pages
  await fan(3000);
  await fan(3999);
  await rules({ excludeLists: [list!.id] });
  assert.match((await creator.targetingVerdict(user.id, ACCT, "3000"))!, /excluded fan list/);
  assert.equal(await creator.targetingVerdict(user.id, ACCT, "3999"), null);
  await rules({ onlyOnLists: true, onlyLists: [list!.id] });
  assert.equal(await creator.targetingVerdict(user.id, ACCT, "3000"), null);
  assert.match((await creator.targetingVerdict(user.id, ACCT, "3999"))!, /not on the fan lists/);
  await assert.rejects(creator.importOfList(user.id, ACCT, "x", "999"), /not found/);
});

test("a failing copy step does not lose the list: it is tried again later", async () => {
  await rules({});
  await creator.importOfList(user.id, ACCT, "Second", "77");
  const [, second] = await creator.itemsOf(ACCT, "fanlist");
  await db.run("UPDATE creator_items SET data = jsonb_set(data, '{ofId}', '\"nope\"') WHERE id = ?", [second!.id]); // the provider will answer this list with an error
  await creator.runListSyncs();
  const after = (await creator.itemsOf(ACCT, "fanlist"))[1]!;
  assert.equal(after.data.done, false); // still to do
  assert.ok(Number((await db.one<{ l: string }>("SELECT data->>'leaseUntil' AS l FROM creator_items WHERE id = ?", [second!.id]))!.l) > Date.now()); // not retried at once
});

test("the writer is told the creator's voice, limits, services, live updates, products and her own answers", () => {
  const text = buildWriterContext({
    bio: { persona: "Girl Next Door", explicitness: "Natural", slang: "chill", emojis: "😅😜😘😈😉❤️", fan_nicknames: ["babe"], avoid_words: ["bot"], red_lines: ["meeting in person"], services: ["Selling a VIP package"], pets: "a dog named Moose" },
    train: { "rapport/day-off": "Ooh enjoy it babe!" },
    customSamples: [],
    updates: ["Travelling this weekend"],
    products: [{ name: "Beach set", price: 35, description: "20 photos", tags: ["Beach"], progression: 1 }],
  });
  for (const part of ["Persona: Girl Next Door", "Explicitness level the creator chose: natural", "Her slang: chill", "Her emojis: 😅😜😘😈😉❤️", "picked to fit the mood", "She calls fans: babe", "Never use these words or phrases: bot", "Red lines (never offer or discuss): meeting in person", "Services she offers: Selling a VIP package", "Services she does NOT offer", "Travelling this weekend", "Beach set: $35", "Do you have any pets?: a dog named Moose", "Fan: Finally a day off", "Her: Ooh enjoy it babe!"]) assert.ok(text.includes(part), part);
  assert.ok(text.includes("needs_human = true")); // with no answer for "not the creator", a bot question goes to a person
  assert.ok(buildWriterContext({ bio: {}, train: {}, customSamples: [], updates: [], products: [] }).includes("Limits:")); // an empty profile still carries the limits
});

test("fan list rules: who matches, and bad rules are dropped instead of reaching the database", async () => {
  const { cleanGroup } = await import("../../../src/features/creator/schema.ts");
  for (const [id, spend, mode] of [[7001, 0, "assistant"], [7002, 30, "assistant"], [7003, 120, "human"], [7004, 900, "assistant"]] as const) {
    await fan(id);
    await db.run("UPDATE fans SET total_spend = ?, mode = ?, last_message_at = ? WHERE account_id = ? AND fan_id = ?", [spend, mode, Date.now() - id % 7000 * 86400000, ACCT, String(id)]);
  }
  const mine = (rules: unknown) => creator.previewFans(ACCT, rules, "").then((r) => r.fans.filter((f) => f.id.startsWith("700")).map((f) => f.id).sort());
  assert.deepEqual(await mine({ match: "all", rules: [{ field: "spend", op: ">", value: "50" }] }), ["7003", "7004"]);
  assert.deepEqual(await mine({ match: "any", rules: [{ field: "spend", op: "<", value: "10" }, { field: "jazz", op: "=", value: "human" }] }), ["7001", "7003"]);
  assert.deepEqual(await mine({ match: "all", rules: [{ field: "spend", op: ">", value: "10" }, { match: "any", rules: [{ field: "jazz", op: "=", value: "human" }, { field: "spend", op: ">", value: "500" }] }] }), ["7003", "7004"]);
  const p = await creator.previewFans(ACCT, { rules: [{ field: "spend", op: ">", value: "50" }] }, "fan7003");
  assert.deepEqual([p.total, p.buckets], [1, [0, 0, 1, 0]]);
  // anything that is not a known field, operator or number is dropped, never put into SQL
  const g = cleanGroup({ match: "any", rules: [{ field: "spend; DROP TABLE fans", op: ">", value: "1" }, { field: "spend", op: "LIKE", value: "5" }, { field: "spend", op: ">", value: "abc" }, { field: "jazz", op: "=", value: "x" }] });
  assert.deepEqual(g.rules, [{ field: "spend", op: ">", value: "5" }]); // an unknown operator becomes "greater than"
});

test("the writer prompt shows the examples closest to what the fan wrote, not just the first ones", () => {
  const train = { "custom/1": "first answer", "custom/2": "price answer", "custom/3": "third answer" };
  const customSamples = [{ id: 1, title: "a", fan: ["good morning"] }, { id: 2, title: "b", fan: ["how much is this video?"] }, { id: 3, title: "c", fan: ["good night"] }];
  const base = { bio: {}, train, customSamples, updates: [], products: [], maxExamples: 1 };
  assert.ok(buildWriterContext({ ...base, focus: "how much does the video cost" }).includes("price answer"));
  assert.ok(buildWriterContext(base).includes("first answer")); // no message: the order is kept
});

test("a reply longer than twice her usual text is cut to whole sentences; a short one is untouched", () => {
  const long = "Oh wow, that sounds exciting! Do you have any dates coming up? I love checking out events. Let me know if you have any recommendations!";
  assert.equal(polishReply(long, { lowercase: false, maxWords: 12 }), "Oh wow, that sounds exciting! Do you have any dates coming up?");
  assert.equal(polishReply("heyy you", { lowercase: false, maxWords: 12 }), "heyy you");
  assert.equal(polishReply("one very long sentence without any stop that keeps going well past the limit we set", { lowercase: false, maxWords: 5 }).split(" ").length > 5, true); // never an empty reply: the first sentence stays
});

test("closestAnswer gives her saved answer that fits the fan's message, or null without any", () => {
  const customSamples = [{ id: 1, fan: ["good morning"] }, { id: 2, fan: ["i want to see more of your body tonight"] }];
  const train = { "custom/1": "morning you", "custom/2": "mm keep going 😏" };
  assert.equal(closestAnswer(train, customSamples, "i want to see more of you"), "mm keep going 😏");
  assert.equal(closestAnswer({}, customSamples, "hi"), null);
});

test("her facts come before the long blocks, the ones a question asks for go first, and the age is worked out", () => {
  const bio = { birth_date: "1995-05-12", city: "Toronto", pets: "a dog named Moose", work: "pilates instructor", hobbies: "hiking" };
  const longProduct = { name: "Big set", price: 9, description: "x".repeat(300), tags: [], progression: 1, media: [] };
  const text = (focus: string) => buildWriterContext({ bio, train: {}, customSamples: [], updates: [], products: Array.from({ length: 8 }, (_, k) => ({ ...longProduct, name: `Set ${k}` })) as never, maxChars: 1500, focus });
  const pets = text("do you have any pets?");
  assert.ok(pets.indexOf("a dog named Moose") > -1 && pets.indexOf("a dog named Moose") < pets.indexOf("Products she sells")); // facts before products, and not cut off
  assert.ok(pets.split("About her")[1]!.split("\n")[1]!.includes("Moose")); // the question's fact is the first line
  assert.ok(text("how old are you?").includes("years old"));
  assert.ok(text("where are you from?").split("About her")[1]!.split("\n")[1]!.includes("Toronto"));
});

test("notes added to her earlier texts for the writer are removed if the model copies them into the reply", () => {
  const o = { lowercase: false };
  assert.equal(polishReply("Hmm, that's tough. What about you? \u2764\uFE0F (a bump message)", o), "Hmm, that's tough. What about you? \u2764\uFE0F");
  assert.equal(polishReply("want it babe? (a bump message, locked PPV $15 with 1 media) 😘", o), "want it babe? 😘");
  assert.equal(polishReply("I love tacos (and margaritas)", o), "I love tacos (and margaritas)"); // an ordinary bracket stays
});

test("closestAnswer is null when none of her saved samples is about what he asked", () => {
  const customSamples = [{ id: 1, fan: ["what is your religion?"] }];
  assert.equal(closestAnswer({ "custom/1": "i keep that private babe 😘" }, customSamples, "whats your relegious belief?"), null); // a typo does not match: no wrong answer is chosen
  assert.equal(closestAnswer({ "custom/1": "i keep that private babe 😘" }, customSamples, "what is your religion, babe?"), "i keep that private babe 😘");
  assert.equal(closestAnswer({ "custom/1": "x" }, customSamples, "good morning"), null);
});
