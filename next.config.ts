import type { NextConfig } from "next";

const config: NextConfig = {
  // The end-to-end tests build into their own folder so they never overwrite a developer's .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // The migrations are read from disk at runtime (lib/db.ts); tell the host's bundler to ship them with every route.
  // Builds only: in `next dev` this setting makes every page load trigger a rebuild and a full reload (the page "blinks").
  ...(process.env.NODE_ENV === "production" ? { outputFileTracingIncludes: { "/*": ["./migrations/**/*"] } } : {}),
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*"], // dev only: opening the dev server by IP (not localhost) otherwise blocks its scripts, and no button works
  reactStrictMode: true,
  agentRules: false, // do not let `next dev` write an AGENTS.md into the repo; CLAUDE.md says where the bundled docs are
  async headers() {
    // The Content-Security-Policy needs a fresh nonce per request, so it is set in src/proxy.ts. These are the fixed ones.
    const fixed = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      ...(process.env.PUBLIC_URL?.startsWith("https://") ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ];
    return [{ source: "/:path*", headers: fixed }];
  },
};

export default config;
