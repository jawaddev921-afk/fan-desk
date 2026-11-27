// Backtest: runs the writer over REAL chats we already stored and puts its draft next to what the person actually sent.
// Read-only: nothing is saved, queued or sent (it uses the same call as "Try Jazz"). The report holds real fan messages, so it is written
// OUTSIDE the repo (the temp folder) and fan names are replaced by "Fan 1", "Fan 2"...
// Usage: node --env-file=.env --conditions=react-server scripts/backtest.ts [accountId] [howMany=8]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { db } = await import("../src/lib/db.ts");
const { previewReply } = await import("../src/features/assistant/service.ts");

type Row = { fan_id: string; direction: "in" | "out"; source: string; text: string; created_at: number };
const accountId = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : (await db.one<{ account_id: string }>("SELECT account_id FROM fans GROUP BY account_id ORDER BY COUNT(*) DESC LIMIT 1"))!.account_id;
const howMany = Number(process.argv.find((a, i) => i >= 2 && /^\d+$/.test(a)) ?? 8);

// fans with a recent conversation where a PERSON answered a fan (so there is a real answer to compare with)
const fans = await db.all<{ fan_id: string }>("SELECT fan_id FROM fans WHERE account_id = ? AND last_message_at IS NOT NULL ORDER BY last_message_at DESC LIMIT 200", [accountId]);
// a person's text sent to 3+ fans is a mass message / script, not an answer to this fan: not a fair comparison
const mass = new Set((await db.all<{ text: string }>("SELECT text FROM messages WHERE account_id = ? AND direction = 'out' GROUP BY text HAVING COUNT(DISTINCT fan_id) >= 3", [accountId])).map((r) => r.text));
const picks: { fanNo: number; context: { from: "fan" | "creator"; text: string }[]; actual: string }[] = [];
for (const f of fans) {
  if (picks.length >= howMany) break;
  const rows = (await db.all<Row>("SELECT fan_id, direction, source, text, created_at FROM messages WHERE account_id = ? AND fan_id = ? AND text <> '' ORDER BY created_at DESC LIMIT 60", [accountId, f.fan_id])).reverse();
  // the newest place where a fan message is followed by a person's reply (source 'human')
  for (let i = rows.length - 1; i > 0; i--) {
    const r = rows[i]!;
    if (r.direction === "out" && r.source === "human" && rows[i - 1]!.direction === "in" && !mass.has(r.text)) {
      const context = rows.slice(Math.max(0, i - 8), i).map((m) => ({ from: m.direction === "in" ? ("fan" as const) : ("creator" as const), text: m.text.slice(0, 500) }));
      picks.push({ fanNo: picks.length + 1, context, actual: r.text });
      break;
    }
  }
}
console.log(`account ${accountId.slice(0, 10)}…: ${picks.length} real moments to test (provider: ${process.env.AI_PROVIDER ?? "claude"})`);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const emoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);
const out: string[] = [];
let handoffs = 0, failed = 0, dWords = 0, aWords = 0, dEmoji = 0, aEmoji = 0, done = 0;
for (const p of picks) {
  const t0 = Date.now();
  let draft = "", note = "";
  try {
    const r = await previewReply(accountId, p.context);
    draft = r.reply;
    if (r.needsHuman) { handoffs++; note = `handed to a person: ${r.reason}`; }
  } catch (e) { failed++; note = `failed: ${e instanceof Error ? e.message : e}`; }
  done++;
  dWords += words(draft); aWords += words(p.actual); dEmoji += emoji(draft) ? 1 : 0; aEmoji += emoji(p.actual) ? 1 : 0;
  console.log(`  ${done}/${picks.length} done in ${Math.round((Date.now() - t0) / 1000)}s${note ? ` (${note.slice(0, 60)})` : ""}`);
  out.push(`### Fan ${p.fanNo}\n${p.context.slice(-3).map((m) => `- ${m.from === "fan" ? "FAN" : "HER"}: ${m.text.replace(/\n/g, " ").slice(0, 300)}`).join("\n")}\n\n**Jazz draft:** ${draft || "(none)"}${note ? `  \n_${note}_` : ""}\n\n**What the person sent:** ${p.actual.replace(/\n/g, " ").slice(0, 400)}\n`);
}
const n = Math.max(1, done);
const summary = `# Backtest (${new Date().toISOString().slice(0, 16)}Z)\n\n- Moments tested: ${done}; handed to a person: ${handoffs}; failed: ${failed}\n- Average words: Jazz ${(dWords / n).toFixed(1)} vs person ${(aWords / n).toFixed(1)}\n- Replies with an emoji: Jazz ${dEmoji}/${n} vs person ${aEmoji}/${n}\n\nRead each pair and judge: does the draft fit the chat, keep her voice, stay with the facts and prices, and know when to hand over?\n\n`;
const file = path.join(os.tmpdir(), `fan-desk-backtest-${Date.now()}.md`);
fs.writeFileSync(file, summary + out.join("\n"));
console.log(summary.replace(/\n\n/g, "\n"));
console.log(`report (contains real chats, kept outside the repo): ${file}`);
process.exit(0);
