import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

const pg = await startTestDb();
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
const { encrypt } = await import("../../../src/lib/crypto.ts");
const users = await import("../../../src/features/auth/queries.ts");
const accounts = await import("../../../src/features/accounts/queries.ts");
const creator = await import("../../../src/features/creator/service.ts");

after(async () => {
  await closeAppPool();
  await pg.stop();
});

const user = await users.insertUser("creator@example.com", "x");
await accounts.insertConnection(user.id, { keyEnc: encrypt("ofmapi_test_key_000000000000"), last4: "0000", teamName: null, teamSlug: null, credits: null, webhookToken: "t".repeat(24), webhookSecretEnc: encrypt("s") });
await accounts.insertAccount("acct_a", user.id, "a", "A", "{}");
await accounts.insertAccount("acct_b", user.id, "b", "B", "{}");
const bump = { message: "hey", price: 0, trigger: "Online" };
const tomorrow = () => Date.now() + 24 * 60 * 60 * 1000;

test("a new account has the master switch on and bump off, and nothing saved", async () => {
  const v = await creator.creatorOf("acct_a");
  assert.deepEqual(v.flags, { enabled: true, bump: false });
  assert.deepEqual([v.values, v.train, v.counts], [{}, {}, { update: 0, product: 0, bump: 0, script: 0, sample: 0, fanlist: 0, flow: 0 }]);
});

test("items belong to one account: another account cannot edit or delete them", async () => {
  await creator.createItem("acct_a", "bump", true, bump);
  const [item] = await creator.itemsOf("acct_a", "bump");
  await assert.rejects(creator.saveItem("acct_b", item!.id, "bump", true, bump), /Not found/); // same id, wrong account
  await creator.removeItem("acct_b", item!.id);
  assert.equal((await creator.itemsOf("acct_a", "bump")).length, 1); // the delete from account B did nothing
  await assert.rejects(creator.saveItem("acct_a", item!.id, "product", true, bump), /Not found/); // wrong kind
  await creator.saveItem("acct_a", item!.id, "bump", false, { ...bump, message: "changed" });
  assert.deepEqual((await creator.itemsOf("acct_a", "bump")).map((i) => [i.live, i.data.message]), [[false, "changed"]]);
  assert.equal((await creator.creatorOf("acct_a")).counts.bump, 1);
});

test("at most 7 live updates are active; expired or switched-off ones do not count", async () => {
  for (let i = 0; i < 7; i++) await creator.createItem("acct_a", "update", true, { content: `u${i}`, endsAt: tomorrow() });
  await assert.rejects(creator.createItem("acct_a", "update", true, { content: "eighth", endsAt: tomorrow() }), /up to 7/);
  await creator.createItem("acct_a", "update", false, { content: "off", endsAt: tomorrow() }); // not live: allowed
  await creator.createItem("acct_a", "update", true, { content: "already over", endsAt: Date.now() - 1000 }); // expired: allowed
  const first = (await creator.itemsOf("acct_a", "update"))[0]!;
  await creator.saveItem("acct_a", first.id, "update", true, first.data); // editing one of the 7 is not a new one
});

test("train answers: only known samples, an empty answer removes it", async () => {
  await assert.rejects(creator.updateTrain("acct_a", "rapport/not-a-sample", "x"), /Unknown sample/);
  await creator.updateTrain("acct_a", "rapport/day-off", "  enjoy it babe  ");
  assert.deepEqual((await creator.creatorOf("acct_a")).train, { "rapport/day-off": "enjoy it babe" });
  await creator.updateTrain("acct_a", "rapport/day-off", "  ");
  assert.deepEqual((await creator.creatorOf("acct_a")).train, {});
});

test("the master switch is stored per account; handleChats turns the AI flag on the account", async () => {
  await creator.updateFlags(user.id, "acct_a", { enabled: false });
  assert.equal(await creator.creatorEnabled("acct_a"), false);
  assert.equal(await creator.creatorEnabled("acct_b"), true);
  await creator.updateFlags(user.id, "acct_a", { handleChats: true, bump: true });
  assert.equal((await accounts.getAccount("acct_a"))!.ai_enabled, 1);
  assert.deepEqual((await creator.creatorOf("acct_a")).flags, { enabled: false, bump: true }); // the earlier change is kept
  await creator.copyFrom("bio", "acct_b", "acct_a");
});

