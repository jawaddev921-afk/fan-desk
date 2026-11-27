"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import type { MeView } from "@/features/accounts/types.ts";

// What the last "load chats" found. `at` changes every time, so lists know they should reload.
type LastSync = { chats: number; at: number };
type SyncState = { lastSync: LastSync | null; setLastSync(v: LastSync): void };

const Ctx = createContext<SyncState | null>(null);

export function useSyncState(): SyncState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSyncState must be used inside <SyncStateProvider>");
  return s;
}

export function SyncStateProvider({ children }: { children: ReactNode }) {
  const [lastSync, setLastSync] = useState<LastSync | null>(null);
  const value = useMemo(() => ({ lastSync, setLastSync }), [lastSync]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * "Load chats" / "Sync": start the import of the last 90 days from OFMAPI. Nothing is sent. The work runs in the background (the
 * inbox shows its progress); this only asks for it to start, so `busy` is short.
 */
export function useSync() {
  const { account, call, run, setMe, setFlash } = useSession();
  const { setLastSync } = useSyncState();
  const [busy, setBusy] = useState(false);

  const sync = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      if (!account || busy) return;
      setBusy(true);
      await run(async () => {
        const r = await call<{ me: MeView }>("POST", `/api/accounts/${enc(account.accountId)}/sync`);
        setMe(r.me);
        setLastSync({ chats: 0, at: Date.now() });
        if (!opts.quiet) setFlash({ kind: "ok", text: "Sync started. It runs in the background; the chats arrive here as they are read." });
      });
      setBusy(false);
    },
    [account, busy, call, run, setMe, setFlash, setLastSync],
  );

  return { sync, busy };
}
