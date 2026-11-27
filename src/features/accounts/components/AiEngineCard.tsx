"use client";
import { useState, type FormEvent } from "react";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { EyeIcon, EyeOffIcon, LockIcon, SparkIcon } from "@/components/common/icons.tsx";
import { AI_NAME } from "@/config/ai.ts";
import type { MeView } from "../types.ts";
import { useSession } from "./session.tsx";

/** Which engine writes the drafts, and where a user adds their own Claude key. With a key, every draft for their accounts is written by Claude on that key. */
export function AiEngineCard() {
  const { me, call, run, setMe, setFlash } = useSession();
  const { confirm } = useDialogs();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const mine = me.aiKey;
  const server = me.aiProvider === "ollama" ? `Local model (${me.aiModel})` : `Server key (${me.aiModel})`;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    await run(async () => {
      const r = await call<{ me: MeView }>("PUT", "/api/ai-key", { apiKey: key });
      setKey("");
      setShow(false);
      setMe(r.me);
      setFlash({ kind: "ok", text: `Claude key saved. ${AI_NAME} now writes with it.` });
    });
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirm(`Remove your Claude key? ${AI_NAME} goes back to the server's model.`, "Remove key"))) return;
    await run(async () => {
      const r = await call<{ me: MeView }>("DELETE", "/api/ai-key");
      setMe(r.me);
      setFlash({ kind: "ok", text: "Claude key removed." });
    });
  };

  return (
    <section className="card engine" aria-labelledby="engine-title">
      <div className="engine-head">
        <span className="engine-icon" aria-hidden="true"><SparkIcon /></span>
        <div className="grow">
          <h3 id="engine-title">{AI_NAME} writes with</h3>
          <p className="muted">Add your own Claude API key and every draft for your accounts is written by Claude. Without one, the server&apos;s model is used.</p>
        </div>
        {mine ? <span className="pill ok">Claude · your key</span> : <span className="pill warn">{server}</span>}
      </div>

      {mine ? (
        <div className="engine-key">
          <div className="grow">
            <b>Key ending <code>…{mine.last4}</code></b>
            <p className="muted">Stored encrypted. It is never shown again. Model: <code>{me.aiProvider === "claude" ? me.aiModel : "claude-sonnet-5-5"}</code></p>
          </div>
          <button type="button" className="danger" onClick={() => void remove()}>Remove key</button>
        </div>
      ) : null}

      <form className="engine-form" onSubmit={save}>
        <label htmlFor="claude-key">{mine ? "Replace your Claude key" : "Your Claude API key"}</label>
        <div className="engine-input">
          <input id="claude-key" type={show ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="sk-ant-..." value={key} onChange={(e) => setKey(e.target.value)} />
          <button type="button" className="ghost" aria-label={show ? "Hide the key" : "Show the key"} onClick={() => setShow(!show)}>{show ? <EyeOffIcon /> : <EyeIcon />}</button>
          <button type="submit" className="primary" disabled={busy || !key.trim()}>{busy ? "Checking…" : mine ? "Replace key" : "Save key"}</button>
        </div>
        <p className="muted fine">Get a key at console.anthropic.com. We check it with Anthropic before saving.</p>
      </form>

      <ul className="engine-facts">
        <li><LockIcon /> <span>Your key is encrypted on our server and only its last 4 characters are ever shown.</span></li>
        <li><LockIcon /> <span>The chat of an account is sent to Anthropic only to write that account&apos;s drafts. Nothing is sent without a draft being asked for.</span></li>
        <li><LockIcon /> <span>A person approves every draft. Remove the key any time and {AI_NAME} falls back to the server&apos;s model.</span></li>
      </ul>
    </section>
  );
}
