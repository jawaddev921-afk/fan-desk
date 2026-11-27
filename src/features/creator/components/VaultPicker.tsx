"use client";
import { useEffect, useMemo, useState } from "react";
import { ImageIcon, ShieldIcon, VideoIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import type { ItemData, VaultFolder } from "../types.ts";

type Media = ItemData["product"]["media"][number];
type VaultItem = { id: string; type: string; duration: number | null; createdAt: string | null };
type Page = { items: VaultItem[]; cursor: string | null; hasMore: boolean };
type TypeFilter = "all" | "photo" | "video" | "audio";

const isVideo = (type: string) => type === "video" || type === "gif";
export const mediaCounts = (media: Media[]) => ({ videos: media.filter((m) => isVideo(m.type)).length, photos: media.filter((m) => !isVideo(m.type) && m.type !== "audio").length });
const length = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Earlier");
const FILTERS: { id: TypeFilter; label: string }[] = [{ id: "all", label: "All" }, { id: "photo", label: "Photos" }, { id: "video", label: "Videos" }, { id: "audio", label: "Audio" }];

/** "Select Media": the creator's Vault read through our server, with folders, type filters and Free / Paid zones (drag a tile, or click it for Paid). */
function Thumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? <span className="thumb-missing" title="Preview not available"><ImageIcon /></span> : <img src={src} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />;
}

export function VaultPicker({ accountId, selected, price, onDone, onClose }: { accountId: string; selected: Media[]; price?: number; onDone: (m: Media[]) => void; onClose: () => void }) {
  const { call, run } = useSession();
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [folder, setFolder] = useState("");
  const [items, setItems] = useState<VaultItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Map<string, Media>>(new Map(selected.map((m) => [m.id, m])));
  const base = `/api/accounts/${enc(accountId)}/creator`;

  const load = (from: string | null, inFolder: string, replace: boolean, type: TypeFilter = filter, text: string = query) => run(async () => {
    const q = [from ? `cursor=${enc(from)}` : "", inFolder ? `folder=${enc(inFolder)}` : "", type !== "all" ? `type=${type}` : "", text.trim() ? `query=${enc(text.trim())}` : ""].filter(Boolean).join("&");
    const p = await call<Page>("GET", `${base}/vault${q ? `?${q}` : ""}`);
    setItems((cur) => (replace ? p.items : [...cur, ...p.items]));
    setCursor(p.cursor);
    setMore(p.hasMore && !!p.cursor);
    setLoaded(true);
  });
  useEffect(() => { void run(async () => setFolders((await call<{ folders: VaultFolder[] }>("GET", `${base}/vault-folders`)).folders)); }, [base, call, run]);
  useEffect(() => {
    setLoaded(false);
    const t = setTimeout(() => void load(null, folder, true, filter, query), query ? 400 : 0); // a short pause while typing in the search box
    return () => clearTimeout(t);
  }, [folder, filter, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (it: { id: string; type: string }, free: boolean) => setPicked((cur) => new Map(cur).set(it.id, { id: it.id, type: it.type, free }));
  const toggle = (it: VaultItem) => setPicked((cur) => {
    const next = new Map(cur);
    if (next.has(it.id)) next.delete(it.id);
    else next.set(it.id, { id: it.id, type: it.type, free: false });
    return next;
  });
  const drop = (free: boolean) => (e: React.DragEvent) => {
    e.preventDefault();
    const it = items.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    if (it) set(it, free);
  };

  const shown = items;
  const groups = useMemo(() => {
    const g: { day: string; items: VaultItem[] }[] = [];
    for (const it of shown) {
      const d = day(it.createdAt);
      if (g.at(-1)?.day === d) g.at(-1)!.items.push(it);
      else g.push({ day: d, items: [it] });
    }
    return g;
  }, [shown]);
  const free = [...picked.values()].filter((m) => m.free);
  const paid = [...picked.values()].filter((m) => !m.free);
  const thumb = (m: Media) => <button type="button" key={m.id} className="zone-thumb" aria-label={`Remove ${m.type} ${m.id}`} onClick={() => setPicked((c) => { const n = new Map(c); n.delete(m.id); return n; })}><Thumb src={`${base}/vault-thumb?id=${enc(m.id)}`} /></button>;

  return (
    <Modal size="lg" title="Select media" onClose={onClose} extra={<span className="vault-meta"><span className="muted"><ShieldIcon /> Content protection</span></span>} footer={<><span className="muted grow">Enter to continue</span><button type="button" className="primary" onClick={() => { onDone([...picked.values()]); onClose(); }}>Continue</button></>}>
      <div className="vault">
        <aside className="vault-folders" aria-label="Folders">
          <button type="button" aria-current={folder === "" ? "true" : undefined} onClick={() => setFolder("")}><span className="grow">All media</span></button>
          {folders.map((f) => (
            <button type="button" key={f.id} aria-current={folder === f.id ? "true" : undefined} onClick={() => setFolder(f.id)}>
              <span className="grow">{f.name}</span>
              <span className="muted">{f.photos > 0 && <><ImageIcon /> {f.photos} </>}{f.videos > 0 && <><VideoIcon /> {f.videos}</>}</span>
            </button>
          ))}
        </aside>
        <div className="vault-main">
          <div className="row">
            <input className="grow" aria-label="Search media" placeholder="Describe it, e.g. 'red dress by the pool'" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="segmented" role="radiogroup" aria-label="Type">{FILTERS.map((f) => <button type="button" role="radio" key={f.id} aria-checked={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
          </div>
          <div className="vault-bar">
            <b>{picked.size ? `${picked.size} media selected` : "No media selected"}</b>
            {price !== undefined && <span className="price-chip">$ {price}</span>}
          </div>
          <div className="zones">
            <div className="zone" onDragOver={(e) => e.preventDefault()} onDrop={drop(true)}><b>Free ({free.length})</b>{free.length ? <div className="zone-items">{free.map(thumb)}</div> : <span className="muted">Drag media here to send it for free</span>}</div>
            <div className="zone" onDragOver={(e) => e.preventDefault()} onDrop={drop(false)}><b>Paid ({paid.length})</b>{paid.length ? <div className="zone-items">{paid.map(thumb)}</div> : <span className="muted">Drag media here to require payment for it</span>}</div>
          </div>
          {loaded && shown.length === 0 && <div className="empty">No media here.</div>}
          {groups.map((g) => (
            <section key={g.day}>
              <h4 className="field-heading">{g.day}</h4>
              <div className="vault-grid">
                {g.items.map((it) => (
                  <button type="button" key={it.id} draggable className="vault-tile" aria-pressed={picked.has(it.id)} aria-label={`${isVideo(it.type) ? "Video" : "Photo"} ${it.id}`} onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)} onClick={() => toggle(it)}>
                    <Thumb src={`${base}/vault-thumb?id=${enc(it.id)}`} />
                    {isVideo(it.type) && <span className="vault-badge"><VideoIcon /> {length(it.duration)}</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {more && <button type="button" onClick={() => void load(cursor, folder, false)}>Load more</button>}
        </div>
      </div>
    </Modal>
  );
}
