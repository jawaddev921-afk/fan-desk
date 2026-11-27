import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountPatchSchema, defaultSettings, parseSettings } from "../../../src/features/accounts/schema.ts";

const valid = { ...defaultSettings("Sara"), ai_enabled: false, send_mode: "draft" as const };

test("a saved assistantIntro from an older version is ignored, not an error", () => {
  const old = { ...defaultSettings("Sara"), assistantIntro: "Hi! I'm Sara's assistant." };
  assert.deepEqual(parseSettings(JSON.stringify(old)), defaultSettings("Sara"));
  assert.equal(AccountPatchSchema.safeParse(valid).success, true);
});

test("limits: menu price and send mode are bounded", () => {
  assert.equal(AccountPatchSchema.safeParse({ ...valid, menu: [{ item: "x", price: -1 }] }).success, false);
  assert.equal(AccountPatchSchema.safeParse({ ...valid, send_mode: "yolo" }).success, false);
});

test("corrupt or invalid saved settings fall back to safe defaults", () => {
  assert.deepEqual(parseSettings("{not json"), defaultSettings("the creator"));
  assert.deepEqual(parseSettings(JSON.stringify({ name: "X" })), defaultSettings("the creator"));
});

test("valid saved settings are read back unchanged", () => {
  const s = defaultSettings("Sara");
  assert.deepEqual(parseSettings(JSON.stringify(s)), s);
});
