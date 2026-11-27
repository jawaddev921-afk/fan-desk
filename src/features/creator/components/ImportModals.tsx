"use client";
import { Loading } from "@/components/common/Loading.tsx";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChatIcon, ClockIcon, FolderIcon, MegaphoneIcon, TrophyIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { Pager, usePaging } from "@/components/common/Pager.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import type { LibraryView } from "@/features/library/types.ts";
import { enc } from "@/lib/client/api.ts";
import { BUMP_TEMPLATES } from "../schema.ts";
import type { ItemData, SentPpv, VaultFolder } from "../types.ts";
import { mediaCounts } from "./VaultPicker.tsx";

type Media = ItemData["product"]["media"][number];
export type ImportedProduct = { name: string; price: number; description: string; media: Media[] };
export type ImportedBump = { message: string; price: number; trigger: string; media: Media[] };
export type ProductTab = "best" | "recent" | "mass" | "vault" | "library";
export type BumpTab = "templates" | "best" | "mass" | "library";

const money = (n: number) => (n > 0 ? `$${Number.isInteger(n) ? n : n.toFixed(2)}` : "–");
const date = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);
const MediaCell = ({ media }: { media: Media[] }) => { const c = mediaCounts(media); return media.length ? <span className="media-count">{c.photos > 0 && <span>{c.photos} photos</span>}{c.videos > 0 && <span>{c.videos} videos</span>}</span> : <span className="muted">–</span>; };

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return <div className="modal-tabs" role="tablist">{tabs.map((t) => <button type="button" role="tab" key={t.id} aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.icon}{t.label}</button>)}</div>;
}

/** One table of rows with a search box, paging and an Import & Edit / Import pair on each row. */
function RowTable<R>({ rows, head, cells, empty, search, onImport, onEdit, loading }: { rows: R[] | null; head: ReactNode; cells: (r: R, i: number) => ReactNode; empty: string; search: (r: R) => string; onImport: (r: R) => void; onEdit?: (r: R) => void; loading?: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => (rows ?? []).filter((r) => !q.trim() || search(r).toLowerCase().includes(q.trim().toLowerCase())), [rows, q, search]);
  const { slice, setPage, pager } = usePaging(shown);
  return (
    <>
      <input aria-label="Search" placeholder="Search messages..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {rows === null || loading ? <Loading /> : shown.length === 0 ? <div className="empty">{empty}</div> : (
        <table className="data-table">
          <thead><tr>{head}<th></th></tr></thead>
          <tbody>{slice.map((r, i) => <tr key={i}>{cells(r, i)}<td className="row-actions">{onEdit && <button type="button" onClick={() => onEdit(r)}>Import &amp; Edit</button>}<button type="button" className="primary" onClick={() => onImport(r)}>Import</button></td></tr>)}</tbody>
        </table>
      )}
      <Pager {...pager} />
    </>
  );
}

/** "Best selling PPVs" / "Mass messages": what we sent to several fans, ranked by how many fans got it. */
function WidelySent({ accountId, kind, onImport, onEdit }: { accountId: string; kind: "best" | "mass"; onImport: (p: SentPpv) => void; onEdit?: (p: SentPpv) => void }) {
  const { call, run } = useSession();
  const [rows, setRows] = useState<SentPpv[] | null>(null);
  useEffect(() => { void run(async () => setRows((await call<{ ppvs: SentPpv[] }>("GET", `/api/accounts/${enc(accountId)}/creator/ppvs?kind=${kind}`)).ppvs)); }, [accountId, kind, call, run]);
  return (
    <RowTable rows={rows} head={<><th>Message</th><th>Price</th><th>Media</th><th>Fans reached</th></>} search={(p) => p.text}
      empty={kind === "best" ? "No PPV has been sent to 3 or more fans yet." : "No message has been sent to 3 or more fans yet."}
      cells={(p) => <><td>{clip(p.text)}</td><td>{money(p.price)}</td><td><MediaCell media={p.media} /></td><td>{p.fans ?? 0}</td></>} onImport={onImport} onEdit={onEdit} />
  );
}

