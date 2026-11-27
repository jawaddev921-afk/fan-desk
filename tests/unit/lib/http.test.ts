import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { HttpError, parseBody } from "../../../src/lib/http.ts";

const Body = z.object({ text: z.string().default(""), n: z.number().optional() });

test("parseBody returns the typed body and applies defaults", () => {
  assert.deepEqual(parseBody(Body, {}), { text: "" });
  assert.deepEqual(parseBody(Body, { text: "hi", n: 2 }), { text: "hi", n: 2 });
});

test("parseBody throws a 400 that names the field, or the given name when the whole body is wrong", () => {
  assert.throws(() => parseBody(Body, { text: 5 }), (e) => e instanceof HttpError && e.status === 400 && /^text: /.test(e.message));
  assert.throws(() => parseBody(Body, null, "settings"), (e) => e instanceof HttpError && /^settings: /.test(e.message));
});