test("custom train samples: the answer is accepted only for a sample of this account, and deleting the sample removes the answer", async () => {
  await creator.createItem("acct_a", "sample", true, { category: "Mine", title: "Mine 1", fan: ["hi"] });
  const [s] = await creator.itemsOf("acct_a", "sample");
  await assert.rejects(creator.updateTrain("acct_b", `custom/${s!.id}`, "x"), /Unknown sample/); // another account's sample
  await creator.updateTrain("acct_a", `custom/${s!.id}`, "my answer");
  assert.equal((await creator.creatorOf("acct_a")).train[`custom/${s!.id}`], "my answer");
  await creator.removeItem("acct_a", s!.id);
  assert.equal((await creator.creatorOf("acct_a")).train[`custom/${s!.id}`], undefined);
});

test("importing Train answers copies only the built-in samples", async () => {
  await creator.updateTrain("acct_a", "rapport/day-off", "from a");
  await creator.createItem("acct_a", "sample", true, { category: "Mine", title: "Mine 2", fan: ["hello"] });
  const [mine] = (await creator.itemsOf("acct_a", "sample"));
  await creator.updateTrain("acct_a", `custom/${mine!.id}`, "custom answer");
  await creator.copyFrom("train", "acct_b", "acct_a");
  assert.deepEqual((await creator.creatorOf("acct_b")).train, { "rapport/day-off": "from a" });
});

test("a Request from Creator link: works for its account only, merges her answers, expires, and a wrong token is refused", async () => {
  const token = await creator.createBioRequest("acct_b");
  assert.equal(token.length, 43);
  const first = await creator.requestedBio(token);
  assert.equal(first.name, "B");
  await creator.updateBio("acct_b", { city: "Austin" });
  await creator.saveRequestedBio(token, { name: "Sam", evil: "x" } as never);
  assert.deepEqual((await creator.creatorOf("acct_b")).values, { city: "Austin", name: "Sam" }); // merged, unknown dropped
  assert.deepEqual((await creator.creatorOf("acct_a")).values, {}); // the other account is untouched
  await assert.rejects(creator.requestedBio("x".repeat(43)), /not valid/);
  await assert.rejects(creator.requestedBio("short"), /not valid/);
  const { db } = await import("../../../src/lib/db.ts");
  await db.run("UPDATE creator_requests SET expires_at = 1");
  await assert.rejects(creator.requestedBio(token), /expired/);
});

test("targeting: a new account has the defaults, a save keeps the other half, and bad numbers are clamped", async () => {
  const fresh = (await creator.creatorOf("acct_b")).targeting;
  assert.deepEqual([fresh.chats.oldFans, fresh.chats.timeWasters.noSpend, fresh.bump.newFans], [{ on: false, days: 180 }, 20, { on: false, days: 5 }]);
  await creator.updateTargeting("acct_b", { chats: { ...fresh.chats, highSpender: { on: true, amount: 25 }, timeWasters: { ...fresh.chats.timeWasters, on: true, noSpend: -4 } } });
  await creator.updateTargeting("acct_b", { bump: { ...fresh.bump, oldFans: { on: true, days: 100 } } });
  const t = (await creator.creatorOf("acct_b")).targeting;
  assert.deepEqual([t.chats.highSpender, t.chats.timeWasters.on, t.chats.timeWasters.noSpend, t.bump.oldFans], [{ on: true, amount: 25 }, true, 0, { on: true, days: 100 }]); // the second save kept the chats half
  await creator.updateTargeting("acct_b", { chats: "garbage", bump: null });
  assert.deepEqual((await creator.creatorOf("acct_b")).targeting.chats.highSpender, { on: false, amount: 25 }); // anything unreadable falls back to the defaults
});

test("fan lists are items of the account, and the exclude lists keep only whole numbers", async () => {
  await creator.createItem("acct_a", "fanlist", true, { name: "VIPs", ofId: null, count: null });
  await creator.createItem("acct_a", "fanlist", true, { name: "Copied", ofId: "123", count: 40 });
  assert.deepEqual((await creator.itemsOf("acct_a", "fanlist")).map((l) => l.data.name), ["VIPs", "Copied"]);
  assert.equal((await creator.itemsOf("acct_b", "fanlist")).length, 0);
  await creator.updateTargeting("acct_a", { chats: { excludeLists: [3, 3, 1.5, "x", -2, 7] } });
  assert.deepEqual((await creator.creatorOf("acct_a")).targeting.chats.excludeLists, [3, 7]);
});

