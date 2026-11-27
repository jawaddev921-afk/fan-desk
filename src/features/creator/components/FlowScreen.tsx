"use client";
import { Pager, usePaging } from "@/components/common/Pager.tsx";
import { Loading } from "@/components/common/Loading.tsx";
import { ConfirmBox } from "@/components/common/Dialogs.tsx";
import { useEffect, useMemo, useState } from "react";
import { ChartIcon, MoreIcon, PencilIcon, PlayCircleIcon, PlusIcon, SearchIcon, SortIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { Select } from "@/components/common/Select.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { ago } from "@/lib/client/format.ts";
import { enc } from "@/lib/client/api.ts";
import { FLOW_TEMPLATES, FLOW_TRIGGERS, flowFromTemplate, flowIssues, type Flow } from "../schema.ts";
import type { Item } from "../types.ts";
import { FlowBuilder } from "./FlowBuilder.tsx";
import { SetLive } from "./FlowDrawers.tsx";
import { useItems } from "./useItems.tsx";

type Tab = "all" | "active" | "draft";
type SortKey = "title" | "status" | "edited";
const STATUS = { draft: "Draft", active: "Live", stopped: "Stopped" } as const;

/** "Message Flow for X": the flows of one creator (list), and the editor when one is opened. */
export function FlowScreen({ accountId, accountName, onEditing }: { accountId: string; accountName: string; onEditing?: (editing: boolean) => void }) {
  const { items, save, remove } = useItems(accountId, "flow", () => {});
  const { me, call, run, setFlash } = useSession();
  const [editing, setEditing] = useState<{ id: number | null; flow: Flow; stats?: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [trigger, setTrigger] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "edited", dir: -1 });
  const [menu, setMenu] = useState<number | null>(null);
  const [del, setDel] = useState<Item<"flow"> | null>(null);
  const [copy, setCopy] = useState<Item<"flow"> | null>(null);
  const [live, setLive] = useState<Item<"flow"> | null>(null);
  const [target, setTarget] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => onEditing?.(editing !== null), [editing, onEditing]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (items ?? []).filter((f) => (tab === "all" || (tab === "active" ? f.data.status === "active" : f.data.status !== "active")) && (!q || f.data.title.toLowerCase().includes(q)) && (!trigger || String(f.data.nodes.find((n) => n.kind === "start")?.config.trigger) === trigger));
    const val = (f: Item<"flow">) => (sort.key === "title" ? f.data.title.toLowerCase() : sort.key === "status" ? f.data.status : f.data.editedAt);
    return list.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [items, tab, search, trigger, sort]);
  const { slice: pageRows, pager } = usePaging(rows);
  if (!items) return <Loading />;
  const count = { all: items.length, active: items.filter((f) => f.data.status === "active").length, draft: items.filter((f) => f.data.status !== "active").length };
  const others = (me?.accounts ?? []).filter((a) => a.accountId !== accountId);
  const th = (key: SortKey | null, label: string) => <th>{label}{key ? <button type="button" className="sort-btn" aria-label={`Sort by ${label}`} onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}><SortIcon /></button> : <span className="sort-btn" aria-hidden="true"><SortIcon /></span>}</th>;

  if (editing) {
    return <FlowBuilder accountId={accountId} accountName={accountName} initial={editing} onSave={async (id, flow) => { await save(id, flow.status === "active", flow); }} onClose={() => setEditing(null)} />;
  }
  const create = (templateId: string) => run(async () => {
    const flow = flowFromTemplate(templateId);
    const base = `/api/accounts/${enc(accountId)}/creator/items`;
    await call("POST", base, { kind: "flow", live: false, data: flow });
    const made = (await call<{ items: Item<"flow">[] }>("GET", `${base}?kind=flow`)).items.at(-1)!; // the newest one
    setCreating(false);
    setFlash({ kind: "ok", text: "Flow created successfully" });
    setEditing({ id: made.id, flow: made.data });
  });
  const clone = (f: Item<"flow">, accountTo: string) => run(async () => { await call("POST", `/api/accounts/${enc(accountTo)}/creator/items`, { kind: "flow", live: false, data: { ...f.data, title: `${f.data.title} (copy)`, status: "draft", editedAt: Date.now() } }); setFlash({ kind: "ok", text: "Flow duplicated." }); });

  return (
    <>
      <div className="row">
        <label className="search-box"><SearchIcon /><input aria-label="Search flows" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <Select ariaLabel="Triggers" value={trigger} onChange={setTrigger} options={[{ value: "", label: "All triggers" }, ...FLOW_TRIGGERS.map((t) => ({ value: t, label: t }))]} />
        <span className="grow" />
        <button type="button" className="primary" onClick={() => setCreating(true)}><PlusIcon /> New Flow</button>
      </div>
      <div className="tabs-row" role="tablist">
        {([["all", "All"], ["active", "Active"], ["draft", "Drafts or Stopped"]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className="tab-btn" onClick={() => setTab(id)}><span>{label}</span><span className="badge">{count[id]}</span></button>)}
      </div>
      {rows.length === 0 ? <div className="empty">{items.length ? "No flow matches." : "No flows yet. Create one with New Flow."}</div> : (
        <>
        <table className="data-table flow-table">
          <thead><tr>{th("title", "Flow title")}{th("status", "Status")}<th>Created By</th>{th(null, "Started")}{th(null, "Running")}{th(null, "Completed")}{th(null, "Goal")}{th("edited", "Last edit")}<th /></tr></thead>
          <tbody>
            {pageRows.map((f) => (
              <tr key={f.id}>
                <td>{f.data.title}</td>
                <td><span className={`fs s-${f.data.status}`}>{STATUS[f.data.status]}</span></td>
                <td>-</td><td>0</td><td>0</td><td>0</td><td>-</td>
                <td>{ago(f.data.editedAt) === "0m" ? "just now" : `${ago(f.data.editedAt)} ago`}</td>
                <td className="flow-actions">
                  <span className="menu"><button type="button" className="ghost" aria-label="More" aria-expanded={menu === f.id} onClick={() => setMenu(menu === f.id ? null : f.id)}><MoreIcon /></button>
                    {menu === f.id && <div className="menu-list" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setMenu(null); void clone(f, accountId); }}>Duplicate</button>
                      <button type="button" role="menuitem" disabled={others.length === 0} onClick={() => { setMenu(null); setCopy(f); setTarget(others[0]?.accountId ?? ""); }}>Duplicate to another creator</button>
                      <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(null); setDel(f); }}>Delete</button>
                    </div>}
                  </span>
                  <button type="button" className="ghost" aria-label="Edit" onClick={() => setEditing({ id: f.id, flow: f.data })}><PencilIcon /></button>
                  <button type="button" className="ghost" aria-label="Statistics" onClick={() => setEditing({ id: f.id, flow: f.data, stats: true })}><ChartIcon /></button>
                  <button type="button" className="ghost go" aria-label="Set live" disabled={f.data.status === "active"} onClick={() => (flowIssues(f.data).length ? setFlash({ kind: "err", text: "Finish configuration of messages series nodes to set it live." }) : setLive(f))}><PlayCircleIcon /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager {...pager} />
        </>
      )}
      {creating && (
        <Modal size="lg" title="Create New Flow" onClose={() => setCreating(false)}>
          <p className="muted">Create your own flow or discover our pre-built templates</p>
          <div className="tpl-grid">
            <button type="button" className="tpl" onClick={() => void create("")}><span className="tpl-art tpl-blank" aria-hidden="true"><span className="tpl-plus"><PlusIcon /></span></span><b>Build your own flow</b><span className="muted">Start with a blank canvas and add the steps yourself.</span></button>
            {FLOW_TEMPLATES.map((t) => <button type="button" className="tpl" key={t.id} onClick={() => void create(t.id)}><span className="tpl-art" aria-hidden="true">💬</span><b>{t.title}</b><span className="muted">{t.text}</span></button>)}
          </div>
        </Modal>
      )}
      {del && <ConfirmBox text={`Delete the flow "${del.data.title}"?`} sub="This action cannot be undone." yes="Delete" onNo={() => setDel(null)} onYes={() => { void remove(del.id); setDel(null); }} />}
      {copy && (
        <Modal title="Duplicate to another creator" onClose={() => setCopy(null)} footer={<><button type="button" onClick={() => setCopy(null)}>Cancel</button><button type="button" className="primary" disabled={!target} onClick={() => { void clone(copy, target); setCopy(null); }}>Duplicate</button></>}>
          <label htmlFor="fl-copy-to">Creator</label>
          <Select id="fl-copy-to" value={target} onChange={setTarget} options={others.map((a) => ({ value: a.accountId, label: a.settings.name }))} />
        </Modal>
      )}
      {live && <SetLive title={live.data.title} exit={live.data.exit} onClose={() => setLive(null)} onGo={(exit) => { void save(live.id, true, { ...live.data, exit, status: "active", editedAt: Date.now() }); setLive(null); }} />}
    </>
  );
}
