"use client";
import { ConfirmBox } from "@/components/common/Dialogs.tsx";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, CloseIcon, InfoIcon, PlusIcon, SearchIcon, SortIcon, UserIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { Pager } from "@/components/common/Pager.tsx";
import { Select } from "@/components/common/Select.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import { ago } from "@/lib/client/format.ts";
import { blankGroup, blankRule, FAN_FIELDS, NUMBER_OPS, type Rule, type RuleGroup } from "../schema.ts";
import type { FanPreview } from "../types.ts";

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n).toLocaleString("en-US")}`);
const isGroup = (x: Rule | RuleGroup): x is RuleGroup => "rules" in x;
const BUCKETS = ["$0 or less", "Over $0, under $50", "$50 to under $200", "$200+"];

function MatchToggle({ value, onChange }: { value: RuleGroup["match"]; onChange: (m: RuleGroup["match"]) => void }) {
  return <div className="seg small" role="group" aria-label="Match"><button type="button" aria-pressed={value === "all"} className={value === "all" ? "active" : ""} onClick={() => onChange("all")}>Require all</button><button type="button" aria-pressed={value === "any"} className={value === "any" ? "active" : ""} onClick={() => onChange("any")}>Require any</button></div>;
}

function RuleRow({ rule, onChange, onRemove }: { rule: Rule; onChange: (r: Rule) => void; onRemove: () => void }) {
  const f = FAN_FIELDS.find((x) => x.key === rule.field)!;
  const set = (key: Rule["field"]) => { const next = FAN_FIELDS.find((x) => x.key === key)!; onChange(next.kind === "select" ? { field: key, op: "=", value: next.options[0][0] } : { field: key, op: ">", value: "0" }); };
  return (
    <div className="rule-row">
      <div className="rule-line">
        <Select ariaLabel="Field" value={rule.field} onChange={(v) => set(v as Rule["field"])} options={FAN_FIELDS.map((x) => ({ value: x.key, label: x.label }))} />
        <span className="info-tip" title={f.tip}><InfoIcon /></span>
        {f.kind === "number" ? <Select ariaLabel="Operator" value={rule.op} onChange={(op) => onChange({ ...rule, op: op as Rule["op"] })} options={NUMBER_OPS.map(([value, label]) => ({ value, label }))} /> : <Select ariaLabel="Value" value={rule.value} onChange={(value) => onChange({ ...rule, value })} options={f.options.map(([value, label]) => ({ value, label }))} />}
      </div>
      <div className="rule-line">
        {f.kind === "number" && <span className="num-field">{rule.field === "spend" && <span className="muted">$</span>}<input type="number" min={0} aria-label="Value" value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value })} /></span>}
        <button type="button" className="ghost" aria-label="Remove rule" onClick={onRemove}><CloseIcon /></button>
      </div>
    </div>
  );
}

function Group({ group, onChange, nested, onRemove }: { group: RuleGroup; onChange: (g: RuleGroup) => void; nested?: boolean; onRemove?: () => void }) {
  const [menu, setMenu] = useState(false);
  const setAt = (i: number, x: Rule | RuleGroup) => onChange({ ...group, rules: group.rules.map((r, k) => (k === i ? x : r)) });
  return (
    <div className={nested ? "rule-group card" : "rule-top"}>
      <div className="row">{nested && <b className="grow">Rule group</b>}<MatchToggle value={group.match} onChange={(match) => onChange({ ...group, match })} />{onRemove && <button type="button" className="ghost" aria-label="Remove group" onClick={onRemove}><CloseIcon /></button>}</div>
      {group.rules.map((x, i) => (
        <div key={i}>
          {i > 0 && <div className="rule-and">{group.match === "all" ? "AND" : "OR"}</div>}
          {isGroup(x) ? <Group nested group={x} onChange={(g) => setAt(i, g)} onRemove={() => onChange({ ...group, rules: group.rules.filter((_, k) => k !== i) })} /> : <RuleRow rule={x} onChange={(r) => setAt(i, r)} onRemove={() => onChange({ ...group, rules: group.rules.filter((_, k) => k !== i) })} />}
        </div>
      ))}
      <div className="rule-add">
        <button type="button" onClick={() => onChange({ ...group, rules: [...group.rules, blankRule()] })}><PlusIcon /> Add rule</button>
        {!nested && <span className="menu"><button type="button" aria-label="More ways to add" aria-expanded={menu} onClick={() => setMenu(!menu)}>⌄</button>{menu && <div className="menu-list" role="menu"><button type="button" role="menuitem" onClick={() => { setMenu(false); onChange({ ...group, rules: [...group.rules, { ...blankGroup(), rules: [blankRule()] }] }); }}>Add group</button></div>}</span>}
      </div>
    </div>
  );
}

/** A fan list: its rules on the left, and on the right who matches them right now (a live preview over the fans we know). */
export function FanListDetail({ accountId, listId, name, initial, onBack, onSaved }: { accountId: string; listId: number | null; name: string; initial: RuleGroup | null; onBack: () => void; onSaved: (name: string | null, rules: RuleGroup, count: number) => Promise<void> }) {
  const { call, run } = useSession();
  const base = useRef<RuleGroup>(initial ?? blankGroup());
  const [rules, setRules] = useState<RuleGroup>(base.current);
  const [search, setSearch] = useState("");
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [data, setData] = useState<FanPreview | null>(null);
  const [intro, setIntro] = useState(true);
  const [discard, setDiscard] = useState<"reset" | "leave" | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const dirty = JSON.stringify(rules) !== JSON.stringify(base.current);

  useEffect(() => {
    const t = setTimeout(() => void run(async () => setData(await call<FanPreview>("POST", `/api/accounts/${enc(accountId)}/creator/fan-preview`, { rules, q: search, page, size, desc }))), 300);
    return () => clearTimeout(t);
  }, [accountId, rules, search, page, size, desc, call, run]);
  useEffect(() => { if (data && page > 1 && data.fans.length === 0) setPage(Math.max(1, Math.ceil(data.total / size))); }, [data, page, size]);

  const fans = data ? data.fans : [];
  const total = data?.buckets.reduce((a, b) => a + b, 0) || 1;
  const stats: [string, string][] = [["Total fans", data ? data.total.toLocaleString("en-US") : "–"], ["Total spend", data ? money(data.spend) : "–"], ["Average spend", data && data.total ? money(data.spend / data.total) : "–"], ["Active rate", "N/A"]];
  let x = 0;

  return (
    <div className="fan-detail">
      <div className="row"><button type="button" className="icon-link" aria-label="Back to the fan lists" onClick={() => (dirty ? setDiscard("leave") : onBack())}><ArrowLeftIcon /></button><UserIcon /><h2 className="grow">{name}</h2></div>
      <div className="fan-cols">
        <section className="card rules-panel">
          <h3 className="sec">Rules</h3>
          {intro && <div className="note rules-note"><span>Rules automatically add fans that match. Combine multiple rules with &quot;Require all&quot; (AND) or &quot;Require any&quot; (OR) to build precise segments.</span><button type="button" className="ghost" aria-label="Dismiss" onClick={() => setIntro(false)}><CloseIcon /></button></div>}
          <Group group={rules} onChange={(r) => { setRules(r); setPage(1); }} />
          <div className="rules-foot">
            <button type="button" disabled={!dirty} onClick={() => setDiscard("reset")}>Discard changes</button>
            <button type="button" className="primary" disabled={rules.rules.length === 0} onClick={() => (listId === null ? setNaming("") : void onSaved(null, rules, data?.total ?? 0).then(() => { base.current = rules; setRules({ ...rules }); }))}>{listId === null ? "New list from these rules" : "Save changes"}</button>
          </div>
        </section>
        <section className="fan-main">
          <div className="fan-stats">{stats.map(([k, v]) => <div className="card" key={k}><span className="muted">{k}</span><b className="big">{v}</b></div>)}</div>
          <div className="card spend-dist">
            <span className="muted">Spend distribution</span>
            <svg viewBox="0 0 100 3" preserveAspectRatio="none" className="dist-bar" role="img" aria-label="Spend distribution">
              {(data?.buckets ?? [0, 0, 0, 0]).map((n, i) => { const w = (n / total) * 100; const el = <rect key={i} x={x} y="0" width={w} height="3" className={`b${i}`} />; x += w; return el; })}
            </svg>
            <div className="dist-legend">{BUCKETS.map((b, i) => <span key={b}><i className={`b${i}`} /> {b} <b>{(data?.buckets[i] ?? 0).toLocaleString("en-US")}</b></span>)}</div>
          </div>
          <div className="row"><label className="search-box grow"><SearchIcon /><input aria-label="Search fans" placeholder="Search fans" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label><button type="button" className="ghost" aria-label="Sort by spend" onClick={() => { setDesc(!desc); setPage(1); }}><SortIcon /></button></div>
          {dirty && <div className="note live-note">Live preview of unsaved rules - save to apply filters, sort and write actions</div>}
          <div className="fan-rows">
            {data && fans.length === 0 && <div className="empty">No fan matches these rules.</div>}
            {fans.map((f) => (
              <div className="fan-row" key={f.id}>
                <span className="avatar-s">{(f.name || f.username || "?").slice(0, 1).toUpperCase()}</span>
                <div className="grow"><b>{f.name || f.username || f.id}</b> {f.username && <span className="muted">@{f.username}</span>} {f.human && <span className="chip">Person</span>}
                  <div className="muted">{f.subscribedAt ? `Joined ${new Date(f.subscribedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ` : ""}{f.lastMessageAt ? `Last message ${ago(f.lastMessageAt)} ago` : "No messages yet"}</div></div>
                <div className="fan-spend"><b>{money(f.spend)}</b><span className="muted">spent</span></div>
              </div>
            ))}
          </div>
          <Pager total={data?.total ?? 0} page={page} onPage={setPage} size={size} onSize={(n) => { setSize(n); setPage(1); }} />
        </section>
      </div>
      {discard && <ConfirmBox title="Discard changes?" text="You'll lose your unsaved rule edits." yes="Discard changes" no="Keep editing" onNo={() => setDiscard(null)} onYes={() => { const leave = discard === "leave"; setDiscard(null); setRules(base.current); if (leave) onBack(); }} />}
      {naming !== null && (
        <Modal title="New list from these rules" onClose={() => setNaming(null)} footer={<><button type="button" onClick={() => setNaming(null)}>Cancel</button><button type="button" className="primary" disabled={!naming.trim()} onClick={() => void onSaved(naming.trim(), rules, data?.total ?? 0).then(onBack)}>Create list</button></>}>
          <label htmlFor="fl-name">List name</label>
          <input id="fl-name" autoFocus placeholder="e.g. VIP fans" value={naming} onChange={(e) => setNaming(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
