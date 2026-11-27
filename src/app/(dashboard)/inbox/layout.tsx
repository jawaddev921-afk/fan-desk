"use client";
import { Loading } from "@/components/common/Loading.tsx";
import { useSelectedLayoutSegment } from "next/navigation";
import { AI_NAME } from "@/config/ai.ts";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccountSelect } from "@/features/accounts/components/AccountSelect.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { FanListItem } from "@/features/inbox/components/FanListItem.tsx";
import { useSync, useSyncState } from "@/features/inbox/components/useSync.tsx";
import type { FanRow } from "@/features/inbox/types.ts";
import { enc } from "@/lib/client/api.ts";
import { FlashNote } from "@/components/common/FlashNote.tsx";
import { SetupCard } from "../SetupCard.tsx";
import { InboxContext } from "./inbox-context.tsx";

const TIERS = [["", "All"], ["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"]] as const;

// The list stays mounted while the right side changes between /inbox (nothing chosen) and /inbox/<fan>.
export default function InboxLayout({ children }: { children: ReactNode }) {
  const { account, call, refreshMe } = useSession();
  const { lastSync } = useSyncState();
  const segment = useSelectedLayoutSegment(); // the fan id when a conversation is open
  const { sync, busy } = useSync();
  const [tier, setTier] = useState("");
  const [fans, setFans] = useState<FanRow[] | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const accountId = account?.accountId;

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    const load = () =>
      call<FanRow[]>("GET", `/api/accounts/${enc(accountId)}/fans${tier ? `?tier=${tier}` : ""}`)
        .then((f) => live && setFans(f))
        .catch(() => {});
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [accountId, tier, version, lastSync?.at, call]);

  const value = useMemo(() => ({ reload }), [reload]);

  // While the first import runs in the background, keep its progress fresh (the chat list reloads itself every few seconds).
  const importing = account?.sync.status === "running";
  useEffect(() => {
    if (!importing) return;
    const t = setInterval(() => void refreshMe().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [importing, refreshMe]);

  // A key without an account (or a first run): show the checklist with the button for the next step instead of a dead end.
  if (!account) return <div className="page"><FlashNote /><SetupCard /></div>;

  const need = (fans ?? []).filter((f) => f.pending).length;
  return (
    <InboxContext.Provider value={value}>
      <div className={`inbox${segment ? " has-fan" : ""}`}>
        <aside>
          <div className="toolbar">
            <div className="row">
              <AccountSelect />
              <button className="ghost" disabled={busy} onClick={() => void sync()} title="Fetch every chat and its full conversation history from OFMAPI (uses credits)">
                {busy ? "Syncing…" : "Sync"}
              </button>
            </div>
            <div className="seg" role="group" aria-label="Filter by tier">
              {TIERS.map(([value, label]) => (
                <button key={value} aria-pressed={tier === value} className={tier === value ? "active" : ""} onClick={() => setTier(value)}>{label}</button>
              ))}
            </div>
            <div className="queue">
              {fans && (need ? <><b>{need}</b> waiting for you</> : fans.length ? "Nothing waiting for you" : "")}
            </div>
          </div>
          {account.sync.status === "running" && (
            <div className="note">Importing the last {account.sync.windowDays} days in the background: {account.sync.chats} chats and {account.sync.messages} messages so far. New chats appear here as they are read.</div>
          )}
          {account.sync.status === "failed" && <div className="note">The import stopped: {account.sync.error ?? "an error"}. Press Sync to try again.</div>}
          {account.note && <div className="note">{account.note}</div>}
          {!account.aiEnabled && <div className="note">AI is OFF for this account. Turn it on in the {AI_NAME} tab.</div>}
          <FlashNote />
          <div>
            {fans === null ? (
              <Loading />
            ) : fans.length ? (
              fans.map((f) => (
                <FanListItem
                  key={f.fan_id}
                  fan={f}
                  selected={segment === f.fan_id}
                  summary={f.ai_summary || f.intent}
                  tags={
                    <>
                      {f.pending > 0 && <span className="tag need">{f.pending} to review</span>}
                      {f.mode === "human" && <span className="tag human">with a human</span>}
                    </>
                  }
                />
              ))
            ) : tier ? (
              <div className="empty muted">No {tier} fans right now.</div>
            ) : (
              <div className="empty">
                <b>No chats loaded yet.</b>
                <div className="muted mt8">Press Load chats to read your conversations from OFMAPI. Nothing is sent, and it uses some credits.</div>
                <div className="mt10"><button className="primary" disabled={busy} onClick={() => void sync()}>{busy ? "Syncing…" : "Load chats"}</button></div>
              </div>
            )}
          </div>
        </aside>
        <section className="detail">{children}</section>
      </div>
    </InboxContext.Provider>
  );
}
