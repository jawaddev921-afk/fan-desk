import type { ReactNode } from "react";
import { AuthAside } from "@/features/auth/components/AuthAside.tsx";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <AuthAside />
      <section className="auth-main">{children}</section>
    </main>
  );
}
