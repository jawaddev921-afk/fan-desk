"use client";
import { Loading } from "@/components/common/Loading.tsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/features/accounts/components/session.tsx";
import { ProfileMenu } from "./ProfileMenu.tsx";
import { TABS } from "@/config/navigation.ts";

/** The top bar and the page area shared by every dashboard page. */
export function Shell({ children }: { children: ReactNode }) {
  const { me, loading, call } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const needsKey = !!me && !me.connection && pathname !== "/connection";

  // Nothing works before a OFMAPI key is connected, so every other page sends the user to the connection page.
  useEffect(() => {
    if (needsKey) router.replace("/connection");
  }, [needsKey, router]);

  if (loading || !me || needsKey) return <Loading full />;

  const waiting = me.accounts.reduce((n, a) => n + a.counts.pending, 0);
  const credits = me.connection?.creditsBalance;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand"><span className="logo" aria-hidden="true" />Fan Desk</span>
        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
            const count = t.href === "/inbox" ? waiting : 0;
            return (
              <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                {t.label}
                {count > 0 && <span className="count" aria-label={`${count} waiting`}>{count}</span>}
              </Link>
            );
          })}
        </nav>
        <span className="grow" />
        {credits != null && <span className="chip" title="OFMAPI credits left">{credits} credits</span>}
        <ProfileMenu name={me.name} email={me.email} credits={credits} onLogout={async () => { await call("POST", "/api/auth/logout").catch(() => {}); router.replace("/login"); }} />
      </header>
      <div className="content">{children}</div>
    </div>
  );
}
