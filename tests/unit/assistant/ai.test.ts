import assert from "node:assert/strict";
import { test } from "node:test";

process.env.APP_SECRET ||= "ab".repeat(32);
const { priceNotOnMenu, estimateCostUsd } = await import("../../../src/features/assistant/service.ts");

const menu = [{ item: "photo set", price: 15 }, { item: "video", price: 25.5 }];

test("price guard: prices on the menu pass", () => {
  assert.equal(priceNotOnMenu("The photo set is $15", menu), false);
  assert.equal(priceNotOnMenu("video is 25.50 dollars", menu), false);
  assert.equal(priceNotOnMenu("video is 25,5 usd", menu), false); // comma decimal
});

test("price guard: a price not on the menu is caught in every spelling", () => {
  assert.equal(priceNotOnMenu("only $20 today", menu), true);
  assert.equal(priceNotOnMenu("USD 20", menu), true);
  assert.equal(priceNotOnMenu("20 bucks", menu), true);
  assert.equal(priceNotOnMenu("$15 or $99", menu), true); // one good price does not hide a bad one
});

test("price guard: text without a price passes; an empty menu allows no price", () => {
  assert.equal(priceNotOnMenu("Hi! How are you?", menu), false);
  assert.equal(priceNotOnMenu("I am 25 years old", menu), false); // a bare number is not a price
  assert.equal(priceNotOnMenu("It is $5", []), true);
});

test("cost estimate: known models, local model, unknown model", () => {
  assert.equal(estimateCostUsd("claude-sonnet-5-5", 1_000_000, 1_000_000), 12);
  assert.equal(estimateCostUsd("ollama:qwen2.5:3b", 5_000_000, 5_000_000), 0);
  assert.equal(estimateCostUsd("some-other-model", 1_000_000, 1_000_000), 0);
});
