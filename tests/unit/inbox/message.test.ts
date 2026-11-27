import assert from "node:assert/strict";
import { test } from "node:test";
import { lockedLabel, readMessage } from "../../../src/features/inbox/schema.ts";

test("a tip: the words the fan wrote stay, and the amount is read from them in any language", () => {
  assert.deepEqual(readMessage("[tip] I sent you a $33.33 tip"), { kind: "tip", text: "I sent you a $33.33 tip", amount: 33.33 });
  assert.deepEqual(readMessage("[tip] Te envi\u00e9 una $1.00 propina"), { kind: "tip", text: "Te envi\u00e9 una $1.00 propina", amount: 1 });
  assert.deepEqual(readMessage("[tip] thanks for everything"), { kind: "tip", text: "thanks for everything", amount: null }); // no amount in the words
  assert.deepEqual(readMessage("[tip] $5,50 for you"), { kind: "tip", text: "$5,50 for you", amount: 5.5 }); // a comma as the decimal mark
});

test("a message that is only pictures, and an empty one", () => {
  assert.deepEqual(readMessage("[sent 3 media]"), { kind: "media-only", count: 3 });
  assert.deepEqual(readMessage("[empty message]"), { kind: "empty" });
});

test("a tip or PPV purchase written by the webhook is a payment", () => {
  assert.deepEqual(readMessage("[tip $20]"), { kind: "payment", label: "Tip received", amount: 20 });
  assert.deepEqual(readMessage("[PPV purchase $15.5]"), { kind: "payment", label: "PPV unlocked", amount: 15.5 });
});

test("everything else is plain text, even text that mentions a bracket", () => {
  assert.deepEqual(readMessage("hello"), { kind: "text", text: "hello" });
  assert.deepEqual(readMessage("[WET SURPRISE IN A VIDEO!!]"), { kind: "text", text: "[WET SURPRISE IN A VIDEO!!]" }); // a fan's own brackets
  assert.deepEqual(readMessage("see [tip] here"), { kind: "text", text: "see [tip] here" }); // only a leading marker counts
  assert.deepEqual(readMessage("[sent 3 media] and more words"), { kind: "text", text: "[sent 3 media] and more words" });
});

test("locked media is described with what the provider does send: kind, video length, price", () => {
  assert.equal(lockedLabel([{ type: "photo", price: 9.99 }]), "Locked photo \u00b7 $9.99");
  assert.equal(lockedLabel([{ type: "video", price: 28, duration: 42 }]), "Locked video \u00b7 0:42 \u00b7 $28");
  assert.equal(lockedLabel([{ type: "video", price: 0, duration: 125 }]), "Locked video \u00b7 2:05"); // no price, minutes and padded seconds
  assert.equal(lockedLabel([{ type: "photo", price: 5 }, { type: "photo", price: 5 }, { type: "video", price: 5 }]), "3 locked items: 2 photos, 1 video \u00b7 $5");
  assert.equal(lockedLabel([{ type: "video", price: 21.3, duration: 500 }]), "Locked video \u00b7 8:20 \u00b7 $21.30"); // two decimals when it has cents
  assert.equal(lockedLabel([]), "");
});
