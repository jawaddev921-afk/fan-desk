"use client";
import { useState } from "react";
import { FlashNote } from "@/components/common/FlashNote.tsx";
import { AccountSelect } from "@/features/accounts/components/AccountSelect.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { FlowScreen } from "@/features/creator/components/FlowScreen.tsx";

export default function FlowsPage() {
  const { account } = useSession();
  const [editing, setEditing] = useState(false);
  return (
    <div className="creator">
      {!editing && <div className="row"><h2 className="grow">Message Flow <span className="muted">for {account?.settings.name ?? "…"}</span></h2><AccountSelect /></div>}
      <FlashNote />
      {account ? <FlowScreen key={account.accountId} accountId={account.accountId} accountName={account.settings.name} onEditing={setEditing} /> : <div className="empty">No account yet. Connect your OFMAPI key first.</div>}
    </div>
  );
}
