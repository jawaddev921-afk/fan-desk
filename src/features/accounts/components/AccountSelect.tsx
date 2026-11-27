"use client";
import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/common/Select.tsx";
import { useSession } from "./session.tsx";

export function AccountSelect() {
  const { me, account, setAccountId } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  if (!me || !me.accounts.length) return null;
  return (
    <Select
      ariaLabel="Creator account"
      value={account?.accountId ?? ""}
      options={me.accounts.map((a) => ({ value: a.accountId, label: `${a.settings.name} (@${a.username || "?"})` }))}
      onChange={(id) => {
        setAccountId(id);
        if (pathname.startsWith("/inbox/")) router.push("/inbox"); // the open chat belongs to the old account
      }}
    />
  );
}
