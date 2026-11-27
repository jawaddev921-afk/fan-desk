"use client";
import { useState, type ReactNode } from "react";
import { Modal } from "@/components/common/Modal.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import { DAYS, type Advanced, type DayMode } from "../schema.ts";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />;
}
const Row = ({ title, children, side }: { title: string; side: ReactNode; children?: ReactNode }) => (
  <div className="adv-row"><div className="adv-side"><h4>{title}</h4>{children}</div><div className="adv-cards">{side}</div></div>
);
const Card = ({ children }: { children: ReactNode }) => <section className="card rule-card">{children}</section>;
const Head = ({ title, on, onChange, children }: { title: string; on?: boolean; onChange?: (on: boolean) => void; children?: ReactNode }) => (
  <div className="rule-head"><div><b>{title}</b>{children && <div className="muted">{children}</div>}</div>{onChange && <Toggle label={title} checked={!!on} onChange={onChange} />}</div>
);
const secs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} min${n % 60 ? ` ${n % 60} sec` : ""}` : `${n} sec`);

/** A from/to slider pair between lo and hi (two range inputs: the second one can never go under the first). */
function Span({ label, lo, hi, step, min, max, disabled, unit, onChange }: { label: string; lo: number; hi: number; step: number; min: number; max: number; disabled?: boolean; unit: (n: number) => string; onChange: (min: number, max: number) => void }) {
  return (
    <div className="span-field">
      <div className="span-ends"><input type="range" aria-label={`${label}: from`} min={lo} max={hi} step={step} disabled={disabled} value={min} onChange={(e) => { const v = Number(e.target.value); onChange(v, Math.max(v, max)); }} /><span className="muted">{unit(min)}</span></div>
      <div className="span-ends"><input type="range" aria-label={`${label}: to`} min={lo} max={hi} step={step} disabled={disabled} value={max} onChange={(e) => { const v = Number(e.target.value); onChange(Math.min(v, min), v); }} /><span className="muted">{unit(max)}</span></div>
      <div className="span-scale muted"><span>{unit(lo)}</span><span>{unit(hi)}</span></div>
    </div>
  );
}

/** "Advanced Settings": timing and hours that apply to everything Jazz does. Saved here; sending on a timer is not built yet. */
export function AdvancedDrawer({ accountId, name, value, nicknames, changed, onClose }: { accountId: string; name: string; value: Advanced; nicknames: string[]; changed: () => void; onClose: () => void }) {
  const { call, run } = useSession();
  const [a, setA] = useState<Advanced>(value);
  const zone = a.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const save = () => run(async () => {
    await call("PUT", `/api/accounts/${enc(accountId)}/creator/advanced`, { ...a, timezone: zone });
    changed();
    onClose();
  });
  const setDay = (i: number, patch: Partial<Advanced["days"][number]>) => setA({ ...a, days: a.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const MODES: [DayMode, string][] = [["off", "Off"], ["on", "On"], ["custom", "Custom Schedule"]];

  return (
    <Modal size="drawer" title="Advanced Settings" onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => void save()}>Save</button></>}>
      <div className="note">These settings control all of {name}&apos;s features, including Bump Fans and Handle Chats with AI.</div>

      <Row title="Message Delay" side={
        <Card><Head title="Set Message Delay" on={a.delay.on} onChange={(on) => setA({ ...a, delay: { ...a.delay, on } })}>Each interaction will get a random delay from the range below.</Head>
          <p>Delay range: {secs(a.delay.min)} - {secs(a.delay.max)}</p>
          <Span label="Delay range" lo={20} hi={180} step={5} min={a.delay.min} max={a.delay.max} disabled={!a.delay.on} unit={secs} onChange={(min, max) => setA({ ...a, delay: { ...a.delay, min, max } })} /></Card>}>
        <p className="muted">Set a delay to make message timing feel more natural. Messages will send at a random time within your chosen range.</p>
        <p className="muted">For example, you can wait a few minutes after a fan comes online before sending the first message, or add a random delay before each reply.</p>
      </Row>

      <Row title="Follow up" side={<>
        <Card><Head title="Send a follow-up nudge" on={a.followUp.on} onChange={(on) => setA({ ...a, followUp: { ...a.followUp, on } })}>Send a follow up message between {a.followUp.min}-{a.followUp.max} min after a message / PPV and the fan does not respond. (This feature requires {name} to have AI Chatting enabled.)</Head>
          <Span label="Follow-up" lo={2} hi={30} step={1} min={a.followUp.min} max={a.followUp.max} disabled={!a.followUp.on} unit={(n) => `${n} min`} onChange={(min, max) => setA({ ...a, followUp: { ...a.followUp, min, max } })} /></Card>
        <Card><Head title="Send PPVs to Silent Fans" on={a.silentPpv.on} onChange={(on) => setA({ ...a, silentPpv: { ...a.silentPpv, on } })}>If a fan doesn&apos;t reply after a burst, {name} will automatically send a PPV. (This feature requires {name} to have both Bump Fans and AI Chatting enabled.)</Head>
          <Span label="Silent fans" lo={2} hi={30} step={1} min={a.silentPpv.min} max={a.silentPpv.max} disabled={!a.silentPpv.on} unit={(n) => `${n} min`} onChange={(min, max) => setA({ ...a, silentPpv: { ...a.silentPpv, min, max } })} />
          <div className="num-line"><Toggle label="Only send content with exclusivity up to" checked={a.silentPpv.limitOn} onChange={(limitOn) => setA({ ...a, silentPpv: { ...a.silentPpv, limitOn } })} /> <span className="muted">Only send content with exclusivity up to</span>
            <select aria-label="Exclusivity" value={a.silentPpv.exclusivity} disabled={!a.silentPpv.on || !a.silentPpv.limitOn} onChange={(e) => setA({ ...a, silentPpv: { ...a.silentPpv, exclusivity: Number(e.target.value) } })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></div></Card>
      </>}>
        <p className="muted">{name}&apos;s follow-up nudges, like re-engaging fans who didn&apos;t reply to a message, or reminding fans who didn&apos;t buy after a PPV offer.</p>
      </Row>

      <Row title="Bump Fans Settings" side={<>
        <Card><Head title="Unsend Automatically" on={a.unsend.on} onChange={(on) => setA({ ...a, unsend: { ...a.unsend, on } })}>Automatically unsend Bump Messages if the fan doesn&apos;t reply within a set time, so your chat doesn&apos;t get cluttered or feel spammy. Due to OnlyFans&apos; limits, the actual unsend time may take more than what you set here. Please set the interval shorter than your target time if exact timing is important.</Head>
          <div className="num-line"><b>Unsend after:</b></div>
          <div className="num-line"><input type="number" min={0} aria-label="Unsend after hours" disabled={!a.unsend.on} value={a.unsend.hours} onChange={(e) => setA({ ...a, unsend: { ...a.unsend, hours: Number(e.target.value) } })} /> hours <input type="number" min={0} max={59} aria-label="Unsend after minutes" disabled={!a.unsend.on} value={a.unsend.minutes} onChange={(e) => setA({ ...a, unsend: { ...a.unsend, minutes: Number(e.target.value) } })} /> minutes</div></Card>
        <Card><Head title="Don't bump fans you've messaged recently">Avoid bumping fans who were recently contacted, whether by a human or by {name}, to prevent spamming.</Head>
          <div className="num-line">Don&apos;t bump fans you&apos;ve messaged in the last:</div>
          <div className="num-line"><input type="number" min={0} aria-label="Hours" value={a.noBumpHours} onChange={(e) => setA({ ...a, noBumpHours: Number(e.target.value) })} /> hours</div></Card>
        <Card><Head title={`After a tip or a purchase`}>Choose who carries on once a fan pays. With {name} on, a tip or purchase starts the "Tipped" bump or your tip scripts, and {name} thanks the fan and offers something DIFFERENT each time. Otherwise a person takes the chat.</Head>
          <div className="rule-head"><span>Keep {name} on after a payment</span><Toggle label="Keep Jazz on after a payment" checked={a.afterPayment === "jazz"} onChange={(on) => setA({ ...a, afterPayment: on ? "jazz" : "person" })} /></div></Card>
        <Card><Head title={`Choose which fan actions trigger ${name} to send a bump message`} />
          {([["online", "Fan comes online"], ["purchase", "Fan purchases content or sends a tip"], ["engage", "Fan likes or comments on a post"]] as const).map(([k, text]) => (
            <div key={k} className="rule-head"><span>{text}</span><Toggle label={text} checked={a.triggers[k]} onChange={(on) => setA({ ...a, triggers: { ...a.triggers, [k]: on } })} /></div>
          ))}</Card>
      </>} />

      <Row title="Fan Name Fallback Options" side={<Card>{nicknames.length ? nicknames.map((n) => <span key={n} className="chip">{n}</span>) : <span className="muted">No fallback names yet.</span>}</Card>}>
        <p className="muted">Available fallback names when a fan doesn&apos;t have a name in CRM. These are configured in the Bio &gt; Chatting &gt; fan nicknames.</p>
      </Row>

      <Row title={`Set Active Hours (${name} Availability)`} side={<>
        <Card>{DAYS.map((day, i) => {
          const d = a.days[i]!;
          return (
            <div key={day} className="day-row">
              <div><b>{day}</b><div className="muted">{d.mode === "off" ? "Inactive" : "Active"}</div><div className="muted">{d.mode === "custom" ? <><input type="time" aria-label={`${day} from`} value={d.from} onChange={(e) => setDay(i, { from: e.target.value })} /> to <input type="time" aria-label={`${day} to`} value={d.to} onChange={(e) => setDay(i, { to: e.target.value })} /></> : d.mode === "on" ? "All day" : ""}</div></div>
              <div className="seg" role="group" aria-label={`${day} availability`}>{MODES.map(([m, text]) => <button key={m} type="button" className={d.mode === m ? "active" : ""} aria-pressed={d.mode === m} onClick={() => setDay(i, { mode: m })}>{text}</button>)}</div>
            </div>
          );
        })}</Card>
        <Card><Head title="Respond to unanswered messages when you're back online" on={a.respondWhenBack} onChange={(respondWhenBack) => setA({ ...a, respondWhenBack })}>Let {name} reply to messages that came in while she was offline. If this is off, any messages received during offline hours will be ignored.</Head></Card>
      </>}>
        <p className="muted">Set specific hours when {name} engaging with fans. Outside of these hours, reach out to online fans and automated replies will be paused until the next active period.</p>
        <p>Effective Timezone:<br /><span className="link-text">{zone}</span></p>
      </Row>
    </Modal>
  );
}
