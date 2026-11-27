import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "Fan Desk" };
export const viewport: Viewport = { colorScheme: "dark", themeColor: "#12151c" };
// The Content-Security-Policy nonce (src/proxy.ts) only works on pages rendered per request.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
