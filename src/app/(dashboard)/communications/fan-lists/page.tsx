"use client";
import { useSession } from "@/features/accounts/components/session.tsx";
import { FanListsPage } from "../FanListsPage.tsx";

export default function Page() {
  const { account } = useSession();
  return <div className="creator">{account ? <FanListsPage key={account.accountId} accountId={account.accountId} /> : <div className="empty">No account yet. Connect your OFMAPI key first.</div>}</div>;
}
