"use client";
import { Loading } from "@/components/common/Loading.tsx";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useEffect, useState } from "react";
import { CheckIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import type { OfList } from "../types.ts";
import { useItems } from "./useItems.tsx";

export function ImportFromOnlyFans({ accountId, onImport, onClose }: { accountId: string; onImport: (name: string, list: OfList) => Promise<void>; onClose: () => void }) {
  const { call, run } = useSession();
  const [lists, setLists] = useState<OfList[] | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<OfList | null>(null);
  const [name, setName] = useState("");
  useEffect(() => { void run(async () => setLists((await call<{ lists: OfList[] }>("GET", `/api/accounts/${enc(accountId)}/creator/of-lists`)).lists)); }, [accountId, call, run]);
  const shown = (lists ?? []).filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <Modal title="Import from OnlyFans" onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!picked || !name.trim()} onClick={() => picked && void onImport(name.trim(), picked).then(onClose)}>Import list</button></>}>
      <p className="muted">Copy one of your OnlyFans lists into a fan list. The members are copied in the background (the first 2000). This is a point-in-time snapshot and won&apos;t keep syncing on its own.</p>
      <label htmlFor="ofl-search">Search lists</label>
      <input id="ofl-search" placeholder="Search lists by name" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="of-lists" role="radiogroup" aria-label="OnlyFans lists">
        {lists === null && <Loading />}
        {lists?.length === 0 && <div className="empty">No lists found.</div>}
        {shown.map((l) => (
          <button type="button" role="radio" aria-checked={picked?.id === l.id} key={l.id} className="of-list" onClick={() => { setPicked(l); setName(l.name); }}>
            <span className="of-check">{picked?.id === l.id && <CheckIcon />}</span>
            <span className="grow">{l.name}</span>
            <span className="muted">{l.usersCount} fans</span>
          </button>
        ))}
      </div>
      <label htmlFor="ofl-name">List name</label>
      <input id="ofl-name" placeholder="e.g. VIP fans" value={name} onChange={(e) => setName(e.target.value)} />
    </Modal>
  );
}

/** Fan lists with a pick of which ones apply: "Create new list" (a name) and "Import from OnlyFans...". */
export function FanLists({ accountId, value, onChange, changed }: { accountId: string; value: number[]; onChange: (ids: number[]) => void; changed: () => void }) {
  const { confirm } = useDialogs();
  const { items, save, remove, reload } = useItems(accountId, "fanlist", changed);
  const { call, run } = useSession();
  const copying = items?.some((l) => l.data.done === false);
  useEffect(() => {
    if (!copying) return;
    const t = setInterval(() => void reload(), 5000); // the worker is filling a list
    return () => clearInterval(t);
  }, [copying, reload]);
  const [name, setName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  if (!items) return <Loading />;
  return (
    <div className="fan-lists">
      {items.length === 0 ? (
        <div className="lists-empty">No lists yet. Create a fan list to target specific groups - like VIPs, non-spenders, or time-wasters.</div>
      ) : (
        <div className="choices">
          {items.map((l) => (
            <span className="list-chip" key={l.id}>
              <button type="button" className="choice" aria-pressed={value.includes(l.id)} onClick={() => onChange(value.includes(l.id) ? value.filter((x) => x !== l.id) : [...value, l.id])}>{l.data.name}{l.data.ofId ? <span className="muted"> · {l.data.count ?? 0}{l.data.done === false ? ` of ${l.data.total ?? "?"}, copying...` : l.data.capped ? " (first 2000)" : ""}</span> : <span className="muted"> · no fans yet</span>}</button>
              <button type="button" className="ghost" aria-label={`Delete list ${l.data.name}`} onClick={() => void confirm(`Delete the list "${l.data.name}"?`).then((ok) => void (ok && remove(l.id).then(() => onChange(value.filter((x) => x !== l.id)))))}>✕</button>
            </span>
          ))}
        </div>
      )}
      {name !== null ? (
        <div className="row">
          <input className="grow" autoFocus aria-label="List name" placeholder="e.g. VIP fans" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="primary" disabled={!name.trim()} onClick={() => void save(null, true, { name: name.trim(), ofId: null, count: null }).then(() => setName(null))}>Create</button>
          <button type="button" onClick={() => setName(null)}>Cancel</button>
        </div>
      ) : (
        <div className="list-actions">
          <button type="button" onClick={() => setName("")}>+ Create new list</button>
          <button type="button" onClick={() => setImporting(true)}>Import from OnlyFans...</button>
        </div>
      )}
      {importing && <ImportFromOnlyFans accountId={accountId} onClose={() => setImporting(false)} onImport={(n, l) => run(async () => { await call("POST", `/api/accounts/${enc(accountId)}/creator/lists/import`, { name: n, ofId: l.id }); await reload(); changed(); })} />}
    </div>
  );
}