test("recently sent PPVs: priced attachments sent from the account, the same message counted once, newest first", async () => {
  const { db } = await import("../../../src/lib/db.ts");
  const add = (text: string, price: number, at: number, dir = "out") => db.run("INSERT INTO messages (account_id, fan_id, direction, source, text, created_at, media) VALUES ('acct_a', '1', ?, 'human', ?, ?, ?::jsonb)", [dir, text, at, JSON.stringify([{ id: "m1", type: "video", locked: true, price, url: null }])]);
  await add("new set", 25, 1000);
  await add("new set", 25, 3000); // the same message sent to another fan
  await add("free one", 0, 2000);
  await add("from a fan", 25, 4000, "in");
  assert.deepEqual((await creator.sentPpvs("acct_a")).map((p) => [p.text, p.price, p.sentAt]), [["new set", 25, 3000]]);
});

test("Advanced Settings: any saved value becomes valid, ranges stay ordered and inside their limits", async () => {
  const { cleanAdvanced } = await import("../../../src/features/creator/schema.ts");
  const d = cleanAdvanced(null);
  assert.deepEqual([d.delay.min, d.delay.max, d.followUp.min, d.followUp.max, d.noBumpHours, d.days.length, d.respondWhenBack], [20, 50, 3, 6, 4, 7, false]);
  const w = cleanAdvanced({ delay: { on: true, min: 900, max: 5 }, followUp: { min: 1, max: 99 }, days: [{ mode: "custom", from: "25:00", to: "18:30" }, { mode: "bogus" }], silentPpv: { exclusivity: 9 } });
  assert.deepEqual([w.delay.min, w.delay.max, w.followUp.min, w.followUp.max, w.silentPpv.exclusivity], [20, 180, 2, 30, 5]);
  assert.deepEqual(w.days[0], { mode: "custom", from: "09:00", to: "18:30" }); // a bad time takes the default
  assert.equal(w.days[1]!.mode, "on");
});

test("Flows: steps are added in line, a deleted step is bridged, and a flow is ready only when everything is filled in", async () => {
  const { blankFlow, flowAdd, flowDelete, flowIssues, flowKids } = await import("../../../src/features/creator/schema.ts");
  let n = blankFlow().nodes;
  n = flowAdd(n, "start", null, "delay");
  const delay = flowKids(n, "start")[0]!;
  n = flowAdd(n, "start", null, "message"); // inserted between the start and the delay
  const msg = flowKids(n, "start")[0]!;
  assert.deepEqual([msg.kind, flowKids(n, msg.id)[0]!.id], ["message", delay.id]);
  n = flowDelete(n, msg.id);
  assert.equal(flowKids(n, "start")[0]!.id, delay.id); // the follower took its place
  n = flowAdd(n, delay.id, null, "condition");
  const cond = flowKids(n, delay.id)[0]!;
  n = flowAdd(n, cond.id, "true", "message");
  assert.equal(flowKids(n, cond.id, "true").length, 1);
  assert.equal(flowDelete(n, cond.id).length, 2); // a condition takes its branches with it; the start stays
  assert.equal(flowDelete(n, "start").length, n.length); // the start cannot be deleted
  const flow = { ...blankFlow(), nodes: n };
  assert.deepEqual(flowIssues(flow).sort(), ["Choose a condition", "Finish the message", "Set how long to wait"]);
  const ready = n.map((x) => (x.kind === "delay" ? { ...x, config: { ...x.config, amount: 2 } } : x.kind === "condition" ? { ...x, config: { ...x.config, type: "purchased" } } : x.kind === "message" ? { ...x, config: { ...x.config, title: "Hi", text: "hello" } } : x));
  assert.deepEqual(flowIssues({ ...flow, nodes: ready }), []);
});

test("Flows: the ready-made templates are complete and an unknown template is an empty flow", async () => {
  const { flowFromTemplate, flowIssues, FLOW_TEMPLATES } = await import("../../../src/features/creator/schema.ts");
  for (const t of FLOW_TEMPLATES) assert.deepEqual(flowIssues(flowFromTemplate(t.id)), [], t.id);
  assert.equal(flowFromTemplate("subscriber").nodes.filter((n) => n.kind === "message").length, 3);
  assert.equal(flowFromTemplate("").nodes.length, 1);
});
