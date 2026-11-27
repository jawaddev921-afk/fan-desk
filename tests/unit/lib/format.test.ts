import assert from "node:assert/strict";
import { test } from "node:test";
import { initials } from "../../../src/lib/client/format.ts";

test("initials are letters or digits, never half an emoji", () => {
  assert.equal(initials("Nata Trans Girl"), "NT");
  assert.equal(initials("🍒 Nata Trans Girl 🍒"), "NT"); // the emoji is skipped, not cut in half
  assert.equal(initials("Kiki 👑"), "K");
  assert.equal(initials("@sara_demo"), "S");
  assert.equal(initials("15.3K📣 PROMO"), "1P");
  assert.equal(initials("ली सारा"), "लस"); // other scripts work: the first letter of each of the first two words
});

test("nothing usable gives a question mark", () => {
  assert.equal(initials(""), "?");
  assert.equal(initials(null), "?");
  assert.equal(initials("🍒🍒"), "?");
});