const PRODUCT_TABS: { id: ProductTab; label: string; icon: ReactNode }[] = [
  { id: "best", label: "Best selling PPVs", icon: <TrophyIcon /> },
  { id: "recent", label: "Recently sent PPVs", icon: <ClockIcon /> },
  { id: "mass", label: "Mass messages", icon: <MegaphoneIcon /> },
  { id: "vault", label: "Vault folders", icon: <FolderIcon /> },
  { id: "library", label: "My message library", icon: <ChatIcon /> },
];

/** "Import Product from ...": best sellers / mass messages are ranked by how many fans got them (sales are not linked to one message). */
export function ImportProductModal({ accountId, start, onImport, onClose }: { accountId: string; start: ProductTab; onImport: (p: ImportedProduct, edit: boolean) => void | Promise<void>; onClose: () => void }) {
  const { call, run } = useSession();
  const [tab, setTab] = useState<ProductTab>(start);
  const [ppvs, setPpvs] = useState<SentPpv[] | null>(null);
  const [folders, setFolders] = useState<VaultFolder[] | null>(null);
  const [lib, setLib] = useState<LibraryView | null>(null);
  const base = `/api/accounts/${enc(accountId)}/creator`;
  useEffect(() => {
    if (tab === "recent" && !ppvs) void run(async () => setPpvs((await call<{ ppvs: SentPpv[] }>("GET", `${base}/ppvs`)).ppvs));
    if (tab === "vault" && !folders) void run(async () => setFolders((await call<{ folders: VaultFolder[] }>("GET", `${base}/vault-folders`)).folders));
    if (tab === "library" && !lib) void run(async () => setLib(await call<LibraryView>("GET", "/api/library")));
  }, [tab, ppvs, folders, lib, base, call, run]);

  const fromText = (text: string, price: number, media: Media[]): ImportedProduct => ({ name: text.replace(/\s+/g, " ").slice(0, 40) || "Product", price, description: text.slice(0, 1000), media });
  const folderImport = async (f: VaultFolder, edit: boolean) => {
    const media: Media[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) { // up to 200 items of the folder
      const p: { items: { id: string; type: string }[]; cursor: string | null; hasMore: boolean } = await call("GET", `${base}/vault?folder=${enc(f.id)}${cursor ? `&cursor=${enc(cursor)}` : ""}`);
      media.push(...p.items.map((m) => ({ id: m.id, type: m.type })));
      if (!p.hasMore || !p.cursor) break;
      cursor = p.cursor;
    }
    await onImport({ name: f.name, price: 0, description: "", media }, edit);
  };
  const folderName = (id: number | null) => lib?.folders.find((f) => f.id === id)?.name ?? "–";

  return (
    <Modal size="lg" title="Import product from ..." onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" onClick={onClose}>Continue</button></>}>
      <Tabs tabs={PRODUCT_TABS} value={tab} onChange={setTab} />
      {(tab === "best" || tab === "mass") && <WidelySent key={tab} accountId={accountId} kind={tab} onImport={(p) => void onImport(fromText(p.text, p.price, p.media), false)} onEdit={(p) => void onImport(fromText(p.text, p.price, p.media), true)} />}
      {tab === "recent" && <RowTable rows={ppvs} head={<><th>Message</th><th>Price</th><th>Media</th><th>Sent</th></>} empty="No priced messages have been sent from this account yet." search={(p) => p.text}
        cells={(p) => <><td>{clip(p.text)}</td><td>{money(p.price)}</td><td><MediaCell media={p.media} /></td><td>{date(p.sentAt)}</td></>} onImport={(p) => void onImport(fromText(p.text, p.price, p.media), false)} onEdit={(p) => void onImport(fromText(p.text, p.price, p.media), true)} />}
      {tab === "vault" && <RowTable rows={folders} head={<><th>Name</th><th>Media</th></>} empty="The Vault has no folders with media." search={(f) => f.name}
        cells={(f) => <><td>{f.name}</td><td><span className="media-count">{f.photos > 0 && <span>{f.photos} photos</span>}{f.videos > 0 && <span>{f.videos} videos</span>}{f.audios > 0 && <span>{f.audios} audio</span>}</span></td></>} onImport={(f) => void run(() => folderImport(f, false))} />}
      {tab === "library" && <RowTable rows={lib ? lib.messages : null} head={<><th>#</th><th>Message</th><th>Media</th><th>Price</th><th>Folder</th><th>Added</th></>} empty="The message library is empty." search={(m) => `${m.title} ${m.text}`}
        cells={(m, i) => <><td>{i + 1}</td><td>{clip(m.text || m.title)}</td><td><span className="muted">–</span></td><td>{money(m.price)}</td><td>{folderName(m.folderId)}</td><td>{date(m.createdAt)}</td></>} onImport={(m) => void onImport(fromText(m.text || m.title, m.price, []), false)} onEdit={(m) => void onImport(fromText(m.text || m.title, m.price, []), true)} />}
    </Modal>
  );
}

const BUMP_TABS: { id: BumpTab; label: string; icon: ReactNode }[] = [
  { id: "templates", label: "Templates", icon: <ChatIcon /> },
  { id: "best", label: "Best selling PPVs", icon: <TrophyIcon /> },
  { id: "mass", label: "Mass messages", icon: <MegaphoneIcon /> },
  { id: "library", label: "My message library", icon: <ChatIcon /> },
];

/** "Import Bump Message from ...": a few ready templates, and the message library. */
export function ImportBumpModal({ accountId, onImport, onClose }: { accountId: string; onImport: (b: ImportedBump, edit: boolean) => void | Promise<void>; onClose: () => void }) {
  const { call, run } = useSession();
  const [tab, setTab] = useState<BumpTab>("templates");
  const [lib, setLib] = useState<LibraryView | null>(null);
  useEffect(() => { if (tab === "library" && !lib) void run(async () => setLib(await call<LibraryView>("GET", "/api/library"))); }, [tab, lib, call, run]);
  const bump = (message: string, price = 0): ImportedBump => ({ message, price, trigger: "Online", media: [] });
  return (
    <Modal size="lg" title="Import bump message from ..." onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" onClick={onClose}>Continue</button></>}>
      <Tabs tabs={BUMP_TABS} value={tab} onChange={setTab} />
      {tab === "templates" && <RowTable rows={[...BUMP_TEMPLATES]} head={<><th>Template</th><th>Types</th></>} empty="No templates." search={(t) => t}
        cells={(t) => <><td>{t}</td><td><span className="chip">Online</span></td></>} onImport={(t) => void onImport(bump(t), false)} onEdit={(t) => void onImport(bump(t), true)} />}
      {(tab === "best" || tab === "mass") && <WidelySent key={tab} accountId={accountId} kind={tab} onImport={(p) => void onImport(bump(p.text, p.price), false)} onEdit={(p) => void onImport(bump(p.text, p.price), true)} />}
      {tab === "library" && <RowTable rows={lib ? lib.messages : null} head={<><th>#</th><th>Message</th><th>Media</th><th>Price</th><th>Folder</th><th>Added</th></>} empty="The message library is empty." search={(m) => `${m.title} ${m.text}`}
        cells={(m, i) => <><td>{i + 1}</td><td>{clip(m.text || m.title)}</td><td><span className="muted">–</span></td><td>{money(m.price)}</td><td>{lib?.folders.find((f) => f.id === m.folderId)?.name ?? "–"}</td><td>{date(m.createdAt)}</td></>} onImport={(m) => void onImport(bump(m.text || m.title, m.price), false)} onEdit={(m) => void onImport(bump(m.text || m.title, m.price), true)} />}
    </Modal>
  );
}
