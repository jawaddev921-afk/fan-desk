"use client";
import { useRouter } from "next/navigation";
import { AI_NAME } from "@/config/ai.ts";
import { useRefreshAccounts } from "@/features/accounts/components/useRefreshAccounts.ts";
import { useSession } from "@/features/accounts/components/session.tsx";
import type { MeView } from "@/features/accounts/types.ts";
import { useSync } from "@/features/inbox/components/useSync.tsx";
import { CheckIcon } from "@/components/common/icons.tsx";

// First-run checklist, worked out from what already exists (nothing is stored): a key, an account, loaded chats.
function setupSteps(me: MeView) {
  const fans = me.accounts.reduce((n, a) => n + (a.counts.total || 0), 0);
  return [
    { label: "Connect your key", doneLabel: "Key connected", title: "Connect your OFMAPI key", hint: "We check it with OFMAPI and store it encrypted.", done: !!me.connection },
    { label: "Find your account", doneLabel: "Account found", title: "Find your OnlyFans account", hint: "Connect the account inside OFMAPI first, then refresh the list here.", done: me.accounts.length > 0 },
    { label: "Load your chats", doneLabel: "Chats loaded", title: "Load your chats", hint: "Reads your conversations from OFMAPI. Nothing is sent, and it uses some of your credits.", done: fans > 0 },
  ];
}

// Finished steps shrink to one line; the next step gets the space and the one button that does it.
export function SetupCard({ welcome = false }: { welcome?: boolean }) {
  const { me } = useSession();
  const { refresh, busy: refreshing } = useRefreshAccounts();
  const { sync, busy: syncing } = useSync();
  const router = useRouter();
  if (!me) return null;

  const steps = setupSteps(me);
  const next = steps.findIndex((s) => !s.done);
  if (next === -1) return null;
  const s = steps[next];
  const running = me.accounts.some((a) => a.sync.status === "running"); // the first import is working in the background
  const empty = next === 2 && me.accounts.some((a) => a.sync.status === "done" && a.counts.total === 0); // imported already, and OFMAPI had no conversations

  return (
    <section className="card setup" aria-label="Setup progress">
      <ol className="stepper">
        {steps.map((x, i) => (
          <li key={x.label} className={x.done ? "done" : i === next ? "current" : ""} aria-current={i === next ? "step" : undefined}>
            <span className="dot">{x.done ? <CheckIcon /> : i + 1}</span>
            <span className="step-label">{x.done ? x.doneLabel : x.label}</span>
          </li>
        ))}
      </ol>
      <div className="next">
        <h2>{welcome && next === 0 ? "Welcome. " : ""}{empty ? "No conversations yet" : s.title}</h2>
        <p className="muted">{empty ? "OFMAPI found no chats on this account. When a fan messages you, press Check again. If you expected chats, make sure this key belongs to the creator account." : s.hint}</p>
        {next === 1 && (
          <div className="row"><button className="primary" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh accounts"}</button></div>
        )}
        {next === 2 && (
          <div className="row">
            <button
              className="primary"
              disabled={syncing || running}
              onClick={async () => {
                await sync({ quiet: true });
                router.push("/inbox");
              }}
            >
              {syncing || running ? "Loading chats…" : empty ? "Check again" : "Load chats"}
            </button>
            <button className="ghost" onClick={() => router.push("/inbox")}>Open inbox</button>
          </div>
        )}
        <p className="muted fine">{AI_NAME} stays off until you turn it on yourself.</p>
      </div>
    </section>
  );
}
