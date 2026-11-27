"use client";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useRouter } from "next/navigation";
import { AI_NAME } from "@/config/ai.ts";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/common/Avatar.tsx";
import type { MeView } from "../types.ts";
import { useSession } from "./session.tsx";
import { useRefreshAccounts } from "./useRefreshAccounts.ts";

type SaveResult = { imported: { imported: number; conflicts: string[] }; me: MeView };

function KeyForm({ label, submitLabel, placeholder }: { label: string; submitLabel: string; placeholder?: string }) {
  const { call, run, setMe, setFlash } = useSession();
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await run(async () => {
      const r = await call<SaveResult>("PUT", "/api/connection", { apiKey: key });
      setKey("");
      setMe(r.me);
      const c = r.imported;
      setFlash({ kind: "ok", text: `Key saved. ${c.imported} account(s) imported${c.conflicts.length ? `, ${c.conflicts.length} already used by someone else` : ""}.` });
      if (r.me.accounts.length) router.push("/inbox");
    });
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="apiKey">{label}</label>
      <input id="apiKey" name="apiKey" type="password" autoComplete="off" placeholder={placeholder} required value={key} onChange={(e) => setKey(e.target.value)} />
      <div className="row mt10">
        <button className="primary" type="submit" disabled={busy}>{busy ? "Checking…" : submitLabel}</button>
      </div>
    </form>
  );
}

export function ConnectionView() {
  const { confirm } = useDialogs();
  const { me, call, run, setMe, setFlash } = useSession();
  const { refresh, busy: refreshing } = useRefreshAccounts();
  const [replacing, setReplacing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const c = me?.connection;
  if (!me) return null;

  if (!c) {
    return (
      <div className="card">
        <h2>Connect your OFMAPI key</h2>
        <ol className="steps">
          <li>Sign up at <a href="https://app.onlyfansapi.com" target="_blank" rel="noreferrer">app.onlyfansapi.com</a> and connect the OnlyFans account there.</li>
          <li>Open <b>API Keys</b> → <b>Create API Key</b> and copy it (it is shown only once).</li>
          <li>Paste it below. Give the key only the access you need.</li>
        </ol>
        <KeyForm label="OFMAPI key" submitLabel="Connect" placeholder="ofmapi_..." />
        <div className="muted mt10">We check the key with OFMAPI, store it encrypted, and import your connected accounts. {AI_NAME} stays off until you turn it on.</div>
      </div>
    );
  }

  const wh = c.webhook;
  return (
    <>
      <div className="card">
        <div className="row"><h2 className="grow">OFMAPI connection</h2><span className="pill ok">Connected</span></div>
        <div>Key ending <code>…{c.keyLast4}</code>{c.teamName && <> · team <b>{c.teamName}</b></>}{c.creditsBalance != null && ` · ${c.creditsBalance} credits left`}</div>
        <div className="muted">Your key is stored encrypted on the server and is never shown again.</div>
        <div className="row mt12">
          <button onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh accounts"}</button>
          <button onClick={() => setReplacing((v) => !v)} aria-expanded={replacing}>Replace key</button>
          <button
            className="danger"
            onClick={() =>
              void run(async () => {
                if (!(await confirm("Remove your OFMAPI key and delete its chats from Fan Desk? The AI will stop replying. You can connect again and the last 90 days are imported again.", "Disconnect"))) return;
                const r = await call<{ me: MeView }>("DELETE", "/api/connection");
                setMe(r.me);
              })
            }
          >
            Disconnect
          </button>
        </div>
        {replacing && <div className="mt10"><KeyForm label="New OFMAPI key" submitLabel="Save key" /></div>}
      </div>

      <div className="card">
        <div className="row"><h2 className="grow">Live messages</h2>{wh.registered ? <span className="pill ok">Live</span> : <span className="pill warn">Manual sync only</span>}</div>
        {wh.registered ? <div className="ok">Webhook registered. New fan messages arrive instantly.</div> : <div className="muted">No webhook yet, so new messages arrive when you press Sync in the Inbox (it uses credits).</div>}
        {wh.error && <div className="err">{wh.error}</div>}
        {!wh.publicUrlConfigured ? (
          wh.registered ? null : <div className="note">This server has no public HTTPS address configured (<code>PUBLIC_URL</code>), so a webhook cannot be registered yet.</div>
        ) : (
          <div className="muted">Endpoint: <code>{wh.url}</code></div>
        )}
        <div className="row mt10">
          <button
            className="primary"
            disabled={!wh.publicUrlConfigured || registering}
            onClick={async () => {
              setRegistering(true);
              await run(async () => {
                const r = await call<{ me: MeView }>("POST", "/api/connection/webhook");
                setMe(r.me);
                setFlash({ kind: "ok", text: "Webhook registered." });
              });
              setRegistering(false);
            }}
          >
            {wh.registered ? "Re-register webhook" : "Register webhook"}
          </button>
        </div>
        <div className="muted mt8">Webhooks need an OFMAPI plan that includes them.</div>
      </div>

      <div className="card">
        <h2>Connected OnlyFans accounts</h2>
        {me.accounts.length ? (
          me.accounts.map((a) => (
            <div className="row acct-row" key={a.accountId}>
              <Avatar name={a.settings.name} id={a.accountId} />
              <b>{a.settings.name}</b>
              <span className="muted">@{a.username || "?"} · {a.accountId}</span>
              {a.note && <span className="warn">{a.note}</span>}
            </div>
          ))
        ) : (
          <div className="muted">None found. Connect an OnlyFans account inside OFMAPI, then press “Refresh accounts”.</div>
        )}
      </div>
    </>
  );
}
