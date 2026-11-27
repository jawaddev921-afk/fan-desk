"use client";
import { useClient } from "@/lib/client/client.tsx";

/** The message from the last action ("Settings saved", an error, ...). It clears itself after a few seconds. */
export function FlashNote() {
  const { flash } = useClient();
  if (!flash) return null;
  return (
    <div className={flash.kind === "err" ? "err" : "ok"} role={flash.kind === "err" ? "alert" : "status"}>
      {flash.text}
    </div>
  );
}
