"use client";
import { useRef, useState, type FormEvent } from "react";
import { AI_NAME } from "@/config/ai.ts";
import { CheckIcon } from "@/components/common/icons.tsx";
import { Select } from "@/components/common/Select.tsx";
import { ApiError, enc } from "@/lib/client/api.ts";
import type { AccountView, MeView } from "../types.ts";
import { useSession } from "./session.tsx";

type Row = { id: number; item: string; price: string; details: string };
type Status = { kind: "ok" | "err"; text: string } | null;

function Fields({ account }: { account: AccountView }) {
  const { call, run, setMe } = useSession();
  const s = account.settings;
  const [aiEnabled, setAiEnabled] = useState(account.aiEnabled);
  const [mode, setMode] = useState<"draft" | "auto">(account.sendMode);
  const [name, setName] = useState(s.name);
  const [persona, setPersona] = useState(s.persona);
  const [rows, setRows] = useState<Row[]>(() => s.menu.map((m, i) => ({ id: i, item: m.item, price: String(m.price), details: m.details ?? "" })));
  const nextId = useRef(rows.length);
  const [rules, setRules] = useState(s.rules.join("\n"));
  const [threshold, setThreshold] = useState(s.humanSpendThreshold == null ? "" : String(s.humanSpendThreshold));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const setRow = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    const menu = rows
      .map((r) => ({ item: r.item.trim(), price: Number(r.price), details: r.details.trim() }))
      .filter((m) => m.item)
      .map((m) => (m.details ? m : { item: m.item, price: m.price }));
    const body = {
      name,
      persona,
      menu,
      rules: rules.split("\n").map((x) => x.trim()).filter(Boolean),
      humanSpendThreshold: threshold.trim() === "" ? null : Number(threshold),
      ai_enabled: aiEnabled,
      send_mode: mode,
    };
    await run(async () => {
      try {
        const r = await call<{ me: MeView }>("PUT", `/api/accounts/${enc(account.accountId)}`, body);
        setMe(r.me);
        setStatus({ kind: "ok", text: "Saved." });
      } catch (err) {
        if (err instanceof ApiError && err.handled) throw err;
        // shown next to the button: the form is long, a message at the top would be off-screen
        setStatus({ kind: "err", text: err instanceof Error ? err.message : "Could not save." });
      }
    });
    setSaving(false);
  }

  return (
    <form id="settingsForm" className="card" onSubmit={onSubmit}>
      <h3 className="first">{AI_NAME}</h3>
      <div className="switch">
        <input type="checkbox" id="aiEnabled" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />
        <label htmlFor="aiEnabled" className="inline">{AI_NAME} is ON for this account</label>
      </div>
      <div className="two">
        <div>
          <label htmlFor="f-name">Creator name</label>
          <input id="f-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-mode">When AI replies</label>
          <Select id="f-mode" value={mode} onChange={(v) => setMode(v === "auto" ? "auto" : "draft")} options={[{ value: "draft", label: "Draft: a person approves each reply" }, { value: "auto", label: "Auto: send by itself (holds risky replies)" }]} />
        </div>
      </div>

      <h3>Voice</h3>
      <label htmlFor="f-persona">Tone and style</label>
      <textarea id="f-persona" value={persona} onChange={(e) => setPersona(e.target.value)} />

      <h3>Menu (the only items and prices the AI may quote)</h3>
      <div>
        {rows.map((r) => (
          <div className="menu-row" key={r.id}>
            <input aria-label="Item" placeholder="Item (e.g. Custom video)" value={r.item} onChange={(e) => setRow(r.id, { item: e.target.value })} />
            <input aria-label="Price" type="number" min="0" step="0.01" placeholder="Price $" value={r.price} onChange={(e) => setRow(r.id, { price: e.target.value })} />
            <input aria-label="Details" placeholder="Details (optional)" value={r.details} onChange={(e) => setRow(r.id, { details: e.target.value })} />
            <button type="button" aria-label="Remove this item" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRows((rs) => [...rs, { id: nextId.current++, item: "", price: "", details: "" }])}>+ Add item</button>

      <h3>Rules and hand-off</h3>
      <label htmlFor="f-rules">Rules (one per line)</label>
      <textarea id="f-rules" value={rules} onChange={(e) => setRules(e.target.value)} />
      <label htmlFor="f-threshold">Send fans who already spent at least this much straight to a human ($, empty = off)</label>
      <input id="f-threshold" type="number" min="0" step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />

      <div className="savebar">
        <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
        <span className="muted" role="status">
          {status?.kind === "ok" && <span className="ok-text"><CheckIcon /> {status.text}</span>}
          {status?.kind === "err" && <span className="err">{status.text}</span>}
        </span>
      </div>
    </form>
  );
}

export function SettingsForm() {
  const { account } = useSession();
  if (!account) return <div className="empty">No account yet. Connect your OFMAPI key first.</div>;
  return <Fields key={account.accountId} account={account} />;
}
