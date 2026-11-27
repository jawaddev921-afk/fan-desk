import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFakeOfmapi } from "../../support/fakeofmapi.ts";
import { closeAppPool, startTestDb } from "../../support/pgserver.ts";

// 12 conversations, newest first: 5 inside the 90-day window, then 7 older. The fake serves 3 per inbox page.
const AGES = [1, 3, 10, 40, 80, 100, 120, 200, 300, 400, 500, 600];
const pg = await startTestDb();
const fake = await startFakeOfmapi(AGES);
process.env.DATABASE_URL = pg.url;
process.env.DB_POOL_MAX = "1";
process.env.APP_SECRET ||= "ab".repeat(32);
process.env.OFMAPI_BASE_URL = fake.base;
const { db } = await import("../../../src/lib/db.ts");
const { encrypt } = await import("../../../src/lib/crypto.ts");
const { bus } = await import("../../../src/lib/events.ts");
const users = await import("../../../src/features/auth/queries.ts");
const accounts = await import("../../../src/features/accounts/queries.ts");
const inbox = await import("../../../src/features/inbox/service.ts");

after(async () => {
  await fake.stop();
  await closeAppPool();
  await pg.stop();
});

const user = await users.insertUser("sync@example.com", "x");
await accounts.insertConnection(user.id, { keyEnc: encrypt("ofmapi_test_key_000000000000"), last4: "0000", teamName: null, teamSlug: null, credits: null, webhookToken: "t".repeat(24), webhookSecretEnc: encrypt("s") });
const ACCT = "acct_sync1";
await accounts.insertAccount(ACCT, user.id, "lexi", "Lexi", "{}"); // a new account starts as 'running'

