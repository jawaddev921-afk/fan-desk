import assert from "node:assert/strict";
import { test } from "node:test";

process.env.APP_SECRET ||= "ab".repeat(32);
const { htmlToText, isFanId } = await import("../../../src/features/inbox/service.ts");

test("htmlToText turns OnlyFans html into plain text", () => {
  assert.equal(htmlToText("<p>Hi</p><p>there</p>"), "Hi\nthere");
  assert.equal(htmlToText("a<br>b<br />c"), "a\nb\nc");
  assert.equal(htmlToText("Tom &amp; Jerry &lt;3 &quot;x&quot; &#39;y&#39;"), `Tom & Jerry <3 "x" 'y'`);
});

test("htmlToText removes tags and copes with empty input", () => {
  assert.equal(htmlToText('<a href="http://x">link</a>'), "link");
  assert.equal(htmlToText(null), "");
  assert.equal(htmlToText(undefined), "");
});

test("isFanId accepts only plain numeric ids", () => {
  assert.equal(isFanId(12345), true);
  assert.equal(isFanId("12345"), true);
  assert.equal(isFanId("12a"), false);
  assert.equal(isFanId("1; DROP TABLE"), false);
  assert.equal(isFanId(""), false);
  assert.equal(isFanId(null), false);
  assert.equal(isFanId("1".repeat(21)), false); // longer than 20 digits
});
