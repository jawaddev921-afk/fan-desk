"use client";
import { FlashNote } from "@/components/common/FlashNote.tsx";
import { AccountSelect } from "@/features/accounts/components/AccountSelect.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { ScriptsTab } from "@/features/creator/components/ScriptsTab.tsx";

export default function ScriptsPage() {
  const { account } = useSession();
  return (
    <div className="creator">
      <div className="row"><h2 className="grow">Scripts</h2><AccountSelect /></div>
      <FlashNote />
      {account ? <ScriptsTab key={account.accountId} accountId={account.accountId} creator={account.settings.name} changed={() => {}} /> : <div className="empty">No account yet. Connect your OFMAPI key first.</div>}
    </div>
  );
}
