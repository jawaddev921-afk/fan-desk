"use client";
import { useState } from "react";

/** Reply yourself. Sending takes the fan over from the AI (the server does that). */
export function Composer({ onSend }: { onSend(text: string): Promise<boolean> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="composer">
      <textarea aria-label="Reply" placeholder="Reply yourself (takes over from the AI)" value={text} onChange={(e) => setText(e.target.value)} />
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          const t = text.trim();
          if (!t) return;
          setBusy(true);
          if (await onSend(t)) setText("");
          setBusy(false);
        }}
      >
        Send
      </button>
    </div>
  );
}