const state = async () => (await accounts.getAccount(ACCT))!;
const counts = async () => ({
  fans: (await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM fans WHERE account_id = ?", [ACCT]))!.n,
  messages: (await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE account_id = ?", [ACCT]))!.n,
});

test("a new account imports the last 90 days by itself and stops after two pages with nothing in the window", async () => {
  assert.equal((await state()).sync_status, "running");
  await inbox.runSyncSteps();
  const a = await state();
  assert.deepEqual([a.sync_status, a.sync_chats, a.sync_messages], ["done", 5, 10]); // 5 conversations in the window, 2 messages each
  assert.deepEqual(await counts(), { fans: 5, messages: 10 }); // none of the 7 older conversations
  assert.equal(fake.stats.inbox, 4); // pages: [1,3,10] [40,80,100] [120,200,300] [400,500,600] -> two old pages in a row ends it
  assert.equal(fake.stats.conversation, 5);
  assert.equal(a.sync_lease_until, null);
});

test("running it again skips every conversation whose latest message is already stored", async () => {
  assert.equal(await accounts.startAccountSync(ACCT), true); // 'Sync now'
  fake.stats.conversation = 0;
  await inbox.runSyncSteps();
  assert.equal(fake.stats.conversation, 0); // nothing new: not one conversation was read again
  assert.deepEqual(await counts(), { fans: 5, messages: 10 });
  assert.equal((await state()).sync_status, "done");
});

test("a sync that is already running is not started twice", async () => {
  await accounts.startAccountSync(ACCT);
  assert.equal(await accounts.startAccountSync(ACCT), false);
  await inbox.runSyncSteps();
});

test("it continues from the saved cursor, not from the start", async () => {
  await db.run("DELETE FROM messages WHERE account_id = ?", [ACCT]);
  await db.run("DELETE FROM fans WHERE account_id = ?", [ACCT]);
  await accounts.startAccountSync(ACCT);
  await db.run("UPDATE accounts SET sync_cursor = '3' WHERE account_id = ?", [ACCT]); // as if a step had stopped after the first page
  await inbox.runSyncSteps();
  assert.deepEqual(await counts(), { fans: 2, messages: 4 }); // only the window conversations after the cursor (40 and 80 days old)
});

test("a failed step keeps the import running, remembers why, and nobody else takes it until the retry time", async () => {
  await db.run("UPDATE accounts SET sync_status = 'done' WHERE account_id = ?", [ACCT]);
  await accounts.startAccountSync(ACCT);
  fake.stats.failInboxOnce = true;
  await inbox.runSyncSteps();
  const a = await state();
  assert.equal(a.sync_status, "running");
  assert.match(a.sync_error ?? "", /OFMAPI error/);
  assert.ok((a.sync_lease_until ?? 0) > Date.now());
  await inbox.runSyncSteps(); // still within the retry delay: nothing happens
  assert.equal((await state()).sync_status, "running");
  await db.run("UPDATE accounts SET sync_lease_until = ? WHERE account_id = ?", [Date.now() - 1, ACCT]); // the retry time came
  await inbox.runSyncSteps();
  const b = await state();
  assert.deepEqual([b.sync_status, b.sync_error], ["done", null]);
});

test("a rate limit (429) on a conversation stops the step to be retried later, it does not lose the import", async () => {
  await db.run("DELETE FROM messages WHERE account_id = ?", [ACCT]);
  await accounts.startAccountSync(ACCT);
  fake.stats.rateLimitConversation = true;
  await inbox.runSyncSteps();
  const a = await state();
  assert.equal(a.sync_status, "running");
  assert.match(a.sync_error ?? "", /slow down/);
  fake.stats.rateLimitConversation = false;
});

const mediaOf = async (messageOfId: number) => {
  const row = await db.one<{ id: number; media: { id: string; url: string | null; width?: number; height?: number }[] }>("SELECT id, media FROM messages WHERE account_id = ? AND of_id = ?", [ACCT, String(messageOfId)]);
  return row!;
};

test("a media file is fetched by message and media id; when its link has gone stale the conversation is read again once and the file still arrives", async () => {
  await db.run("DELETE FROM messages WHERE account_id = ?", [ACCT]);
  await db.run("UPDATE accounts SET sync_status = 'done' WHERE account_id = ?", [ACCT]);
  await accounts.startAccountSync(ACCT);
  await inbox.runSyncSteps();
  const account = (await accounts.getAccount(ACCT))!;
  const msg = await mediaOf(1000 * 10 + 1); // the latest message of the newest conversation
  const photo = msg.media.find((x) => x.id === "1000-photo")!;
  assert.ok(photo.url);

  const ok = await inbox.fetchMedia(account, msg.id, "1000-photo");
  assert.equal(ok?.status, 200); // a link that works is just downloaded
  await ok?.arrayBuffer();

  fake.expireLinks(); // OnlyFans' signed links stop working
  const before = fake.stats.conversation;
  const results = await Promise.all(Array.from({ length: 5 }, () => inbox.fetchMedia(account, msg.id, "1000-photo")));
  assert.ok(results.every((r) => r?.status === 200)); // five images of one chat all fail at once, and all five arrive
  assert.equal(fake.stats.conversation - before, 1); // ...after ONE refresh of that conversation
  assert.notEqual((await mediaOf(msg.id === 0 ? 0 : 1000 * 10 + 1)).media.find((x) => x.id === "1000-photo")!.url, photo.url); // the stored link was replaced
});

test("right after a refresh a dead link does not make the server read the chat again (cooldown); after the minute it does", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  const msg = await mediaOf(1000 * 10 + 1);
  fake.expireLinks(); // the previous test refreshed this chat a moment ago
  const before = fake.stats.conversation;
  assert.equal(await inbox.fetchMedia(account, msg.id, "1000-photo"), null); // a clean "not available", not an error
  assert.equal(fake.stats.conversation - before, 0); // and the chat was not read again

  const refreshes = (globalThis as unknown as { __fanDesk: Map<string, Map<string, { at: number }>> }).__fanDesk.get("chat-refreshes")!;
  for (const entry of refreshes.values()) entry.at -= 2 * 60_000; // two minutes later
  const later = await inbox.fetchMedia(account, msg.id, "1000-photo");
  assert.equal(later?.status, 200);
  assert.equal(fake.stats.conversation - before, 1);
});

test("locked media, unknown media and another account's message give nothing", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  const msg = await mediaOf(1000 * 10 + 1);
  assert.equal(await inbox.fetchMedia(account, msg.id, "1000-locked"), null); // paid: no link to fetch
  assert.equal(await inbox.fetchMedia(account, msg.id, "nope"), null);
  assert.equal(await inbox.fetchMedia({ ...account, account_id: "acct_other" }, msg.id, "1000-photo"), null);
});

