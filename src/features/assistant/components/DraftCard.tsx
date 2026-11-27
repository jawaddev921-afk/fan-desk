"use client";
import { useRef } from "react";
import type { OutboxView } from "../types.ts";

/** An AI draft waiting for approval, or a send that failed / has an unknown result. */
export function DraftCard({ item, busy, onApprove, onReject }: { item: OutboxView; busy: boolean; onApprove(text: string): void; onReject(): void }) {
  const text = useRef<HTMLTextAreaElement>(null);
  const draft = item.status === "draft";
  return (
    <div className="draft">
      <div className="label">
        {draft ? (
          <>
            AI draft: not sent until you approve
            {item.error && <span className="warn"> · {item.error}</span>}
          </>
        ) : (
          `${item.status}: ${item.error} (check OnlyFans before resending)`
        )}
      </div>
      {draft ? (
        <>
          {/* uncontrolled on purpose: the list reloads every few seconds and must not overwrite what is being edited */}
          <textarea ref={text} defaultValue={item.text} aria-label="Edit the AI draft" />
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => onApprove(text.current?.value ?? item.text)}>Approve &amp; send</button>
            <button className="ghost" disabled={busy} onClick={onReject}>Reject</button>
          </div>
        </>
      ) : (
        <>
          <div className="msg out">{item.text}</div>
          <div className="row"><button disabled={busy} onClick={onReject}>Dismiss</button></div>
        </>
      )}
    </div>
  );
}
