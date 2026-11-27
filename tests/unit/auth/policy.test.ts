import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordProblems } from "../../../src/features/auth/schema.ts";

test("a good passphrase passes", () => {
  assert.deepEqual(passwordProblems("correct horse battery", "a@b.co"), []);
  assert.deepEqual(passwordProblems("demo-password-123", "demo@example.com"), []); // contains 'demo' but is not just 'demo'
});

test("too short says how long it is; too long is refused", () => {
  assert.match(passwordProblems("short")[0], /at least 10 .*you have 5/);
  assert.equal(passwordProblems("x".repeat(201)).length, 1);
  assert.deepEqual(passwordProblems("x1".repeat(100)), []); // exactly 200 is fine
});

test("common passwords are refused, whatever the letter case", () => {
  assert.match(passwordProblems("Password123")[0], /too common/);
  assert.match(passwordProblems("QWERTYUIOP")[0], /too common/);
  assert.match(passwordProblems("1234567890")[0], /too common/);
});

test("one repeated character and the email itself are refused", () => {
  assert.match(passwordProblems("aaaaaaaaaaaa")[0], /repeat/);
  assert.match(passwordProblems("sara@example.com", "Sara@Example.com")[0], /email/);
  assert.match(passwordProblems("jane.doe", "jane.doe@example.com")[0], /email/);
});
