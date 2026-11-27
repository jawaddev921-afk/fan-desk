"use client";
import { Loading } from "@/components/common/Loading.tsx";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDownIcon, ImageIcon, VideoIcon } from "@/components/common/icons.tsx";
import { Pager, usePaging } from "@/components/common/Pager.tsx";
import { Select } from "@/components/common/Select.tsx";
import { parseRows } from "@/features/library/schema.ts";
import type { ItemData } from "../types.ts";
import { useItems } from "./useItems.tsx";
import { ImportProductModal, type ProductTab } from "./ImportModals.tsx";
import { blankProduct, ProductModal } from "./ProductModal.tsx";
import { mediaCounts } from "./VaultPicker.tsx";

type Product = ItemData["product"];
const PROGRESSION = [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }));
const RANGES = [{ value: "1", label: "Last 24 hours" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "custom", label: "Custom date" }];
const LIVE_FILTER = [{ value: "", label: "All" }, { value: "on", label: "Live" }, { value: "off", label: "Off" }];
type SortKey = "name" | "price" | "media" | "progression" | "live";
const gmt = () => { const m = -new Date().getTimezoneOffset(); return `GMT${m >= 0 ? "+" : "-"}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? `:${String(Math.abs(m) % 60).padStart(2, "0")}` : ""}`; };
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

function MediaCount({ media }: { media: Product["media"] }) {
  const { photos, videos } = mediaCounts(media);
  if (!media.length) return <span className="muted">–</span>;
  return <span className="media-count">{photos > 0 && <span><ImageIcon /> {photos}</span>}{videos > 0 && <span><VideoIcon /> {videos}</span>}</span>;
}

function ReportDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [range, setRange] = useState("7");
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="report" aria-label={`${name} report`} onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="tab-head"><h3>{name}</h3><div className="row"><Select ariaLabel="Date range" value={range} onChange={setRange} options={RANGES} /><button type="button" className="ghost" aria-label="Close" onClick={() => ref.current?.close()}>✕</button></div></div>
      <div className="stat-tiles">{["Total sales", "Total uplifts", "Sent", "Purchased", "Conversion rate"].map((l) => <div className="card tile" key={l}><span className="muted">{l}</span><b>–</b></div>)}</div>
      <div className="empty">No sales data for this period yet. Purchases are not tracked until the sales connection is switched on.</div>
    </dialog>
  );
}

