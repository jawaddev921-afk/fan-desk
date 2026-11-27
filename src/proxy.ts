import { NextResponse, type NextRequest } from "next/server";

// Runs before every page (not the API, not static files): sends logged-out visitors to /login, logged-in ones away
// from it, and sets a Content-Security-Policy with a fresh nonce so React's own inline scripts are allowed and nothing else.
const AUTH_PAGES = ["/login", "/signup", "/verify"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("sid"); // presence only: the API decides if the session is still valid
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const isPublic = pathname.startsWith("/request/"); // the creator opens her bio link without an account
  if (!hasSession && !isAuthPage && !isPublic) return NextResponse.redirect(new URL("/login", request.url));
  // `?expired` means the dashboard found the cookie dead: let the login page show, or the two redirects would loop
  if (hasSession && isAuthPage && !request.nextUrl.searchParams.has("expired")) return NextResponse.redirect(new URL("/inbox", request.url));

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`, // dev only: Next's devtools overlay uses inline styles
    "connect-src 'self'",
    "img-src 'self' data:", // fan photos and message media are passed on by our own routes
    "media-src 'self'", // photos, videos and audio of messages are streamed through our own media route
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|fonts|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
