// Next.js may load the same module more than once (one copy per route bundle, another for instrumentation).
// Anything that must exist exactly once per server process (database handle, event bus, rate limits) lives
// on globalThis under a name, so every copy of the module sees the same object.
import "server-only";
const g = globalThis as unknown as { __fanDesk?: Map<string, unknown> };

export function singleton<T>(name: string, make: () => T): T {
  const all = (g.__fanDesk ??= new Map<string, unknown>());
  if (!all.has(name)) all.set(name, make());
  return all.get(name) as T;
}
