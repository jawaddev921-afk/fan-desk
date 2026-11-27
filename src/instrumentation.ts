// Next.js calls register() once when the server starts. The Node-only background work is imported behind the runtime check.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node.ts");
}
