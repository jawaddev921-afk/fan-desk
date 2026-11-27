"use client";
import { Loading } from "@/components/common/Loading.tsx";
import Link from "next/link";
import { AI_NAME } from "@/config/ai.ts";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Avatar } from "@/components/common/Avatar.tsx";
import { AccountSelect } from "@/features/accounts/components/AccountSelect.tsx";
import { ArrowLeftIcon, BookIcon, ImageIcon, MegaphoneIcon, SparkIcon, UserIcon } from "@/components/common/icons.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import type { MeView } from "@/features/accounts/types.ts";
import { enc } from "@/lib/client/api.ts";
import { bioPercent } from "../schema.ts";
import type { CreatorView } from "../types.ts";
import { BioTab } from "./BioTab.tsx";
import { BumpsTab } from "./BumpsTab.tsx";
import { ProductsTab } from "./ProductsTab.tsx";
import { ScriptsTab } from "./ScriptsTab.tsx";
import { AdvancedDrawer } from "./AdvancedDrawer.tsx";
import { TargetingDrawer } from "./TargetingDrawer.tsx";
import { TryWriter } from "./TryWriter.tsx";

type Tab = "bio" | "products" | "bumps" | "scripts";

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
}

export function CreatorScreen({ accountId }: { accountId: string }) {
  const { account, call, run, setMe } = useSession();
  const [view, setView] = useState<CreatorView | null>(null);
  const [tab, setTab] = useState<Tab>("bio");
  const [trying, setTrying] = useState(false);
  const [drawer, setDrawer] = useState<"chats" | "bump" | "advanced" | null>(null);
  const base = `/api/accounts/${enc(accountId)}/creator`;

  const reload = useCallback(() => run(async () => setView(await call<CreatorView>("GET", base))), [base, call, run]);
  useEffect(() => { void reload(); }, [reload]);
  if (!view || !account) return <Loading />;

  const patch = (p: Partial<CreatorView>) => setView({ ...view, ...p });
  const flag = (body: { enabled?: boolean; bump?: boolean; handleChats?: boolean }) => run(async () => {
    setMe((await call<{ me: MeView }>("PUT", `${base}/flags`, body)).me);
    await reload();
  });
  const off = !view.flags.enabled;
  const tabs: { id: Tab; title: string; icon: ReactNode; badge: string }[] = [
    { id: "bio", title: "Bio", icon: <UserIcon />, badge: `${bioPercent(view.values)}%` },
    { id: "products", title: "Products", icon: <ImageIcon />, badge: String(view.counts.product) },
    { id: "bumps", title: "Bump messages", icon: <MegaphoneIcon />, badge: String(view.counts.bump) },
    { id: "scripts", title: "Scripts", icon: <BookIcon />, badge: String(view.counts.script) },
  ];

  return (
    <div className="creator">
      <div className="row">
        <Link className="icon-link" href="/inbox" aria-label="Back to the inbox"><ArrowLeftIcon /></Link>
        <h2 className="grow">Setup for {account.settings.name}</h2>
        <button type="button" onClick={() => setDrawer("advanced")}>Advanced Settings</button>
        <AccountSelect />
      </div>

      <section className="card ai-card">
        <div className="ai-top">
          <Avatar name={account.settings.name} id={accountId} src={account.hasAvatar ? `/api/accounts/${enc(accountId)}/photo` : null} />
          <div className="grow">
            <h3 className="first">{AI_NAME} AI chatter</h3>
            <p className="muted">{AI_NAME} writes draft replies in {account.settings.name}&apos;s voice, bumps fans, and suggests what to sell. You approve every draft.</p>
          </div>
          <button type="button" onClick={() => setTrying(true)}>Try {AI_NAME}</button>
          <Toggle label={`${AI_NAME} on`} checked={view.flags.enabled} onChange={(enabled) => void flag({ enabled })} />
        </div>
        <div className={off ? "ai-subs off" : "ai-subs"}>
          <div className="card sub">
            <div className="ai-top"><SparkIcon /><div className="grow"><b>Handle chats with AI</b><p className="muted">Write a draft reply to every fan message, in the creator&apos;s tone, and suggest products to sell.</p></div><Toggle label="Handle chats with AI" checked={account.aiEnabled} disabled={off} onChange={(handleChats) => void flag({ handleChats })} /></div>
            <button type="button" className="link-btn" onClick={() => setDrawer("chats")}><UserIcon /> Choose who {AI_NAME} messages</button>
          </div>
          <div className="card sub">
            <div className="ai-top"><MegaphoneIcon /><div className="grow"><b>Bump fans</b><p className="muted">Message fans the moment they come online, tip, or engage with posts.</p></div><Toggle label="Bump fans" checked={view.flags.bump} disabled={off} onChange={(bump) => void flag({ bump })} /></div>
            <button type="button" className="link-btn" onClick={() => setDrawer("bump")}><UserIcon /> Exclude fans from Bump</button>
          </div>
        </div>
      </section>

      <div className="tabs-row" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab-btn" onClick={() => setTab(t.id)}>{t.icon}<span>{t.title}</span><span className="badge">{t.badge}</span></button>
        ))}
      </div>

      {tab === "bio" && <BioTab key={accountId} accountId={accountId} view={view} patch={patch} reload={reload} />}
      {tab === "products" && <ProductsTab accountId={accountId} accountName={account.settings.name} changed={reload} />}
      {tab === "bumps" && <BumpsTab accountId={accountId} changed={reload} />}
      {trying && <TryWriter accountId={accountId} creator={account.settings.name} view={view} handleChats={account.aiEnabled} onClose={() => setTrying(false)} />}
      {drawer === "advanced" && <AdvancedDrawer accountId={accountId} name={AI_NAME} value={view.advanced} nicknames={Array.isArray(view.values.fan_nicknames) ? view.values.fan_nicknames : []} changed={reload} onClose={() => setDrawer(null)} />}
      {drawer === "chats" && <TargetingDrawer kind="chats" accountId={accountId} name={AI_NAME} value={view.targeting.chats} changed={reload} onClose={() => setDrawer(null)} />}
      {drawer === "bump" && <TargetingDrawer kind="bump" accountId={accountId} name={AI_NAME} value={view.targeting.bump} changed={reload} onClose={() => setDrawer(null)} />}
      {tab === "scripts" && <ScriptsTab accountId={accountId} changed={reload} />}
    </div>
  );
}
