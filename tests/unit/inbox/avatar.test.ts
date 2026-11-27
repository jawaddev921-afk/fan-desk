import assert from "node:assert/strict";
import { test } from "node:test";
import { isAvatarUrl } from "../../../src/features/inbox/schema.ts";

test("a photo link is fetched only if it is https on OnlyFans' own domain", () => {
  assert.equal(isAvatarUrl("https://public.onlyfans.com/files/a/b/avatar.jpg"), true);
  assert.equal(isAvatarUrl("https://cdn2.onlyfans.com/files/x.png?Tag=2"), true);
  assert.equal(isAvatarUrl("https://onlyfans.com/x.jpg"), true);
});

test("anything else is refused: other hosts, look-alikes, http, junk, non-strings", () => {
  assert.equal(isAvatarUrl("https://evil.example/avatar.jpg"), false);
  assert.equal(isAvatarUrl("https://onlyfans.com.evil.example/a.jpg"), false);
  assert.equal(isAvatarUrl("https://notonlyfans.com/a.jpg"), false);
  assert.equal(isAvatarUrl("http://public.onlyfans.com/a.jpg"), false);
  assert.equal(isAvatarUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isAvatarUrl("not a url"), false);
  assert.equal(isAvatarUrl(null), false);
  assert.equal(isAvatarUrl(undefined), false);
});
