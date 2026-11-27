"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons.tsx";

/** A dialog (the browser traps focus and closes it on Esc). `size`: a small box, a centred box, a large box, or a panel on the right. */
export function Modal({ title, extra, onClose, children, footer, size = "md" }: { title: ReactNode; extra?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" | "drawer" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className={`modal ${size}`} aria-label={typeof title === "string" ? title : undefined} onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <header className="modal-head">
        <h3>{title}</h3>
        {extra}
        <button type="button" className="ghost modal-x" aria-label="Close" onClick={() => ref.current?.close()}><CloseIcon /></button>
      </header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-foot">{footer}</footer>}
    </dialog>
  );
}