export function ProductsTab({ accountId, accountName, changed }: { accountId: string; accountName: string; changed: () => void }) {
  const { confirm } = useDialogs();
  const { items, save, remove } = useItems(accountId, "product", changed);
  const [sub, setSub] = useState<"list" | "analytics">("list");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [liveFilter, setLiveFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [range, setRange] = useState("7");
  const [report, setReport] = useState<string | null>(null);
  const [modal, setModal] = useState<{ id: number | null; live: boolean; data: Product } | null>(null);
  const [importFrom, setImportFrom] = useState<ProductTab | null>(null);
  const [pasted, setPasted] = useState<string | null>(null);

  const tagOptions = useMemo(() => [{ value: "", label: "All tags" }, ...[...new Set((items ?? []).flatMap((p) => p.data.tags))].sort().map((t) => ({ value: t, label: t }))], [items]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (items ?? []).filter((p) =>
      (!q || p.data.name.toLowerCase().includes(q) || p.data.description.toLowerCase().includes(q) || p.data.tags.some((t) => t.toLowerCase().includes(q))) &&
      (!liveFilter || p.live === (liveFilter === "on")) &&
      (!tagFilter || p.data.tags.includes(tagFilter)),
    );
    if (!sort) return rows;
    const val = (p: (typeof rows)[number]) => (sort.key === "name" ? p.data.name.toLowerCase() : sort.key === "price" ? p.data.price : sort.key === "media" ? p.data.media.length : sort.key === "progression" ? p.data.progression : Number(p.live));
    return [...rows].sort((x, y) => (val(x) < val(y) ? -sort.dir : val(x) > val(y) ? sort.dir : 0));
  }, [items, search, liveFilter, tagFilter, sort]);
  const { slice: rows, setPage, pager } = usePaging(shown);
  if (!items) return <Loading />;

  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort?.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="th-sort" onClick={() => { setSort(sort?.key === key ? (sort.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }); setPage(1); }}>{label}<span className={sort?.key === key ? (sort.dir === 1 ? "on up" : "on") : ""}><ChevronDownIcon /></span></button>
    </th>
  );
  const exportCsv = () => {
    const csv = ["Name,Total sales,Total uplifts,Avg price,Sent,Purchased,Conversion rate", ...shown.map((p) => `"${p.data.name.replaceAll('"', '""')}",,,${p.data.price},,,`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importPasted = async (e: FormEvent) => {
    e.preventDefault();
    for (const r of parseRows(pasted ?? "")) await save(null, true, { ...blankProduct(), name: r.title, description: r.text, price: r.price });
    setPasted(null);
  };

  return (
    <div className="tab-body">
      <div className="tab-head">
        <h3>Products</h3>
        <div className="row"><button onClick={() => setPasted("")}>Import</button><button className="primary" onClick={() => setModal({ id: null, live: true, data: blankProduct() })}>New product</button></div>
      </div>
      <div className="card quick">
        <b>Quickly create a product:</b>
        <div className="quick-row">
          <button onClick={() => setImportFrom("best")}>+ Import from top selling PPVs</button>
          <button onClick={() => setImportFrom("mass")}>+ Import from mass messages</button>
          <button onClick={() => setImportFrom("library")}>+ Import from message library</button>
        </div>
      </div>

      {pasted !== null && (
        <form className="card" onSubmit={importPasted}>
          <label htmlFor="pr-paste">Paste rows from a sheet: Name, Description, Price (tab separated, one product per line)</label>
          <textarea id="pr-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <div className="savebar"><button className="primary" type="submit">Import {parseRows(pasted).length} products</button><button type="button" onClick={() => setPasted(null)}>Cancel</button></div>
        </form>
      )}

      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={sub === "list"} onClick={() => setSub("list")}>Products ({items.length})</button>
        <button role="tab" aria-selected={sub === "analytics"} onClick={() => setSub("analytics")}>Analytics</button>
      </div>
      <div className="row filters">
        <input className="grow" aria-label="Search products" placeholder="Search products" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select ariaLabel="Filter by live" value={liveFilter} onChange={(v) => { setLiveFilter(v); setPage(1); }} options={LIVE_FILTER} />
        <Select ariaLabel="Filter by tag" value={tagFilter} onChange={(v) => { setTagFilter(v); setPage(1); }} options={tagOptions} />
        {sub === "analytics" && <><Select ariaLabel="Date range" value={range} onChange={setRange} options={RANGES} /><span className="muted">{gmt()}</span><button type="button" disabled={!shown.length} onClick={exportCsv}>Export</button></>}
      </div>

      {sub === "list" ? (
        rows.length === 0 ? <div className="empty">{items.length ? "No product matches." : "No products yet. Add one, import a sheet, or import from the message library."}</div> : (
          <table className="data-table">
            <thead><tr>{th("name", "Name")}{th("price", "Price")}<th>Description</th><th>Tags</th>{th("media", "Media")}{th("progression", "Content progression")}{th("live", "Live")}<th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.data.name}{p.data.bundle && <span className="chip">Bundle</span>}</td>
                  <td>{money(p.data.price)}</td>
                  <td>{p.data.description ? (p.data.description.length > 90 ? `${p.data.description.slice(0, 90)}…` : p.data.description) : <span className="err">Missing description</span>}</td>
                  <td className="tag-cell">{p.data.tags.slice(0, 3).map((t) => <span className="chip" key={t}>{t}</span>)}{p.data.tags.length > 3 && <span className="muted">+{p.data.tags.length - 3}</span>}</td>
                  <td><MediaCount media={p.data.media} /></td>
                  <td><Select ariaLabel="Content progression" value={String(p.data.progression)} onChange={(v) => void save(p.id, p.live, { ...p.data, progression: Number(v) })} options={PROGRESSION} /></td>
                  <td><input type="checkbox" aria-label="Live" checked={p.live} onChange={(e) => void save(p.id, e.target.checked, p.data)} /></td>
                  <td className="row-actions">
                    <button onClick={() => setModal({ id: p.id, live: p.live, data: p.data })}>Edit</button>
                    <button className="danger" onClick={() => void confirm(`Delete "${p.data.name}"?`).then((ok) => void (ok && remove(p.id)))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <>
          {range === "custom" && <div className="row"><input type="date" aria-label="From" /><span className="muted">to</span><input type="date" aria-label="To" /></div>}
          <div className="note">Sales figures need purchase tracking, which is not connected yet. They stay empty until it is.</div>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Total sales</th><th>Total uplifts</th><th>Avg price</th><th>Sent</th><th>Purchased</th><th>Conversion rate</th><th></th></tr></thead>
            <tbody>{rows.map((p) => <tr key={p.id}><td>{p.data.name}</td><td>–</td><td>–</td><td>{money(p.data.price)}</td><td>–</td><td>–</td><td>–</td><td className="row-actions"><button onClick={() => setReport(p.data.name)}>View report</button></td></tr>)}</tbody>
          </table>
        </>
      )}
      <Pager {...pager} />

      {modal && <ProductModal accountId={accountId} accountName={accountName} initial={modal} onSave={save} onClose={() => setModal(null)} />}
      {importFrom && <ImportProductModal accountId={accountId} start={importFrom} onClose={() => setImportFrom(null)} onImport={async (p, edit) => { if (edit) setModal({ id: null, live: true, data: { ...blankProduct(), ...p } }); else await save(null, true, { ...blankProduct(), ...p }); setImportFrom(null); }} />}
      {report && <ReportDialog name={report} onClose={() => setReport(null)} />}
    </div>
  );
}
