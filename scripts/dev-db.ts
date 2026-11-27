// A local Postgres for development: PGlite (Postgres compiled to WebAssembly) kept in ./data/pglite and served on a local port.
// Run `npm run db:dev` in one terminal and `npm run dev` in another, with DATABASE_URL from the line it prints (it is in .env.example).
// Production uses a real Postgres (Supabase); this is only so a fresh checkout needs no database install.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.DEV_DB_PORT ?? 54329);
const db = await PGlite.create("./data/pglite");
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 16 });
await server.start();
console.log(`Local Postgres is running.\nDATABASE_URL=postgres://postgres:postgres@127.0.0.1:${port}/postgres\n(Ctrl+C to stop; the data stays in ./data/pglite)`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
