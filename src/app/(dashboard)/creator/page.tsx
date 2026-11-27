"use client";
import { useSession } from "@/features/accounts/components/session.tsx";
import { CreatorScreen } from "@/features/creator/components/CreatorScreen.tsx";
import { FlashNote } from "@/components/common/FlashNote.tsx";

export default function CreatorPage() {
  const { account } = useSession();
  return (
    <div className="page wide">
      <FlashNote />
      {account ? <CreatorScreen key={account.accountId} accountId={account.accountId} /> : <div className="empty">No account yet. Connect your OFMAPI key first.</div>}
    </div>
  );
}
