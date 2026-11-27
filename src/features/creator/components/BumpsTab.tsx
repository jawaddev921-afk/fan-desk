"use client";
import { Loading } from "@/components/common/Loading.tsx";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useMemo, useState } from "react";
import { Pager, usePaging } from "@/components/common/Pager.tsx";
import { Select } from "@/components/common/Select.tsx";
import { BUMP_TRIGGERS } from "../schema.ts";
import type { ItemData } from "../types.ts";
import { blankBump, BumpModal, withDefaults } from "./BumpModal.tsx";
import { ImportBumpModal } from "./ImportModals.tsx";
import { useItems } from "./useItems.tsx";
import { mediaCounts } from "./VaultPicker.tsx";

type Bump = ItemData["bump"];
const TRIGGERS = BUMP_TRIGGERS.map((t) => ({ value: t, label: t }));

export function BumpsTab({ accountId, changed }: { accountId: string; changed: () => void }) {
  const { confirm } = useDialogs();
  const { items, save, remove } = useItems(accountId, "bump", changed);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ id: number | null; live: boolean; data: Bump } | null>(null);
  const [importing, setImporting] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).map((b, i) => ({ ...b, n: i + 1 })).filter((b) => !q || b.data.message.toLowerCase().includes(q));
  }, [items, search]);
  const { slice: rows, setPage, pager } = usePaging(shown);
  if (!items) return <Loading />;

  return (
    <div className="tab-body">
      <div className="tab-head">
        <h3>Bump messages</h3>
        <div className="row"><input aria-label="Search messages" placeholder="Search messages" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /><button onClick={() => setImporting(true)}>Import</button><button className="primary" onClick={() => setModal({ id: null, live: true, data: blankBump() })}>New message</button></div>
      </div>
      <div className="note">Bump messages are saved here. Sending them to fans on a trigger is not switched on yet.</div>
      {rows.length === 0 ? <div className="empty">{items.length ? "No message matches." : "No bump messages yet."}</div> : (
        <table className="data-table">
          <thead><tr><th>#</th><th>Message</th><th>Reply rate</th><th>Price</th><th>Media</th><th>Trigger event</th><th>Live</th><th></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.n}</td>
                <td>{b.data.message}</td>
                <td>–</td>
                <td>{b.data.price > 0 ? `$${b.data.price}` : "–"}</td>
                <td>{b.data.media?.length ? <span className="media-count">{mediaCounts(b.data.media).photos > 0 && <span>{mediaCounts(b.data.media).photos} photos</span>}{mediaCounts(b.data.media).videos > 0 && <span>{mediaCounts(b.data.media).videos} videos</span>}</span> : "–"}</td>
                <td><Select ariaLabel="Trigger event" value={b.data.trigger} onChange={(trigger) => void save(b.id, b.live, withDefaults({ ...b.data, trigger }))} options={TRIGGERS} /></td>
                <td><input type="checkbox" aria-label="Live" checked={b.live} onChange={(e) => void save(b.id, e.target.checked, withDefaults(b.data))} /></td>
                <td className="row-actions">
                  <button onClick={() => setModal({ id: b.id, live: b.live, data: withDefaults(b.data) })}>Edit</button>
                  <button className="danger" onClick={() => void confirm("Delete this message?").then((ok) => void (ok && remove(b.id)))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager {...pager} />
      {modal && <BumpModal accountId={accountId} initial={modal} changed={changed} onSave={save} onClose={() => setModal(null)} />}
      {importing && <ImportBumpModal accountId={accountId} onClose={() => setImporting(false)} onImport={async (b, edit) => { if (edit) setModal({ id: null, live: true, data: { ...blankBump(), ...b } }); else await save(null, true, { ...blankBump(), ...b }); setImporting(false); }} />}
    </div>
  );
}
