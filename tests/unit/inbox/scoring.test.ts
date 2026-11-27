import assert from "node:assert/strict";
import { test } from "node:test";

process.env.APP_SECRET ||= "ab".repeat(32);
const { scoreOf } = await import("../../../src/features/inbox/service.ts");

const NOW = Date.UTC(2026, 10, 11);
const fan = (o: object) => ({ total_spend: 0, intent: "unknown", last_paid_at: null, ...o });

test("a new fan with no spend is cold", () => {
  assert.deepEqual(scoreOf(fan({}), NOW), { score: 5, tier: "cold" });
});

test("spam is always 0, even for a big spender who just paid", () => {
  assert.deepEqual(scoreOf(fan({ intent: "spam", total_spend: 900, last_paid_at: NOW }), NOW), { score: 0, tier: "cold" });
});

test("spending $500 or more gives the full 50 spend points (and no more)", () => {
  const at500 = scoreOf(fan({ total_spend: 500, intent: "casual" }), NOW).score;
  assert.equal(at500, 55); // 50 spend + 5 casual
  assert.equal(scoreOf(fan({ total_spend: 50_000, intent: "casual" }), NOW).score, at500);
});

test("recent payment adds 20 points, but only inside 7 days", () => {
  const day = 24 * 60 * 60 * 1000;
  const base = scoreOf(fan({ intent: "casual" }), NOW).score;
  assert.equal(scoreOf(fan({ intent: "casual", last_paid_at: NOW - 6 * day }), NOW).score, base + 20);
  assert.equal(scoreOf(fan({ intent: "casual", last_paid_at: NOW - 8 * day }), NOW).score, base);
});

test("tier cutoffs: 30 is warm, 60 is hot", () => {
  assert.equal(scoreOf(fan({ intent: "buying" }), NOW).tier, "warm"); // 30 points from intent alone
  assert.equal(scoreOf(fan({ intent: "buying", last_paid_at: NOW, total_spend: 500 }), NOW).tier, "hot");
});
