"use client";
import { useCallback, useState } from "react";
import type { MeView } from "../types.ts";
import { useSession } from "./session.tsx";

/** "Refresh accounts": ask OFMAPI again which OnlyFans accounts the key can see. */
export function useRefreshAccounts() {
  const { call, run, setMe, setFlash } = useSession();
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    await run(async () => {
      const r = await call<{ imported: { imported: number; updated: number }; me: MeView }>("POST", "/api/connection/accounts/refresh");
      setMe(r.me);
      setFlash({ kind: "ok", text: `${r.imported.imported} new, ${r.imported.updated} updated.` });
    });
    setBusy(false);
  }, [call, run, setMe, setFlash]);
  return { refresh, busy };
}
