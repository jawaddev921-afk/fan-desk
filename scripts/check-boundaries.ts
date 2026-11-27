// Enforces the architecture rules in CLAUDE.md. Run: npm run check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Lower features never import higher ones (also written in CLAUDE.md and the ADR).
const ORDER = ["auth", "accounts", "inbox", "library", "creator", "assistant"];
// Every feature has the same files, named by role. Other features may import service/queries/schema/types and the
// components; only the route files may import handlers.ts.
const ROLE_FILES = new Set(["handlers.ts", "queries.ts", "schema.ts", "service.ts", "types.ts"]);
const PUBLIC_ROLE_FILES = new Set(["service.ts", "queries.ts", "schema.ts", "types.ts"]);

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

type Import = { spec: string; typeOnly: boolean };

/** Every import / re-export / dynamic import in a file. `import type` and `export type` are erased at build time. */
function importsOf(text: string): Import[] {
  const found: Import[] = [];
  for (const m of text.matchAll(/^(import|export)\s+(type\s+)?(?:[^;'"]*?\s)?from\s*["']([^"']+)["']/gm)) found.push({ spec: m[3], typeOnly: !!m[2] });
  for (const m of text.matchAll(/^import\s*["']([^"']+)["']/gm)) found.push({ spec: m[1], typeOnly: false });
  for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.push({ spec: m[1], typeOnly: false });
  return found;
}

const isClientFile = (text: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text);

export function checkBoundaries(srcDir: string): { errors: string[]; summary: string } {
  const SRC = path.resolve(srcDir);
  const files = listFiles(SRC);
  const rel = (abs: string) => path.relative(SRC, abs).split(path.sep).join("/");
  const errors: string[] = [];

  /** The file an import points at, or null for a package (react, next/link, node:fs). */
  function resolve(from: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
    else return null;
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    }
    return base;
  }

  const featureOf = (abs: string) => rel(abs).match(/^features\/([^/]+)\//)?.[1];
  const layerOf = (abs: string) => {
    const r = rel(abs);
    if (r.startsWith("lib/")) return "lib";
    if (r.startsWith("components/")) return "components";
    if (r.startsWith("config/")) return "config";
    if (r.startsWith("features/")) return "features";
    return "app"; // src/app/**, proxy.ts, instrumentation*.ts: the composition layer
  };
  const isServerMarkedFile = (r: string) =>
    /^features\/[^/]+\/(handlers|service|queries)\.ts$/.test(r) || /^lib\/(?!client\/)(?:integrations\/)?[^/]+\.ts$/.test(r) || /^app\/api\/_lib\/[^/]+\.ts$/.test(r);

  const graph = new Map<string, { to: string; typeOnly: boolean; spec: string }[]>();
  const deps = new Map<string, Set<string>>();
  const texts = new Map<string, string>();

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    texts.set(file, text);
    const edges: { to: string; typeOnly: boolean; spec: string }[] = [];
    for (const imp of importsOf(text)) {
      const to = resolve(file, imp.spec);
      if (to) edges.push({ to, typeOnly: imp.typeOnly, spec: imp.spec });
      else edges.push({ to: imp.spec, typeOnly: imp.typeOnly, spec: imp.spec }); // package
    }
    graph.set(file, edges);

    const from = featureOf(file);
    for (const { to, spec } of edges) {
      if (!path.isAbsolute(to)) continue; // a package
      const target = featureOf(to);
      if (spec.startsWith("@/") && /^(features\/[^/]+\/[^/]+\.ts|lib\/(?:integrations\/)?[^/]+\.ts)$/.test(rel(file))) {
        errors.push(`${rel(file)}: use a relative import (${spec}): Node runs this file directly in unit tests, where "@/" does not resolve`);
      }
      if (["lib", "components", "config"].includes(layerOf(file)) && ["features", "app"].includes(layerOf(to))) errors.push(`${rel(file)}: ${layerOf(file)}/ must not import ${rel(to)} (it knows no feature)`);
      if (from && layerOf(to) === "app") errors.push(`${rel(file)}: a feature must not import the app layer (${spec})`);
      if (!target || target === from) continue;
      const inTarget = rel(to).slice(`features/${target}/`.length);
      const routeMayUseHandlers = inTarget === "handlers.ts" && /^app\/api\/(?!_lib\/).*\/route\.ts$/.test(rel(file));
      if (!(PUBLIC_ROLE_FILES.has(inTarget) || inTarget.startsWith("components/") || routeMayUseHandlers)) {
        errors.push(`${rel(file)}: another feature may import ${target}'s service/queries/schema/types.ts or its components, not ${rel(to)}`);
      }
      if (from) {
        if (ORDER.indexOf(target) > ORDER.indexOf(from)) errors.push(`${rel(file)}: ${from} must not depend on ${target} (order: ${ORDER.join(" < ")})`);
        (deps.get(from) ?? deps.set(from, new Set()).get(from)!).add(target);
      }
    }
  }

  // Server state that must exist once per process lives in singleton(): Next.js can load a module more than once.
  for (const file of files.filter((f) => f.endsWith(".ts"))) {
    if (/^let\s/m.test(texts.get(file)!)) errors.push(`${rel(file)}: module-level "let": keep per-process state in singleton() (lib/singleton.ts)`);
  }

  // No cycles between features.
  const visiting: string[] = [];
  const done = new Set<string>();
  const visit = (f: string) => {
    if (done.has(f)) return;
    if (visiting.includes(f)) return void errors.push(`feature cycle: ${[...visiting.slice(visiting.indexOf(f)), f].join(" -> ")}`);
    visiting.push(f);
    for (const d of deps.get(f) ?? []) visit(d);
    visiting.pop();
    done.add(f);
  };
  for (const f of deps.keys()) visit(f);

  // Browser code must never reach server code (the database, keys, the event bus), directly or through other files:
  // it would be shipped to every visitor's browser. Type-only imports are erased and therefore fine.
  const isServerOnly = (abs: string) => {
    const r = rel(abs);
    if (r.startsWith("lib/client/") || r.startsWith("components/") || r.startsWith("config/")) return false; // browser-safe foundations
    if (r.startsWith("lib/")) return true;
    const f = featureOf(abs);
    if (!f) return false;
    const inFeature = r.slice(`features/${f}/`.length);
    // what a feature may ship to the browser: its components, its view types, and its schema (pure rules / zod)
    return !(["types.ts", "schema.ts"].includes(inFeature) || inFeature.startsWith("components/"));
  };
  for (const root of files.filter((f) => isClientFile(texts.get(f)!))) {
    const seen = new Set<string>([root]);
    const queue: { file: string; via: string[] }[] = [{ file: root, via: [] }];
    while (queue.length) {
      const { file, via } = queue.shift()!;
      for (const e of graph.get(file) ?? []) {
        if (e.typeOnly) continue;
        if (!path.isAbsolute(e.to)) {
          if (e.to.startsWith("node:")) errors.push(`${rel(root)}: browser code reaches ${e.to} (via ${[...via, rel(file)].join(" -> ")})`);
          continue;
        }
        if (isServerOnly(e.to)) {
          errors.push(`${rel(root)}: browser code imports server module ${rel(e.to)} (via ${[...via, rel(file)].join(" -> ")})`);
          continue;
        }
        if (!seen.has(e.to) && graph.has(e.to)) {
          seen.add(e.to);
          queue.push({ file: e.to, via: [...via, rel(file)] });
        }
      }
    }
  }

  // The compiler, not only this script, keeps server code out of the browser: every server file imports "server-only".
  for (const file of files) {
    if (isServerMarkedFile(rel(file)) && !/^import\s+["']server-only["'];/m.test(texts.get(file)!)) {
      errors.push(`${rel(file)}: server file without \`import "server-only";\` (Next then refuses to bundle it into browser code)`);
    }
  }

  // A feature has only the five role files and components/: new logic goes into service.ts, not a new file.
  for (const file of files) {
    const m = rel(file).match(/^features\/([^/]+)\/([^/]+)$/);
    if (m && !ROLE_FILES.has(m[2])) errors.push(`${rel(file)}: a feature has only handlers/queries/schema/service/types.ts and components/ (put this in ${m[1]}/service.ts)`);
  }

  // API route files stay thin wiring: only a feature's server API and the route wrapper.
  for (const file of files.filter((f) => /^app\/api\/(?!_lib\/).*\/route\.ts$/.test(rel(f)))) {
    for (const { to, spec } of graph.get(file) ?? []) {
      const ok = /^@\/features\/[^/]+\/handlers\.ts$/.test(spec) || /^@\/app\/api\/_lib\/(wrap|views)\.ts$/.test(spec);
      if (!ok) errors.push(`${rel(file)}: a route file may only import a feature's handlers.ts or app/api/_lib (found ${spec})`);
    }
  }

  // Every route file must export its handlers through route()/publicRoute(): that is where CSRF and the login check live,
  // and proxy.ts does not cover /api.
  for (const file of files.filter((f) => /^app\/api\/(?!_lib\/).*\/route\.ts$/.test(rel(f)))) {
    const text = texts.get(file)!;
    for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) {
      errors.push(`${rel(file)}: ${m[1]} is exported as a bare function: wrap the handler in route() or publicRoute()`);
    }
    for (const m of text.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=\s*(\w+)/g)) {
      if (m[2] !== "route" && m[2] !== "publicRoute") errors.push(`${rel(file)}: ${m[1]} must be wrapped in route() or publicRoute() (found ${m[2]})`);
    }
  }

  const summary = `${files.length} files; feature deps: ${[...deps].map(([f, d]) => `${f} -> ${[...d].join(",")}`).join("; ")}`;
  return { errors: [...new Set(errors)], summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { errors, summary } = checkBoundaries(path.resolve("src"));
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`architecture ok (${summary})`);
}
