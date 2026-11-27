import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkBoundaries } from "../../../scripts/check-boundaries.ts";

/** Builds a throwaway src/ tree from { "features/inbox/service.ts": "..." } and checks it. */
function check(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boundaries-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return checkBoundaries(dir).errors;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const SO = 'import "server-only";\n';
const clean = {
  "lib/db.ts": SO + "export const x = 1;",
  "lib/client/types.ts": "export type T = number;",
  "features/auth/service.ts": SO + 'import { x } from "../../lib/db.ts"; export const a = x;',
  "features/auth/queries.ts": SO + "export const q = 1;",
  "features/auth/schema.ts": "export const rule = 1;",
  "features/auth/types.ts": "export type U = number;",
  "features/auth/handlers.ts": SO + 'import { a } from "./service.ts"; export const loginHandler = () => a;',
  "features/auth/components/Form.tsx": '"use client";\nimport type { T } from "@/lib/client/types.ts";\nimport { rule } from "../schema.ts";\nexport const Form = (_: T) => rule;',
  "features/inbox/service.ts": SO + 'import { a } from "../auth/service.ts"; export const b = a;',
  "features/inbox/handlers.ts": SO + 'import { b } from "./service.ts"; export const meHandler = () => b;',
  "app/page.tsx": 'import { Form } from "@/features/auth/components/Form.tsx"; export default Form;',
  "app/api/me/route.ts": 'import { meHandler } from "@/features/inbox/handlers.ts";\nimport { route } from "@/app/api/_lib/wrap.ts";\nexport const GET = route(meHandler);',
  "app/api/_lib/wrap.ts": SO + 'import { x } from "@/lib/db.ts"; export const route = (f: unknown) => [f, x];',
};

test("a well-formed tree has no violations", () => {
  assert.deepEqual(check(clean), []);
});

test("another feature may import service/queries/schema/types and components, not handlers.ts", () => {
  const e = check({ ...clean, "features/inbox/c.ts": 'import { loginHandler } from "../auth/handlers.ts";' });
  assert.match(e.join("\n"), /another feature may import auth's service\/queries\/schema\/types\.ts/);
});

test("a feature has only the five role files and components/ (new logic goes into service.ts)", () => {
  const e = check({ ...clean, "features/inbox/ingest.ts": SO + "export const i = 1;" });
  assert.match(e.join("\n"), /a feature has only handlers\/queries\/schema\/service\/types\.ts and components\/ \(put this in inbox\/service\.ts\)/);
});

test("a lower feature cannot depend on a higher one (and that is also a cycle)", () => {
  const e = check({ ...clean, "features/auth/service.ts": clean["features/auth/service.ts"] + '\nimport { b } from "../inbox/service.ts"; export const x = b;' }).join("\n");
  assert.match(e, /auth must not depend on inbox/);
  assert.match(e, /feature cycle/);
});

test("lib/components/config cannot import a feature or the app (they know no feature)", () => {
  assert.match(check({ ...clean, "lib/bad.ts": SO + 'import { a } from "../features/auth/service.ts"; export const y = a;' }).join("\n"), /lib\/ must not import/);
});

test("components and config cannot import a feature either", () => {
  assert.match(check({ ...clean, "components/common/Bad.tsx": 'import { Form } from "../../features/auth/components/Form.tsx";\nexport const Bad = Form;' }).join("\n"), /components\/ must not import/);
  assert.match(check({ ...clean, "config/bad.ts": 'import { a } from "../features/auth/service.ts"; export const c = a;' }).join("\n"), /config\/ must not import/);
});

test("a feature cannot import the app layer", () => {
  assert.match(check({ ...clean, "features/auth/bad.ts": 'import p from "../../app/page.tsx"; export default p;' }).join("\n"), /must not import the app layer/);
});

test("browser code cannot import a server module directly", () => {
  const e = check({ ...clean, "features/auth/components/Bad.tsx": '"use client";\nimport { a } from "../service.ts";\nexport const Bad = () => a;' });
  assert.match(e.join("\n"), /browser code imports server module features\/auth\/service\.ts/);
});

test("browser code cannot reach the database through another file", () => {
  const e = check({
    ...clean,
    "features/auth/components/Deep.tsx": '"use client";\nimport { helper } from "./helper.ts";\nexport const Deep = () => helper;',
    "features/auth/components/helper.ts": 'import { x } from "../../../lib/db.ts";\nexport const helper = x;',
  });
  assert.match(e.join("\n"), /browser code imports server module lib\/db\.ts \(via .*helper\.ts\)/);
});

test("browser code cannot import queries.ts or another server role file", () => {
  const e = check({ ...clean, "app/client.tsx": '"use client";\nimport { q } from "@/features/auth/queries.ts";\nexport const C = () => q;' });
  assert.match(e.join("\n"), /browser code imports server module features\/auth\/queries\.ts/);
});

test("browser code may import a feature's schema.ts, types.ts and components", () => {
  assert.deepEqual(check({ ...clean, "app/ok.tsx": '"use client";\nimport { rule } from "@/features/auth/schema.ts";\nexport const Ok = () => rule;' }), []);
});

test("browser code cannot use node: modules", () => {
  const e = check({ ...clean, "app/fs.tsx": '"use client";\nimport fs from "node:fs";\nexport const F = () => fs;' });
  assert.match(e.join("\n"), /browser code reaches node:fs/);
});

test("a type-only import of a server module is fine in browser code (it is erased)", () => {
  const e = check({ ...clean, "app/typed.tsx": '"use client";\nimport type { a } from "@/features/auth/service.ts";\nexport const t = (_: typeof a) => null;' });
  assert.deepEqual(e, []);
});

test("a server file without `import \"server-only\"` is refused (the compiler is the second guard)", () => {
  const e = check({ ...clean, "features/inbox/queries.ts": "export const q = 1;" });
  assert.match(e.join("\n"), /features\/inbox\/queries\.ts: server file without `import "server-only";`/);
});

test("lib/ files are held to the same server rules (server-only, relative imports)", () => {
  assert.match(check({ ...clean, "lib/extra.ts": "export const e = 1;" }).join("\n"), /lib\/extra\.ts: server file without `import "server-only";`/);
  assert.match(check({ ...clean, "lib/extra.ts": SO + 'import { x } from "@/lib/db.ts"; export const e = x;' }).join("\n"), /lib\/extra\.ts: use a relative import/);
  // browser-safe helpers live in lib/client and need no server-only
  assert.deepEqual(check({ ...clean, "lib/client/fmt.ts": "export const f = 1;" }), []);
});

test("an API route file may only wire a feature's handlers.ts to the route wrapper", () => {
  const e = check({ ...clean, "app/api/bad/route.ts": 'import { x } from "@/lib/db.ts";\nexport const GET = () => x;' });
  assert.match(e.join("\n"), /a route file may only import a feature's handlers\.ts or app\/api\/_lib/);
});

test("an API route that exports a bare handler (no route()/publicRoute()) is refused", () => {
  const bare = check({ ...clean, "app/api/bad/route.ts": "export async function GET() { return new Response('open to everyone'); }" });
  assert.match(bare.join("\n"), /GET is exported as a bare function/);
  const other = check({ ...clean, "app/api/bad/route.ts": 'import { meHandler } from "@/features/inbox/handlers.ts";\nexport const POST = meHandler;' });
  assert.match(other.join("\n"), /POST must be wrapped in route\(\) or publicRoute\(\)/);
});

test("module-level let in server code is refused (state must live in singleton())", () => {
  assert.match(check({ ...clean, "features/inbox/service.ts": clean["features/inbox/service.ts"] + "\nlet running = false;" }).join("\n"), /module-level "let"/);
});

test("server files that Node runs directly must use relative imports, not the @/ alias", () => {
  const e = check({ ...clean, "features/inbox/service.ts": clean["features/inbox/service.ts"] + '\nimport { x } from "@/lib/db.ts"; export const c = x;' });
  assert.match(e.join("\n"), /use a relative import/);
  // components and app files may use the alias
  assert.deepEqual(check({ ...clean, "features/auth/components/Ok.tsx": '"use client";\nimport type { T } from "@/lib/client/types.ts";\nexport const Ok = (_: T) => null;' }), []);
});

test("the real source tree passes every rule (this is the gate; `npm test` runs it too)", () => {
  const { errors } = checkBoundaries(fileURLToPath(new URL("../../../src", import.meta.url)));
  assert.deepEqual(errors, []);
});
