"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { WarnIcon } from "./icons.tsx";
import { Modal } from "./Modal.tsx";

type Ask = { kind: "confirm"; text: string; yes: string } | { kind: "prompt"; text: string; yes: string };
type Api = { confirm: (text: string, yes?: string) => Promise<boolean>; prompt: (text: string) => Promise<string | null> };
const Ctx = createContext<Api | null>(null);

/** In-app replacements for window.confirm / window.prompt: `await confirm("Delete it?")`. */
export function useDialogs(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useDialogs must be used inside <DialogProvider>");
  return api;
}

/** The one yes/no box: a warning icon, a title, a line of text and two buttons (`danger` makes the yes button red). */
export function ConfirmBox({ title = "Are you sure?", text, sub, yes, no = "Cancel", danger = true, onYes, onNo }: { title?: string; text: string; sub?: string; yes: string; no?: string; danger?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <Modal size="sm" title={title} onClose={onNo} footer={<><button type="button" onClick={onNo}>{no}</button><button type="submit" form="dialog-form" autoFocus className={danger ? "danger" : "primary"}>{yes}</button></>}>
      <form id="dialog-form" className="confirm-body" onSubmit={(e) => { e.preventDefault(); onYes(); }}>
        <span className={danger ? "confirm-icon danger" : "confirm-icon"} aria-hidden="true"><WarnIcon /></span>
        <div><p>{text}</p>{sub && <p className="muted">{sub}</p>}</div>
      </form>
    </Modal>
  );
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [text, setText] = useState("");
  const done = useRef<(v: string | boolean | null) => void>(() => {});
  const open = useCallback((a: Ask) => new Promise<string | boolean | null>((resolve) => { done.current = resolve; setText(""); setAsk(a); }), []);
  const api = useRef<Api>({
    confirm: async (t, yes = "Delete") => (await open({ kind: "confirm", text: t, yes })) === true,
    prompt: async (t) => { const v = await open({ kind: "prompt", text: t, yes: "OK" }); return typeof v === "string" ? v : null; },
  }).current;
  const close = (v: string | boolean | null) => { done.current(v); done.current = () => {}; setAsk(null); };
  const isPrompt = ask?.kind === "prompt";
  return (
    <Ctx.Provider value={api}>
      {children}
      {ask && !isPrompt && <ConfirmBox text={ask.text} yes={ask.yes} onYes={() => close(true)} onNo={() => close(false)} />}
      {ask && isPrompt && (
        <Modal size="sm" title={ask.text} onClose={() => close(null)}
          footer={<><button type="button" onClick={() => close(null)}>Cancel</button><button type="submit" form="dialog-form" className="primary" disabled={!text.trim()}>{ask.yes}</button></>}>
          <form id="dialog-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) close(text.trim()); }}>
            <input autoFocus aria-label={ask.text} value={text} onChange={(e) => setText(e.target.value)} />
          </form>
        </Modal>
      )}
    </Ctx.Provider>
  );
}
