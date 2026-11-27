"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/common/Avatar.tsx";

/** The round profile picture in the top bar; opens a small card with who is logged in and Log out. */
export function ProfileMenu({ name, email, credits, onLogout }: { name: string | null; email: string; credits?: number | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="profile" ref={box}>
      <button type="button" className="profile-btn" aria-label="Your profile" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar name={name || email} id={email} />
      </button>
      {open && (
        <div className="profile-card" role="menu">
          <div className="profile-who"><Avatar name={name || email} id={email} /><div><b>{name || "Your account"}</b><span className="muted">{email}</span></div></div>
          {credits != null && <div className="profile-row"><span className="muted">OFMAPI credits</span><b>{credits}</b></div>}
          <button type="button" role="menuitem" className="danger" onClick={onLogout}>Log out</button>
        </div>
      )}
    </div>
  );
}
