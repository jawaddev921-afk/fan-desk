"use client";
import { Pager, usePaging } from "@/components/common/Pager.tsx";
import { Loading } from "@/components/common/Loading.tsx";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useState, type FormEvent } from "react";
import { AI_NAME } from "@/config/ai.ts";
import { BulbIcon } from "@/components/common/icons.tsx";
import { Select } from "@/components/common/Select.tsx";
import { MAX_LIVE_UPDATES } from "../schema.ts";
import type { ItemData } from "../types.ts";
import { useItems } from "./useItems.tsx";

const DAY = 24 * 60 * 60 * 1000;
const STATUS = [{ value: "", label: "All statuses" }, { value: "Active", label: "Active" }, { value: "Expired", label: "Expired" }, { value: "Off", label: "Off" }];
const DURATIONS = [{ value: "1", label: "1 day" }, { value: "3", label: "3 days" }, { value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }];

export function UpdatesPanel({ accountId, changed }: { accountId: string; changed: () => void }) {
  const { confirm } = useDialogs();
  const { items, save, remove } = useItems(accountId, "update", changed);
  const [showInactive, setShowInactive] = useState(false);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<{ content: string; days: string } | null>(null);
  const list = items ?? [];
  const now = Date.now();
  const active = list.filter((i) => i.live && i.data.endsAt > now);
  const stateOf = (u: (typeof list)[number]) => (!u.live ? "Off" : u.data.endsAt > now ? "Active" : "Expired");
  const shown = (showInactive || status ? list : active).filter((u) => !status || stateOf(u) === status);
  const { slice: pageRows, pager } = usePaging(shown);
  if (!items) return <Loading />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft?.content.trim()) return;
    void save(null, true, { content: draft.content, endsAt: now + Number(draft.days) * DAY, startsAt: now } as ItemData["update"]).then(() => setDraft(null));
  };

  return (
    <div className="bio-panel card">
      <div className="tip"><BulbIcon /><div><b>Live updates for {AI_NAME}</b><p>Short-lived context {AI_NAME} should know about: recent collabs, personal updates, today&apos;s plans. They expire on their own or can be turned off any time.</p></div></div>
      <div className="tab-head">
        <div>
          <b>You have {active.length} active live update{active.length === 1 ? "" : "s"}</b>
          <div className="muted">You can have up to {MAX_LIVE_UPDATES} active live updates at a time.</div>
        </div>
        <div className="row">
          <Select ariaLabel="Filter by status" value={status} onChange={setStatus} options={STATUS} />
          <label className="inline muted"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
          <button type="button" className="primary" onClick={() => setDraft({ content: "", days: "7" })}>New live update</button>
        </div>
      </div>
      {draft && (
        <form className="card" onSubmit={submit}>
          <label htmlFor="up-content">What should {AI_NAME} know?</label>
          <textarea id="up-content" autoFocus value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
          <label htmlFor="up-days">Keep it active for</label>
          <Select id="up-days" value={draft.days} onChange={(days) => setDraft({ ...draft, days })} options={DURATIONS} />
          <div className="savebar"><button className="primary" type="submit">Add live update</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
        </form>
      )}
      {shown.length === 0 ? (
        <div className="empty">No active live updates.<br />Add short-lived context for {AI_NAME} (a promo, a collab, today&apos;s plans, your latest post).</div>
      ) : (
        <>
        <table className="data-table">
          <thead><tr><th>Content</th><th>Status</th><th>Time range</th><th>Live</th><th></th></tr></thead>
          <tbody>
            {pageRows.map((u) => (
              <tr key={u.id}>
                <td>{u.data.content}</td>
                <td>{stateOf(u)}</td>
                <td>{u.data.startsAt ? `${new Date(u.data.startsAt).toLocaleDateString()} – ` : "Until "}{new Date(u.data.endsAt).toLocaleDateString()}</td>
                <td><input type="checkbox" aria-label="Live" checked={u.live} onChange={(e) => void save(u.id, e.target.checked, u.data)} /></td>
                <td className="row-actions"><button className="danger" onClick={() => void confirm("Delete this live update?").then((ok) => void (ok && remove(u.id)))}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager {...pager} />
        </>
      )}
    </div>
  );
}
