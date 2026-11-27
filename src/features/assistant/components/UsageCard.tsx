"use client";
import { useEffect, useState } from "react";
import { enc } from "@/lib/client/api.ts";
import { useSession } from "@/features/accounts/components/session.tsx";
import type { UsageView } from "../types.ts";

export function UsageCard() {
  const { account, call } = useSession();
  const accountId = account?.accountId;
  const [usage, setUsage] = useState<UsageView | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    call<UsageView>("GET", `/api/accounts/${enc(accountId)}/usage`).then((u) => live && setUsage(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [accountId, call]);

  return (
    <div className="card">
      <h2>AI usage, last 30 days</h2>
      <div className="muted">
        {!usage ? "Loading…" : usage.byModel.length ? (
          <>
            {usage.byModel.map((r) => (
              <div key={r.model}>{r.model}: {r.calls} calls, {r.input} in / {r.output} out tokens</div>
            ))}
            <b>Estimated cost: ${usage.estimatedCostUsd}</b> (list prices)
          </>
        ) : (
          "No AI calls yet."
        )}
      </div>
    </div>
  );
}
