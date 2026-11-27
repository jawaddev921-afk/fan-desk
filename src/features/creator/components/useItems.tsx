"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import type { Item, ItemData, ItemKind } from "../types.ts";

/** The list of one kind of creator item (products, bump messages...) with create, update and delete. `changed` runs after a write (the tab counts). */
export function useItems<K extends ItemKind>(accountId: string, kind: K, changed: () => void) {
  const { call, run } = useSession();
  const [items, setItems] = useState<Item<K>[] | null>(null);
  const base = `/api/accounts/${enc(accountId)}/creator/items`;

  const load = useCallback(() => run(async () => setItems((await call<{ items: Item<K>[] }>("GET", `${base}?kind=${kind}`)).items)), [base, call, kind, run]);
  useEffect(() => { void load(); }, [load]);

  /** Runs a change; true when it worked (an error is already shown to the user), so a form can stay open on failure. */
  const act = async (fn: () => Promise<unknown>) => { let ok = false; await run(async () => { await fn(); await load(); changed(); ok = true; }); return ok; };
  return {
    items,
    reload: load,
    save: (id: number | null, live: boolean, data: ItemData[K]) => act(() => call(id === null ? "POST" : "PUT", id === null ? base : `${base}/${id}`, { kind, live, data })),
    remove: (id: number) => act(() => call("DELETE", `${base}/${id}`)),
  };
}
