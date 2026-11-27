"use client";
import { Pager, usePaging } from "@/components/common/Pager.tsx";
import { Loading } from "@/components/common/Loading.tsx";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useEffect, useMemo, useState } from "react";
import { GridIcon, ListIcon, PlusIcon, SearchIcon, SortIcon, UploadCloudIcon, UserIcon } from "@/components/common/icons.tsx";
import { FlashNote } from "@/components/common/FlashNote.tsx";
import { AccountSelect } from "@/features/accounts/components/AccountSelect.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { FanListDetail } from "@/features/creator/components/FanListDetail.tsx";
import { ImportFromOnlyFans } from "@/features/creator/components/FanLists.tsx";
import { useItems } from "@/features/creator/components/useItems.tsx";
import { blankGroup, countRules } from "@/features/creator/schema.ts";
import { enc } from "@/lib/client/api.ts";
import { ago } from "@/lib/client/format.ts";

type SortKey = "name" | "fans" | "updated";

/** Fan Lists: every list of one creator (table or cards); a list opens to its rules and the fans that match. */
export function FanListsPage({ accountId }: { accountId: string }) {
  const { confirm } = useDialogs();
  const { items, save, remove, reload } = useItems(accountId, "fanlist", () => {});
  const { call, run } = useSession();
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState(false);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<{ id: number | null; name: string } | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const copying = items?.some((l) => l.data.done === false);
  useEffect(() => {
    if (!copying) return;
    const t = setInterval(() => void reload(), 5000);
    return () => clearInterval(t);
  }, [copying, reload]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const val = (l: NonNullable<typeof items>[number]) => (sort.key === "name" ? l.data.name.toLowerCase() : sort.key === "fans" ? (l.data.count ?? -1) : (l.data.updatedAt ?? 0));
    return (items ?? []).filter((l) => !q || l.data.name.toLowerCase().includes(q)).sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [items, search, sort]);
  const { slice: pageRows, pager } = usePaging(shown);

  if (open) {
    const cur = open.id === null ? null : items?.find((l) => l.id === open.id);
    return (
      <FanListDetail accountId={accountId} listId={open.id} name={open.name} initial={cur?.data.rules ?? null} onBack={() => setOpen(null)}
        onSaved={async (name, rules, count) => {
          if (cur) await save(cur.id, true, { ...cur.data, rules, count, updatedAt: Date.now() });
          else await save(null, true, { name: name ?? "New list", ofId: null, count, rules, updatedAt: Date.now() });
        }} />
    );
  }
  const size = (n: number | null | undefined, done: boolean | undefined) => (n == null ? "–" : `${n.toLocaleString("en-US")}${done === false ? " (copying…)" : ""}`);
  const source = (l: NonNullable<typeof items>[number]) => (l.data.ofId ? "OnlyFans" : l.data.rules && countRules(l.data.rules) ? "Rules" : "Manual");
  const th = (key: SortKey | null, label: string) => <th>{label}{key ? <button type="button" className="sort-btn" aria-label={`Sort by ${label}`} onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}><SortIcon /></button> : null}</th>;

  return (
    <>
      <div className="row">
        <h2 className="grow">Fan Lists</h2>
        <label className="search-box"><SearchIcon /><input aria-label="Search lists" placeholder="Search lists" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <span className="view-toggle" role="group" aria-label="View"><button type="button" aria-pressed={cards} className={cards ? "on" : ""} aria-label="Cards" onClick={() => setCards(true)}><GridIcon /></button><button type="button" aria-pressed={!cards} className={cards ? "" : "on"} aria-label="List" onClick={() => setCards(false)}><ListIcon /></button></span>
        <button type="button" onClick={() => setImporting(true)}><UploadCloudIcon /> Import from OnlyFans</button>
        <button type="button" className="primary" onClick={() => setOpen({ id: null, name: "All Fans" })}><PlusIcon /> New list</button>
        <AccountSelect />
      </div>
      <FlashNote />
      {picked.length > 0 && <div className="row"><span className="muted">{picked.length} selected</span><button type="button" className="danger" onClick={() => void confirm(`Delete ${picked.length} lists?`).then(async (ok) => { if (ok) { for (const id of picked) await remove(id); setPicked([]); } })}>Delete</button></div>}
      {!items ? <Loading /> : cards ? (
        <div className="list-cards">
          <button type="button" className="card list-card" onClick={() => setOpen({ id: null, name: "All Fans" })}><span className="muted"><UserIcon /> All Fans</span><div className="big">–</div><div className="muted">Every non-deleted subscriber</div></button>
          {pageRows.map((l) => <button type="button" className="card list-card" key={l.id} onClick={() => setOpen({ id: l.id, name: l.data.name })}><span className="muted"><UserIcon /> {l.data.name}</span><div className="big">{size(l.data.count, l.data.done)}</div><div className="muted">{source(l)}</div></button>)}
        </div>
      ) : (
        <table className="data-table">
          <thead><tr><th><input type="checkbox" className="tbl-check" aria-label="Select all" checked={shown.length > 0 && picked.length === shown.length} onChange={(e) => setPicked(e.target.checked ? shown.map((l) => l.id) : [])} /></th>{th("name", "Name")}{th("fans", "Fans")}<th>Source</th>{th("updated", "Updated")}</tr></thead>
          <tbody>
            <tr className="click-row" onClick={() => setOpen({ id: null, name: "All Fans" })}><td /><td><b>All Fans</b><div className="muted">Every non-deleted subscriber</div></td><td className="muted">All</td><td className="muted">Built in</td><td className="muted">–</td></tr>
            {pageRows.map((l) => (
              <tr key={l.id} className="click-row" onClick={() => setOpen({ id: l.id, name: l.data.name })}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="tbl-check" aria-label={`Select ${l.data.name}`} checked={picked.includes(l.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, l.id] : picked.filter((x) => x !== l.id))} /></td>
                <td>{l.data.name}</td><td>{size(l.data.count, l.data.done)}</td><td>{source(l)}</td><td>{l.data.updatedAt ? `${ago(l.data.updatedAt) === "0m" ? "just now" : `${ago(l.data.updatedAt)} ago`}` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager {...pager} />
      {importing && <ImportFromOnlyFans accountId={accountId} onClose={() => setImporting(false)} onImport={(n, l) => run(async () => { await call("POST", `/api/accounts/${enc(accountId)}/creator/lists/import`, { name: n, ofId: l.id }); await reload(); })} />}
    </>
  );
}
