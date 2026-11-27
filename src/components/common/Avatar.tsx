"use client";
import { useState } from "react";
import { avatarTone, initials } from "@/lib/client/format.ts";

/** The fan's photo when we have one (and it loads), else coloured initials. */
export function Avatar({ name, id, src }: { name: string | null | undefined; id: string; src?: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`av av${avatarTone(id || String(name))}`} aria-hidden="true">
      {initials(name)}
      {src && !broken && <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />}
    </span>
  );
}
