"use client";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useState, type FormEvent } from "react";
import { AI_NAME } from "@/config/ai.ts";
import { BulbIcon } from "@/components/common/icons.tsx";
import { Select } from "@/components/common/Select.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import { TRAIN, TRAIN_TOTAL, trainDone, type Turn } from "../schema.ts";
import { useItems } from "./useItems.tsx";

const GOAL = 20; // "reply to at least 20 chats" is the advice in the tip

type Row = { key: string; title: string; turns: Turn[]; itemId?: number };
type Group = { id: string; title: string; rows: Row[] };

export function TrainPanel({ accountId, train, onTrain, changed }: { accountId: string; train: Record<string, string>; onTrain: (t: Record<string, string>) => void; changed: () => void }) {
  const { call, run, me } = useSession();
  const { confirm } = useDialogs();
  const { items, save, remove } = useItems(accountId, "sample", changed);
  const [open, setOpen] = useState<string>(TRAIN[0]!.id);
  const [picked, setPicked] = useState(`${TRAIN[0]!.id}/${TRAIN[0]!.samples[0]!.key}`);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ category: string; title: string; fan: string } | null>(null);
  const [importFrom, setImportFrom] = useState<string | null>(null);
  const base = `/api/accounts/${enc(accountId)}/creator`;
  const others = (me?.accounts ?? []).filter((a) => a.accountId !== accountId);

  // built-in samples, then the custom ones, grouped by category (a custom category name creates a new group)
  const groups: Group[] = TRAIN.map((c) => ({ id: c.id, title: c.title, rows: c.samples.map((s) => ({ key: `${c.id}/${s.key}`, title: s.title, turns: s.turns })) }));
  for (const it of items ?? []) {
    const name = it.data.category.trim();
    const g = groups.find((x) => x.title.toLowerCase() === name.toLowerCase()) ?? (groups.push({ id: `c-${name.toLowerCase()}`, title: name, rows: [] }), groups[groups.length - 1]!);
    g.rows.push({ key: `custom/${it.id}`, title: it.data.title, turns: it.data.fan.map((text) => ({ from: "fan" as const, text })), itemId: it.id });
  }
  const current = groups.flatMap((g) => g.rows).find((r) => r.key === picked) ?? groups[0]!.rows[0]!;
  const total = TRAIN_TOTAL + (items?.length ?? 0);
  const done = trainDone(train);
  const answer = train[current.key] ?? "";

  const save1 = () => run(async () => {
    const response = (editing ?? "").trim();
    await call("PUT", `${base}/train`, { key: current.key, response });
    const next = { ...train };
    if (response) next[current.key] = response;
    else delete next[current.key];
    onTrain(next);
    setEditing(null);
  });
  const addSample = (e: FormEvent) => {
    e.preventDefault();
    if (!adding) return;
    const fan = adding.fan.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    void save(null, true, { category: adding.category, title: adding.title, fan }).then(() => setAdding(null));
  };
  const importTrain = () => run(async () => {
    await call("POST", `${base}/copy`, { fromAccountId: importFrom, what: "train" });
    onTrain((await call<{ train: Record<string, string> }>("GET", base)).train);
    setImportFrom(null);
  });

  return (
    <div className="train">
      <div className="tip"><BulbIcon /><div><b>Fine-tune {AI_NAME}</b><p>Fine-tune {AI_NAME} by replying to chats in your own tone and style. She&apos;ll learn from your responses and start answering just like you. For best results, try to respond to at least {GOAL} chats - and make sure your personality really comes through in your replies!</p></div></div>
      <div className="train-progress">
        <progress value={done} max={total} aria-label="Answered samples" />
        <span className={done >= GOAL ? "ok-text" : "muted"}>{done}/{total} chat samples{done >= GOAL ? " · Goal achieved!" : ""}</span>
        <button type="button" disabled={!others.length} title={others.length ? undefined : "Connect another creator account to import from it"} onClick={() => setImportFrom(importFrom === null ? others[0]!.accountId : null)}>Import responses from other creator</button>
        <button type="button" className="primary" onClick={() => setAdding({ category: groups[0]!.title, title: "", fan: "" })}>Add sample</button>
      </div>
      {importFrom !== null && (
        <div className="card copy-row">
          <span className="muted">Copy the answers to the built-in samples from</span>
          <Select ariaLabel="Import answers from" value={importFrom} onChange={setImportFrom} options={others.map((a) => ({ value: a.accountId, label: a.settings.name }))} />
          <button type="button" className="primary" onClick={() => void importTrain()}>Import</button>
          <button type="button" onClick={() => setImportFrom(null)}>Cancel</button>
        </div>
      )}
      {adding && (
        <form className="card" onSubmit={addSample}>
          <div className="two">
            <div><label htmlFor="ts-cat">Category (pick one or type a new name)</label><input id="ts-cat" list="ts-cats" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value })} /><datalist id="ts-cats">{groups.map((g) => <option key={g.id} value={g.title} />)}</datalist></div>
            <div><label htmlFor="ts-title">Title</label><input id="ts-title" value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} /></div>
          </div>
          <label htmlFor="ts-fan">What the fan says (one message per line)</label>
          <textarea id="ts-fan" value={adding.fan} onChange={(e) => setAdding({ ...adding, fan: e.target.value })} />
          <div className="savebar"><button className="primary" type="submit">Add sample</button><button type="button" onClick={() => setAdding(null)}>Cancel</button></div>
        </form>
      )}
      <div className="train-grid">
        <div className="card train-list">
          <h3 className="first">Chats</h3>
          {groups.map((g) => {
            const n = g.rows.filter((r) => train[r.key]?.trim()).length;
            return (
              <div key={g.id}>
                <button type="button" className="train-cat" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? "" : g.id)}>
                  <span className="grow">{g.title}</span>
                  <span className={n === g.rows.length ? "badge full" : "badge"}>{n}/{g.rows.length}</span>
                </button>
                {open === g.id && g.rows.map((r) => (
                  <button type="button" key={r.key} className="train-item" aria-current={r.key === current.key ? "true" : undefined} onClick={() => { setPicked(r.key); setEditing(null); }}>
                    <span className="grow">{r.title}</span>
                    <span className={train[r.key]?.trim() ? "done" : "todo"}>{train[r.key]?.trim() ? <><i className="dot" aria-hidden="true" /> Completed</> : "To do"}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className="card train-chat">
          <div className="chat-box">
            {current.turns.map((m, i) => <div key={i} className={m.from === "creator" ? "bubble mine" : "bubble"}><div>{m.text}</div><span>{m.from === "creator" ? "Creator" : "Fan"}</span></div>)}
          </div>
          <b>Your Response:</b>
          {editing === null ? (
            <>
              <p className={answer ? "train-answer" : "train-answer muted"}>{answer || "You have not answered this one yet."}</p>
              <div className="row">
                <button type="button" className="primary grow" onClick={() => setEditing(answer)}>{answer ? "Edit Response" : "Write Response"}</button>
                {current.itemId !== undefined && <button type="button" className="danger" onClick={() => void confirm("Delete this sample and its answer?").then((ok) => void (ok && remove(current.itemId!)))}>Delete sample</button>}
              </div>
            </>
          ) : (
            <>
              <textarea aria-label="Your response" autoFocus value={editing} onChange={(e) => setEditing(e.target.value)} />
              <div className="row"><button type="button" className="primary" onClick={() => void save1()}>Save Response</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
