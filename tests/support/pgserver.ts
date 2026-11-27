// An in-process Postgres (PGlite) on a local port, so tests run the real `pg` driver and the real migrations without a server install.
import net from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });

export async function startTestDb(): Promise<{ url: string; stop(): Promise<void> }> {
  const db = await PGlite.create();
  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 4 });
  await server.start();
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}

/** Closes the app's own pool (src/lib/db.ts keeps it on globalThis) so the test process can exit. */
export async function closeAppPool(): Promise<void> {
  const all = (globalThis as unknown as { __fanDesk?: Map<string, { end?: () => Promise<void>; ready?: unknown }> }).__fanDesk;
  await all?.get("pg-pool")?.end?.();
  all?.delete("pg-pool");
  const state = all?.get("db-state");
  if (state) state.ready = null; // the next query connects and migrates again, like a fresh process
}
