import assert from "node:assert/strict";
import { test } from "node:test";

process.env.APP_SECRET ||= "ab".repeat(32);
const c = await import("../../../src/lib/crypto.ts");

test("encrypt then decrypt returns the original text", () => {
  assert.equal(c.decrypt(c.encrypt("secret key 123")), "secret key 123");
});

test("the same text encrypts differently each time (random iv)", () => {
  assert.notEqual(c.encrypt("x"), c.encrypt("x"));
});

test("a changed ciphertext is rejected, not decrypted to garbage", () => {
  const [v, iv, tag, enc] = c.encrypt("hello").split(".");
  const flipped = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
  assert.throws(() => c.decrypt([v, iv, tag, flipped].join(".")));
  assert.throws(() => c.decrypt("not-a-blob"));
});

test("password check: right passes, wrong fails, junk hash fails", async () => {
  const h = await c.hashPassword("correct horse battery");
  assert.equal(await c.verifyPassword("correct horse battery", h), true);
  assert.equal(await c.verifyPassword("wrong password!!", h), false);
  assert.equal(await c.verifyPassword("anything", "plain$text"), false);
});

test("safeEqual: equal, different, and different length", () => {
  assert.equal(c.safeEqual("abc", "abc"), true);
  assert.equal(c.safeEqual("abc", "abd"), false);
  assert.equal(c.safeEqual("abc", "abcd"), false);
});