test("opening a chat reads it again: the message that arrived since the import appears, the media links are replaced and keep their size; asking again at once does nothing", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  const stored = async () => (await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE account_id = ? AND fan_id = '1001'", [ACCT]))!.n;
  const before = await stored();
  const oldUrl = (await mediaOf(1001 * 10 + 1)).media.find((x) => x.id === "1001-photo")!.url;
  fake.addLatest(1001, "are you there?");
  fake.expireLinks();
  const calls = fake.stats.conversation;

  const first = await inbox.refreshConversation(account, "1001");
  assert.deepEqual(first, { imported: 1, skipped: false });
  assert.equal(await stored(), before + 1);
  const photo = (await mediaOf(1001 * 10 + 1)).media.find((x) => x.id === "1001-photo")!;
  assert.notEqual(photo.url, oldUrl); // fresh link
  assert.deepEqual([photo.width, photo.height], [800, 600]); // the page can reserve the space before the file arrives

  const again = await inbox.refreshConversation(account, "1001");
  assert.deepEqual(again, { imported: 0, skipped: true });
  assert.equal(fake.stats.conversation - calls, 1); // the second ask cost no call
});

test("many people asking for the same chat at once (the page, the AI, five broken images) cause one read", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  const refreshes = (globalThis as unknown as { __fanDesk: Map<string, Map<string, { at: number }>> }).__fanDesk.get("chat-refreshes")!;
  for (const entry of refreshes.values()) entry.at -= 5 * 60_000; // the cooldown is over
  const calls = fake.stats.conversation;
  const results = await Promise.all(Array.from({ length: 6 }, () => inbox.refreshConversation(account, "1002")));
  assert.equal(fake.stats.conversation - calls, 1);
  assert.ok(results.every((r) => r.skipped === false));
});

test("a chat we do not know, or a failing provider, gives zero and never throws", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  assert.deepEqual(await inbox.refreshConversation(account, "424242"), { imported: 0, skipped: false }); // no such fan
  const refreshes = (globalThis as unknown as { __fanDesk: Map<string, Map<string, { at: number }>> }).__fanDesk.get("chat-refreshes")!;
  for (const entry of refreshes.values()) entry.at -= 5 * 60_000;
  fake.stats.rateLimitConversation = true; // the provider answers 429
  assert.deepEqual(await inbox.refreshConversation(account, "1003"), { imported: 0, skipped: false });
  fake.stats.rateLimitConversation = false;
});

test("a dropped connection is tried once more, and a second drop is a clean null (the page retries), not an error", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  const msg = await mediaOf(1000 * 10 + 1);
  fake.stats.dropNextDownloads = 1;
  assert.equal((await inbox.fetchMedia(account, msg.id, "1000-photo"))?.status, 200); // the second try worked
  fake.stats.dropNextDownloads = 2;
  assert.equal(await inbox.fetchMedia(account, msg.id, "1000-photo"), null); // both tries dropped: "not available", the call does not throw
});

test("a chat that asks for many pictures at once never opens more than four connections to the provider", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  const msg = await mediaOf(1000 * 10 + 1);
  fake.stats.maxInFlight = 0;
  fake.stats.downloadDelayMs = 40;
  const results = await Promise.all(Array.from({ length: 14 }, () => inbox.fetchMedia(account, msg.id, "1000-photo")));
  fake.stats.downloadDelayMs = 0;
  assert.ok(results.every((r) => r?.status === 200)); // all fourteen arrive...
  assert.ok(fake.stats.maxInFlight <= 4, `at most 4 at a time, saw ${fake.stats.maxInFlight}`); // ...four at a time
});

test("a dead link of an OLD message, pushed deep into the chat by newer ones, is found and refreshed instead of staying broken", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  const msg = await mediaOf(1004 * 10 + 1); // the latest message of chat 1004 as it was imported
  fake.stats.messagePageSize = 2;
  for (let i = 0; i < 8; i++) fake.addLatest(1004, `newer ${i}`); // now it is on page 5 of 5: the normal read (3 pages) cannot reach it
  fake.expireLinks();
  const before = fake.stats.conversation;
  const res = await inbox.fetchMedia(account, msg.id, "1004-photo");
  fake.stats.messagePageSize = 100;
  assert.equal(res?.status, 200); // it was looked for page by page until found, and the fresh link worked
  assert.ok(fake.stats.conversation - before >= 5, "the search went down to the page that holds the message");
});

