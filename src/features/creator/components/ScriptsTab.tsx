"use client";
import { Loading } from "@/components/common/Loading.tsx";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useMemo, useState, type ReactNode } from "react";
import { FileTextIcon, HourglassIcon, ListIcon, PlusIcon, SearchIcon, SparkIcon, UserIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { Pager, usePaging } from "@/components/common/Pager.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import type { Item, ItemData, ScriptStart, ScriptStep } from "../types.ts";
import { useItems } from "./useItems.tsx";

type Script = ItemData["script"];
type Draft = { id: number | null; live: boolean; data: Script };
const blank = (): Draft => ({ id: null, live: false, data: { name: "", trigger: "", steps: [], expiresHours: 6, exitOn: true, exitLimit: 2 } });
const TEMPLATE = ["Greet the fan warmly and ask how their day is going.", "Tease something she is selling and ask what they would like to see.", "Offer the matching product with its price."];

const Row = ({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) => (
  <div className="script-row"><div className="script-label"><b>{icon} {title}</b>{hint && <p className="muted">{hint}</p>}</div><div className="script-control">{children}</div></div>
);

/** "Script Editor": when a script starts, when it ends, and the steps Jazz follows. Saved here; nothing runs it yet. */
const STARTS: { value: ScriptStart; label: string }[] = [
  { value: "jazz", label: "Jazz decides from the trigger text" },
  { value: "content", label: "The fan asks for content (a set, a video, pics, a price)" },
  { value: "keywords", label: "The fan's message has a keyword" },
  { value: "subscribe", label: "A fan subscribes" },
  { value: "resubscribe", label: "A fan resubscribes" },
  { value: "online", label: "A fan comes online" },
  { value: "like", label: "A fan likes a post" },
  { value: "tip", label: "A fan tips" },
  { value: "buy", label: "A fan buys a PPV" },
  { value: "expire", label: "A subscription expires" },
];

function ScriptEditor({ draft, creator, products, onSave, onClose }: { draft: Draft; creator: string; products: Item<"product">[]; onSave: (d: Draft) => Promise<boolean>; onClose: () => void }) {
  const { setFlash } = useSession();
  const [d, setD] = useState<Script>(draft.data);
  const set = (patch: Partial<Script>) => setD({ ...d, ...patch });
  const [kwText, setKwText] = useState((draft.data.keywords ?? []).join(", "));
  const opt = (i: number): ScriptStep => d.stepOptions?.[i] ?? {};
  const setOpt = (i: number, patch: ScriptStep) => set({ stepOptions: d.steps.map((_, k) => (k === i ? { ...opt(k), ...patch } : opt(k))) });
  const create = async () => {
    const steps = d.steps.map((s) => s.trim()).filter(Boolean);
    if (!d.name.trim()) return setFlash({ kind: "err", text: "Give the script a name." });
    if (!d.trigger.trim()) return setFlash({ kind: "err", text: "Describe when the script starts." });
    if (!steps.length) return setFlash({ kind: "err", text: "Add at least one step." });
    const keep = d.steps.map((s, i) => (s.trim() ? i : -1)).filter((i) => i >= 0);
    const keywords = kwText.split(",").map((k) => k.trim()).filter(Boolean);
    if (d.startsOn === "keywords" && !keywords.length) return setFlash({ kind: "err", text: "Add at least one keyword." });
    if (keywords.length > 20 || keywords.some((k) => k.length > 40)) return setFlash({ kind: "err", text: "Use at most 20 keywords of up to 40 characters." });
    if (steps.length > 20) return setFlash({ kind: "err", text: "A script can have at most 20 steps." });
    if (keep.some((i) => (d.stepOptions?.[i]?.waitMinutes ?? 0) > 10080)) return setFlash({ kind: "err", text: "A wait can be at most 7 days (10080 minutes)." });
    if (await onSave({ ...draft, data: { ...d, name: d.name.trim(), trigger: d.trigger.trim(), steps, stepOptions: keep.map((i) => d.stepOptions?.[i] ?? {}), keywords } })) onClose(); // a rejected save keeps the editor and its text
  };
  return (
    <Modal size="lg" title="Script Editor" onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => void create()}>{draft.id === null ? "Create" : "Save"}</button></>}>
      <p className="muted">Build your script as a sequence of messages. Each goes out after the fan answers the one before, or after a wait, and can carry a product.</p>
      <Row icon={<UserIcon />} title="Creator" hint="Choose the creator this script belongs to."><input aria-label="Creator" readOnly value={creator} /></Row>
      <Row icon={<ListIcon />} title="Script Name"><input aria-label="Script name" autoFocus placeholder='e.g. "New Fans", "Gym Fan Intro", "Feet Lovers Night Flow"' value={d.name} onChange={(e) => set({ name: e.target.value })} /></Row>
      <Row icon={<FileTextIcon />} title="Trigger" hint="Define when this script should start."><textarea aria-label="Trigger" placeholder={`e.g. 'Fan mentions the gym', 'New subscriber after 7 days', 'Nighttime in creator's timezone'`} value={d.trigger} onChange={(e) => set({ trigger: e.target.value })} /></Row>
      <Row icon={<SparkIcon />} title="Starts by itself" hint="Start the script on an event or on keywords. 'Jazz decides' only gives Jazz the trigger text.">
        <select aria-label="Starts by itself" value={d.startsOn ?? "jazz"} onChange={(e) => set({ startsOn: e.target.value as ScriptStart })}>{STARTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
        {d.startsOn === "keywords" && <input aria-label="Keywords" placeholder="Keywords, comma separated: e.g. too expensive, discount, cheaper" value={kwText} onChange={(e) => setKwText(e.target.value)} />}
      </Row>
      <Row icon={<HourglassIcon />} title="Expiration Time" hint="If the fan disappears for longer than this time, the script will expire and Jazz will switch back to her default mode."><span className="num-field"><input type="number" min={0} step="0.5" aria-label="Expiration time" value={d.expiresHours ?? 6} onChange={(e) => set({ expiresHours: Math.max(0, Number(e.target.value)) })} /><span className="muted">hours</span></span></Row>
      <Row icon={<SparkIcon />} title="Exit Rules" hint="The script will exit when it reaches its expiration time or the fan appears disinterested.">
        <div className="card rule-card">
          <div className="rule-head"><div><b>Unpurchased PPV Limit</b><div className="muted">Exit the script when this many PPVs sent during the script remain unpurchased.</div></div><input type="checkbox" role="switch" aria-label="Unpurchased PPV Limit" checked={!!d.exitOn} onChange={(e) => set({ exitOn: e.target.checked })} /></div>
          <span className="num-field"><input type="number" min={1} max={50} aria-label="Unpurchased PPVs" disabled={!d.exitOn} value={d.exitLimit ?? 2} onChange={(e) => set({ exitLimit: Math.max(1, Math.round(Number(e.target.value))) })} /><span className="muted">unpurchased PPVs</span></span>
        </div>
      </Row>
      <Row icon={<ListIcon />} title="Script Steps" hint="Add steps in the order Jazz should follow. Each step is either an instruction block or a specific message. Message steps can optionally include a bundle.">
        {d.steps.map((s, i) => (
          <div className="row step" key={i}>
            <div className="grow step-body">
              <textarea aria-label={`Step ${i + 1}`} placeholder="The message to send (use {name} for the fan's first name)" value={s} onChange={(e) => set({ steps: d.steps.map((x, k) => (k === i ? e.target.value : x)) })} />
              <div className="row step-opts">
                <select aria-label={`How step ${i + 1} is written`} value={opt(i).mode ?? "exact"} onChange={(e) => setOpt(i, { mode: e.target.value as "exact" | "rewrite" })}><option value="exact">Word for word</option><option value="rewrite">Jazz writes it in her voice</option></select>
                <select aria-label={`When step ${i + 1} goes out`} value={opt(i).afterReply === false ? "wait" : "reply"} onChange={(e) => setOpt(i, e.target.value === "reply" ? { afterReply: undefined, waitMinutes: undefined } : { afterReply: false })}><option value="reply">{i === 0 ? "Right away" : "After the fan answers"}</option><option value="wait">After a wait</option></select>
                {opt(i).afterReply === false && <span className="num-field"><input type="number" min={0} max={10080} aria-label={`Wait before step ${i + 1}`} value={opt(i).waitMinutes ?? 0} onChange={(e) => setOpt(i, { waitMinutes: Math.max(0, Number(e.target.value)) })} /><span className="muted">min</span></span>}
                <select aria-label={`Product on step ${i + 1}`} value={opt(i).productId == null ? "" : String(opt(i).productId)} onChange={(e) => setOpt(i, { productId: e.target.value === "" ? null : Number(e.target.value) })}><option value="">No product</option><option value="0">The product that best fits what the fan asked for</option>{opt(i).productId && !products.some((p) => p.id === opt(i).productId) && <option value={String(opt(i).productId)}>(product off or deleted: nothing is attached)</option>}{products.map((p) => <option key={p.id} value={p.id}>{p.data.name} · ${p.data.price}</option>)}</select>
              </div>
            </div>
            <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => set({ steps: d.steps.filter((_, k) => k !== i), stepOptions: (d.stepOptions ?? []).filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
        <div className="row"><button type="button" className="grow" onClick={() => set({ steps: [...d.steps, ""] })}><PlusIcon /> Add Step</button><button type="button" onClick={() => set({ steps: TEMPLATE })}><SparkIcon /> Start With Template</button></div>
      </Row>
    </Modal>
  );
}

/** Scripts: the list (Name, Trigger, Runs, Messages, Sales, Total Uplifts, Live) and the editor. `creator` adds the Creator column. */
export function ScriptsTab({ accountId, creator, changed }: { accountId: string; creator?: string; changed: () => void }) {
  const { confirm } = useDialogs();
  const { items, save, remove } = useItems(accountId, "script", changed);
  const { items: products } = useItems(accountId, "product", () => {});
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((s) => !q || s.data.name.toLowerCase().includes(q));
  }, [items, search]);
  const { slice: rows, setPage, pager } = usePaging(shown);
  if (!items) return <Loading />;

  return (
    <div className="tab-body">
      <div className="row">
        <label className="search-box"><SearchIcon /><input aria-label="Search scripts" placeholder="Search scripts" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
        <span className="grow" />
        <button type="button" className="primary" onClick={() => setDraft(blank())}><PlusIcon /> New Script</button>
      </div>
      <div className="note">A script is a trigger and the steps that follow it. A script can start by itself (on an event or keywords) and run in Try Jazz; running them on real chats is not switched on yet.</div>
      {draft && <ScriptEditor draft={draft} creator={creator ?? ""} products={(products ?? []).filter((p) => p.live)} onSave={(x) => save(x.id, x.live, x.data)} onClose={() => setDraft(null)} />}
      <table className="data-table">
        <thead><tr><th>Name</th>{creator !== undefined && <th>Creator</th>}<th>Trigger</th><th>Runs</th><th>Messages</th><th>Sales</th><th>Total Uplifts</th><th>Live</th><th /></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{s.data.name}</td>
              {creator !== undefined && <td>{creator}</td>}
              <td className="lib-text">{s.data.trigger}</td>
              <td>0</td><td>{s.data.steps.length}</td><td>–</td><td>–</td>
              <td><input type="checkbox" role="switch" aria-label="Live" checked={s.live} onChange={(e) => void save(s.id, e.target.checked, s.data)} /></td>
              <td className="row-actions">
                <button onClick={() => setDraft({ id: s.id, live: s.live, data: s.data })}>Edit</button>
                <button className="danger" onClick={() => void confirm(`Delete "${s.data.name}"?`).then((ok) => void (ok && remove(s.id)))}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty">{items.length ? "No script matches." : "New scripts will appear here as soon as you add them"}</div>}
      <Pager {...pager} />
    </div>
  );
}
