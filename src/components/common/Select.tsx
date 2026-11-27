"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon } from "./icons.tsx";

export type Option = { value: string; label: string; hint?: string; badge?: string; icon?: string; meta?: string };

/** A dropdown we draw ourselves: the browser's own list cannot be styled. Keys: arrows, Home/End, Enter or Space, Esc. */
export function Select({ id, value, options, onChange, ariaLabel, placeholder = "Choose…" }: { id?: string; value: string; options: Option[]; onChange: (value: string) => void; ariaLabel?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const list = useId();
  const selected = options.findIndex((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { if (open) document.getElementById(`${list}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [open, active, list]);

  const show = () => { setActive(Math.max(selected, 0)); setOpen(true); };
  const pick = (i: number) => { onChange(options[i]!.value); setOpen(false); };
  const onKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) show(); else setActive((i) => Math.min(last, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))); }
    else if (open && (e.key === "Home" || e.key === "End")) { e.preventDefault(); setActive(e.key === "Home" ? 0 : last); }
    else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // type-ahead: typing "uni" jumps to the first choice that starts with it (the long lists are otherwise a lot of scrolling)
      const now = Date.now();
      typed.current = { text: (now - typed.current.at > 700 ? "" : typed.current.text) + e.key.toLowerCase(), at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) { if (!open) show(); setActive(hit); }
    }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (open) pick(active); else show(); }
  };

  return (
    <div className="dd" ref={root}>
      <button type="button" id={id} className="dd-btn" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={list} aria-label={ariaLabel} aria-activedescendant={open ? `${list}-${active}` : undefined} onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}>
        <span className={selected < 0 ? "dd-ph" : "dd-val"}>{selected >= 0 && options[selected]!.icon && <i className="dd-icon">{options[selected]!.icon}</i>}{selected < 0 ? placeholder : options[selected]!.label}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <ul id={list} role="listbox" className="dd-list" aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li key={o.value} id={`${list}-${i}`} role="option" aria-selected={i === selected} data-active={i === active} onPointerEnter={() => setActive(i)} onClick={() => pick(i)}>
              <span className="dd-text"><span>{o.icon && <i className="dd-icon">{o.icon}</i>}{o.label}{o.badge && <em className="beta">{o.badge}</em>}</span>{o.hint && <small>{o.hint}</small>}</span>
              {o.meta && <small className="dd-meta">{o.meta}</small>}
              {i === selected && <CheckIcon />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
