"use client";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "./api.ts";

type Flash = { kind: "ok" | "err"; text: string } | null;

// What every page needs, whatever the feature: a way to call the API that sends the user to the login page when the
// session has ended, a way to run an action whose error becomes a message, and that message.
type Client = {
  call<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
  /** Runs an action; any error becomes the flash message (a 401 is already handled by `call`). */
  run(fn: () => Promise<void>): Promise<void>;
  flash: Flash;
  setFlash(f: Flash): void;
};

const Ctx = createContext<Client | null>(null);

export function useClient(): Client {
  const c = useContext(Ctx);
  if (!c) throw new Error("useClient must be used inside <ClientProvider>");
  return c;
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [flash, setFlash] = useState<Flash>(null);

  // Ending the session also clears the cookie, otherwise the login page would send a logged-out user straight back.
  const expire = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", headers: { "X-Requested-With": "fan-desk" } }).catch(() => {});
    router.replace("/login?expired=1");
  }, [router]);

  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      try {
        return await api<T>(method, path, body);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          err.handled = true;
          void expire();
        }
        throw err;
      }
    },
    [expire],
  );

  // Show a message for a few seconds, then let it go.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 8000);
    return () => clearTimeout(t);
  }, [flash]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.handled) return;
      setFlash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const value = useMemo<Client>(() => ({ call, run, flash, setFlash }), [call, run, flash]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
