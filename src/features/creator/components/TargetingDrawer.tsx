"use client";
import { useState, type ReactNode } from "react";
import { Modal } from "@/components/common/Modal.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import type { ChatTargeting, BumpTargeting } from "../schema.ts";
import { FanLists } from "./FanLists.tsx";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />;
}
function Num({ label, value, onChange, prefix, disabled }: { label: string; value: number; onChange: (n: number) => void; prefix?: string; disabled?: boolean }) {
  return (
    <span className="num-field">
      {prefix && <span className="muted">{prefix}</span>}
      <input type="number" min={0} aria-label={label} disabled={disabled} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </span>
  );
}
const Card = ({ children }: { children: ReactNode }) => <section className="card rule-card">{children}</section>;
const Head = ({ title, on, onChange, children }: { title: string; on?: boolean; onChange?: (on: boolean) => void; children?: ReactNode }) => (
  <div className="rule-head"><div><b>{title}</b>{children && <div className="muted">{children}</div>}</div>{onChange && <Toggle label={title} checked={!!on} onChange={onChange} />}</div>
);

type Props = { accountId: string; name: string; changed: () => void; onClose: () => void } & ({ kind: "chats"; value: ChatTargeting } | { kind: "bump"; value: BumpTargeting });

/** "Choose who Jazz messages" (kind chats) and "Exclude fans from Bump" (kind bump): rules for which fans are left alone. */
export function TargetingDrawer(props: Props) {
  const { call, run } = useSession();
  const [chats, setChats] = useState<ChatTargeting | null>(props.kind === "chats" ? props.value : null);
  const [bump, setBump] = useState<BumpTargeting | null>(props.kind === "bump" ? props.value : null);
  const save = () => run(async () => {
    await call("PUT", `/api/accounts/${enc(props.accountId)}/creator/targeting`, props.kind === "chats" ? { chats } : { bump });
    props.changed();
    props.onClose();
  });
  const days = (v: { on: boolean; days: number }, set: (d: { on: boolean; days: number }) => void, label: string, text: string) => (
    <Card><Head title={label} on={v.on} onChange={(on) => set({ ...v, on })}>{text}</Head><div className="num-line"><Num label={`${label} days`} value={v.days} disabled={!v.on} onChange={(n) => set({ ...v, days: n })} /> <span className="muted">days</span></div></Card>
  );
  const t = chats?.timeWasters;

  return (
    <Modal size="drawer" title={props.kind === "chats" ? `Fan targeting: handle chats with ${props.name}` : "Exclude fans from Bump"} onClose={props.onClose} footer={<><button type="button" onClick={props.onClose}>Cancel</button><button type="button" className="primary" onClick={() => void save()}>Save</button></>}>
      {chats && (
        <>
          <p className="muted">Choose who {props.name} is allowed to message. Start from every fan or from specific lists, then narrow it down with the exclusion rules below.</p>
          <p className="muted"><b>Note:</b> If any of the following conditions are met, {props.name} will stop messaging the fan, whether it is a new or ongoing chat, and escalate it to a human on your team.</p>
          <div className="note">These rules are applied before {props.name} writes a draft: a fan who matches is handed to your team. Fans are checked with their real spend and subscribe date from OnlyFans.</div>
          <Card><Head title="Only message fans on these lists" on={chats.onlyOnLists} onChange={(on) => setChats({ ...chats, onlyOnLists: on })}>{props.name} only replies to fans on the lists below. Every other fan is left untouched.</Head>
            {chats.onlyOnLists && <FanLists accountId={props.accountId} value={chats.onlyLists} onChange={(ids) => setChats({ ...chats, onlyLists: ids })} changed={props.changed} />}</Card>
          <Card><Head title="Exclude high spenders" on={chats.highSpender.on} onChange={(on) => setChats({ ...chats, highSpender: { ...chats.highSpender, on } })}>Fans who have spent above this amount will never receive automated messages from {props.name}.</Head>
            <div className="num-line"><Num label="High spender amount" prefix="$" value={chats.highSpender.amount} disabled={!chats.highSpender.on} onChange={(n) => setChats({ ...chats, highSpender: { ...chats.highSpender, amount: n } })} /></div></Card>
          {days(chats.newFans, (newFans) => setChats({ ...chats, newFans }), "Exclude new fans", "Exclude fans who have been subscribed for less than:")}
          {days(chats.oldFans, (oldFans) => setChats({ ...chats, oldFans }), "Exclude old fans", "Exclude fans who have been subscribed for more than:")}
          {t && (
            <Card><Head title="Exclude time wasters" on={t.on} onChange={(on) => setChats({ ...chats, timeWasters: { ...t, on } })}>{props.name} replies until the fan hits the &quot;no-purchase&quot; message limit below.</Head>
              <div className="waster-line"><b>Fan with no spend:</b> Escalate after <Num label="Messages for a fan with no spend" value={t.noSpend} disabled={!t.on} onChange={(n) => setChats({ ...chats, timeWasters: { ...t, noSpend: n } })} /> messages.</div>
              <div className="waster-line"><b>Spent under</b> <Num label="Under amount" prefix="$" value={t.underAmount} disabled={!t.on} onChange={(n) => setChats({ ...chats, timeWasters: { ...t, underAmount: n } })} /> : Escalate after <Num label="Messages after a purchase, under" value={t.underAfter} disabled={!t.on} onChange={(n) => setChats({ ...chats, timeWasters: { ...t, underAfter: n } })} /> messages since last purchase.</div>
              <div className="waster-line"><b>Spent</b> <Num label="Over amount" prefix="$" value={t.overAmount} disabled={!t.on} onChange={(n) => setChats({ ...chats, timeWasters: { ...t, overAmount: n } })} /> <b>or more:</b> Escalate after <Num label="Messages after a purchase, over" value={t.overAfter} disabled={!t.on} onChange={(n) => setChats({ ...chats, timeWasters: { ...t, overAfter: n } })} /> messages since last purchase.</div>
              <p className="muted">(Messages are counted either from their last purchase or since the conversation started. Consecutive messages are counted as one.)</p></Card>
          )}
          <Card><Head title="Exclude fan lists">Fans on these lists will never receive {props.name} messages.</Head>
            <FanLists accountId={props.accountId} value={chats.excludeLists} onChange={(ids) => setChats({ ...chats, excludeLists: ids })} changed={props.changed} />
            <p className="muted">If any condition is met, {props.name} stops messaging the fan and escalates to your team.</p></Card>
        </>
      )}
      {bump && (
        <>
          <p className="muted">Fans who match any rule below do not get bump messages.</p>
          <div className="note">These rules are saved here. Bumps are not sent yet.</div>
          {days(bump.newFans, (newFans) => setBump({ ...bump, newFans }), "Exclude new fans", "Exclude fans who have been subscribed for less than:")}
          {days(bump.oldFans, (oldFans) => setBump({ ...bump, oldFans }), "Exclude old fans", "Exclude fans who have been subscribed for more than:")}
          <Card><Head title="Exclude fan lists">Select lists to exclude from bump automation.</Head>
            <FanLists accountId={props.accountId} value={bump.excludeLists} onChange={(ids) => setBump({ ...bump, excludeLists: ids })} changed={props.changed} /></Card>
        </>
      )}
    </Modal>
  );
}