test("a message the sender removed is marked as gone after one full read of the chat, and nobody asks the provider again; other messages are untouched", async () => {
  const account = (await accounts.getAccount(ACCT))!;
  const msg = await mediaOf(1003 * 10 + 1);
  const other = await mediaOf(1002 * 10 + 1);
  fake.removeMessage(1003 * 10 + 1); // the provider no longer lists it
  fake.expireLinks();
  assert.equal(await inbox.fetchMedia(account, msg.id, "1003-photo"), null); // not found anywhere in the chat
  const stored = (await mediaOf(1003 * 10 + 1)).media as { id: string; gone?: boolean; url: string | null }[];
  assert.ok(stored.every((x) => x.gone === true && x.url === null));
  const before = fake.stats.conversation;
  const downloads = fake.stats.downloads;
  assert.equal(await inbox.fetchMedia(account, msg.id, "1003-photo"), null); // asked again: answered at once
  assert.deepEqual([fake.stats.conversation - before, fake.stats.downloads - downloads], [0, 0]);
  assert.ok((await mediaOf(1002 * 10 + 1)).media.every((x) => (x as { gone?: boolean }).gone !== true)); // a message that is still there is not marked
  void other;
});

const pollDue = () => db.run("UPDATE accounts SET poll_at = NULL WHERE account_id = ?", [ACCT]); // make the account due now

test("a poll with nothing new costs one call: the newest inbox page, no conversation read", async () => {
  await db.run("UPDATE accounts SET sync_status = 'done' WHERE account_id = ?", [ACCT]);
  await pollDue();
  await inbox.runInboxPolls(); // brings the stored data up to date with everything that happened in the earlier tests
  await pollDue();
  const i = fake.stats.inbox;
  const c = fake.stats.conversation;
  await inbox.runInboxPolls();
  assert.deepEqual([fake.stats.inbox - i, fake.stats.conversation - c], [1, 0]);
  await inbox.runInboxPolls(); // not due again for a minute: nothing at all
  assert.equal(fake.stats.inbox - i, 1);
});

test("a message that arrives later is found by the poll, with its picture, without any button", async () => {
  const id = fake.addLatest(1000, "new photo for you", { photo: true });
  await pollDue();
  const c = fake.stats.conversation;
  await inbox.runInboxPolls();
  const row = await db.one<{ text: string; media: { type: string; url: string | null }[] }>("SELECT text, media FROM messages WHERE account_id = ? AND of_id = ?", [ACCT, String(id)]);
  assert.equal(row?.text, "new photo for you");
  assert.equal(row?.media?.[0]?.type, "photo");
  assert.ok(row?.media?.[0]?.url); // the picture is there at once
  assert.equal(fake.stats.conversation - c, 1); // only the chat that changed was read
});

test("a webhook about a message with pictures asks for a poll at once, and the poll fetches the pictures the webhook did not carry", async () => {
  const id = fake.addLatest(1001, "look at this", { photo: true });
  await inbox.handleWebhook(user.id, { event: "messages.received", event_id: "evt-pic-1", account_id: ACCT, payload: { from_user_id: 1001, message: { id, text: "<p>look at this</p>", media_count: 1, user: { id: 1001, username: "fan1001", name: "Fan 1001" }, created_at: new Date().toISOString() } } }, undefined);
  const afterHook = await db.one<{ media: unknown; media_pending: boolean }>("SELECT media, media_pending FROM messages WHERE account_id = ? AND of_id = ?", [ACCT, String(id)]);
  assert.deepEqual([afterHook?.media, afterHook?.media_pending], [null, true]); // the words are there at once, the pictures are on their way
  assert.equal((await state()).poll_at, 0); // the poll was asked for right away, not in a minute

  await inbox.runInboxPolls();
  const after = await db.one<{ media: { type: string }[]; media_pending: boolean }>("SELECT media, media_pending FROM messages WHERE account_id = ? AND of_id = ?", [ACCT, String(id)]);
  assert.deepEqual([after?.media?.[0]?.type, after?.media_pending], ["photo", false]);
});

test("accounts whose first import has not finished (or that are not connected) are not polled", async () => {
  await db.run("UPDATE accounts SET sync_status = 'running' WHERE account_id = ?", [ACCT]);
  await pollDue();
  const i = fake.stats.inbox;
  await inbox.runInboxPolls();
  assert.equal(fake.stats.inbox, i);
  await db.run("UPDATE accounts SET sync_status = 'done' WHERE account_id = ?", [ACCT]);
});

test("removing the key deletes the fans and messages of the account", async () => {
  inbox.startInbox();
  assert.ok((await counts()).fans > 0);
  await bus.emit("connection:removed", [ACCT]);
  assert.deepEqual(await counts(), { fans: 0, messages: 0 });
  await accounts.deleteAccountsOfUser(user.id);
  assert.equal(await accounts.getAccount(ACCT), undefined);
});
