"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useClient } from "@/lib/client/client.tsx";
import type { AccountView, MeView } from "../types.ts";

// Who is logged in, and which of their creator accounts is selected. Every page below the dashboard layout reads this.
type Session = {
  me: MeView | null;
  loading: boolean;
  setMe(me: MeView): void;
  refreshMe(): Promise<void>;
  account: AccountView | null;
  setAccountId(id: string): void;
};

const Ctx = createContext<Session | null>(null);

/** The session plus the generic client (call, run, flash), so a component needs only one hook. */
export function useSession() {
  const s = useContext(Ctx);
  const client = useClient();
  if (!s) throw new Error("useSession must be used inside <SessionProvider>");
  return { ...client, ...s };
}

/** `initialMe` is read on the server (see app/(dashboard)/layout.tsx), so the first paint already has the user. */
export function SessionProvider({ children, initialMe = null }: { children: ReactNode; initialMe?: MeView | null }) {
  const { call } = useClient();
  const [me, setMe] = useState<MeView | null>(initialMe);
  const [loading, setLoading] = useState(initialMe === null);
  const [accountId, setAccountId] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    setMe(await call<MeView>("GET", "/api/me"));
  }, [call]);

  useEffect(() => {
    if (initialMe) return;
    refreshMe().catch(() => {}).finally(() => setLoading(false));
  }, [initialMe, refreshMe]);

  const account = useMemo(() => me?.accounts.find((a) => a.accountId === accountId) ?? me?.accounts[0] ?? null, [me, accountId]);
  const value = useMemo<Session>(() => ({ me, loading, setMe, refreshMe, account, setAccountId }), [me, loading, refreshMe, account]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
