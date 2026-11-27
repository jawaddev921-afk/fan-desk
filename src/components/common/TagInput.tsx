"use client";
import { useState, type KeyboardEvent } from "react";
import { CloseIcon } from "./icons.tsx";

/** Chips with a text box: Enter or a comma adds, Backspace on an empty box removes the last one. */
export function TagInput({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((x) => x.trim()).filter((x) => x && !value.includes(x));
    if (parts.length) onChange([...value, ...parts]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="tags">
      {value.map((t) => (
        <span className="input-tag" key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><CloseIcon /></button></span>
      ))}
      <input id={id} value={draft} placeholder={value.length ? "" : (placeholder ?? "Type here and press Enter to add")} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add} />
    </div>
  );
}
