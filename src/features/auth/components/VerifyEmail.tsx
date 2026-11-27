"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api.ts";

/** The page behind the emailed link: creates the account and goes to the connection page, or says why it could not. */
export function VerifyEmail({ token }: { token: string }) {
  const router = useRouter();
  const started = useRef(false); // the link works once, so it must be used once (React runs effects twice in development)
  const [error, setError] = useState<string | null>(token ? null : "This link is incomplete. Open the link from the email again.");

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api("POST", "/api/auth/verify", { token }).then(
      () => router.replace("/connection?welcome=1"),
      (err) => setError(err instanceof Error ? err.message : "Something went wrong."),
    );
  }, [token, router]);

  return (
    <div className="auth-card" role="status">
      {error ? (
        <>
          <h2>We could not confirm this email</h2>
          <p className="err">{error}</p>
          <p className="muted"><Link href="/signup">Sign up again</Link> or <Link href="/login">log in</Link>.</p>
        </>
      ) : (
        <>
          <h2>Confirming your email…</h2>
          <p className="muted">One moment. We are creating your account.</p>
        </>
      )}
    </div>
  );
}
