"use client";
import { useRef, useState, type ReactNode } from "react";
import { EmojiPicker } from "@/components/common/EmojiPicker.tsx";
import { ClockIcon, CopyIcon, FilterIcon, InfoIcon, MailIcon, MergeIcon, PlayCircleIcon, TagIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { Select } from "@/components/common/Select.tsx";
import { FLOW_CONDITIONS, FLOW_TRIGGERS, flowLabel, type Flow, type FlowKind, type FlowNode } from "../schema.ts";
import { MediaPicker } from "./ProductModal.tsx";

type Config = FlowNode["config"];
const ICON: Record<FlowKind, ReactNode> = { start: <PlayCircleIcon />, delay: <ClockIcon />, condition: <FilterIcon />, message: <MailIcon />, tag: <TagIcon />, merge: <MergeIcon /> };
const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) => <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />;
const ToggleCard = ({ label, tip, checked, onChange, children }: { label: string; tip?: string; checked: boolean; onChange: (on: boolean) => void; children?: ReactNode }) => (
  <div className="card rule-card"><div className="rule-head"><b>{label}{tip && <span className="info-tip" title={tip}> <InfoIcon /></span>}</b><Toggle label={label} checked={checked} onChange={onChange} /></div>{children}</div>
);
const Field = ({ label, htmlFor, hint, children }: { label?: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) => (
  <div className="fl-field">{label && <label htmlFor={htmlFor}>{label}</label>}{hint && <p className="muted">{hint}</p>}{children}</div>
);
const Money = ({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (n: number) => void }) => (
  <span className="num-field"><span className="muted">$</span><input type="number" min={0} step="0.01" aria-label={label} disabled={disabled} value={value} onChange={(e) => onChange(Number(e.target.value))} /></span>
);

/** The exit rules, shown in the flow settings and when a flow is set live. */
function ExitRules({ exit, onChange }: { exit: Flow["exit"]; onChange: (e: Flow["exit"]) => void }) {
  return (
    <>
      <ToggleCard label="Exit if a fan is a Super Fan" tip="A fan who spends a lot, as marked in the CRM." checked={exit.superFan} onChange={(superFan) => onChange({ ...exit, superFan })} />
      <ToggleCard label="Exit if a fan spent in total more than" tip="Total spent on the creator's page." checked={exit.spentOn} onChange={(spentOn) => onChange({ ...exit, spentOn })}><Money label="Total spent" value={exit.spent} disabled={!exit.spentOn} onChange={(spent) => onChange({ ...exit, spent })} /></ToggleCard>
    </>
  );
}

/** The gear button: "Messages flow settings" (exit rules and goal). */
export function SettingsDrawer({ flow, onSave, onClose }: { flow: Flow; onSave: (exit: Flow["exit"], goal: Flow["goal"]) => void; onClose: () => void }) {
  const [exit, setExit] = useState(flow.exit);
  const [goal, setGoal] = useState(flow.goal);
  return (
    <Modal size="drawer" title={<span className="drawer-title"><small>Messages flow settings</small>Settings</span>} onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => onSave(exit, goal)}>Save</button></>}>
      <h3 className="sec">Exit Rules</h3>
      <p className="muted">Choose which fans should exit the flow before it ends</p>
      <ExitRules exit={exit} onChange={setExit} />
      <h3 className="sec">Goal</h3>
      <p className="muted">Set a goal to measure your flow over time.</p>
      <ToggleCard label="Fan spent in the flow more than" tip="Fans who spend this much while in the flow count toward the goal." checked={goal.on} onChange={(on) => setGoal({ ...goal, on })}><Money label="Goal amount" value={goal.amount} disabled={!goal.on} onChange={(amount) => setGoal({ ...goal, amount })} /></ToggleCard>
    </Modal>
  );
}

/** The panel on the right that opens when a step is clicked ("Event settings"). */
export function NodeDrawer({ accountId, accountName, node, onSave, onClose }: { accountId: string; accountName: string; node: FlowNode; onSave: (c: Config) => void; onClose: () => void }) {
  const [c, setC] = useState<Config>(node.config);
  const [tried, setTried] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Config) => setC({ ...c, ...patch });
  const isMsg = node.kind === "message";
  const missingTitle = isMsg && tried && !String(c.title).trim();
  const missingText = isMsg && tried && !String(c.text).trim();
  const save = () => {
    if (isMsg && (!String(c.title).trim() || !String(c.text).trim())) return setTried(true);
    onSave(c);
  };
  const title = node.kind === "delay" ? "Time delay" : flowLabel(node);

  return (
    <Modal size="drawer" title={<span className="drawer-title"><small>Event settings</small><span className="drawer-line"><span className={`fl-ico ${node.kind}`}>{ICON[node.kind]}</span>{title}</span></span>} onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={save}>Save</button></>}>
      {node.kind === "start" && (
        <>
          <Field label="Trigger" htmlFor="fl-trigger"><Select id="fl-trigger" value={String(c.trigger)} onChange={(trigger) => set({ trigger })} options={FLOW_TRIGGERS.map((t) => ({ value: t, label: t }))} /></Field>
          {c.trigger === FLOW_TRIGGERS[2] && <Field label="Spent more than"><Money label="Spent more than" value={Number(c.amount)} onChange={(amount) => set({ amount })} /></Field>}
          {c.trigger === FLOW_TRIGGERS[3] && <Field label="Tag" htmlFor="fl-tag"><input id="fl-tag" value={String(c.tag)} onChange={(e) => set({ tag: e.target.value })} /></Field>}
        </>
      )}
      {node.kind === "delay" && (
        <Field label="Choose how long to wait for">
          <div className="row"><input type="number" min={0} aria-label="Wait for" value={Number(c.amount) || ""} onChange={(e) => set({ amount: Math.max(0, Number(e.target.value)) })} /><Select ariaLabel="Unit" value={String(c.unit)} onChange={(unit) => set({ unit })} options={["minutes", "hours", "days"].map((u) => ({ value: u, label: u }))} /></div>
        </Field>
      )}
      {node.kind === "condition" && (
        <>
          <Field label="Condition Type" htmlFor="fl-cond"><Select id="fl-cond" value={String(c.type)} onChange={(type) => set({ type })} placeholder="Select a condition" options={FLOW_CONDITIONS.map(([value, label]) => ({ value, label }))} /></Field>
          {c.type === "spent" ? (
            <Field label="Amount"><div className="row"><Select ariaLabel="More or less" value={c.more ? "more" : "less"} onChange={(v) => set({ more: v === "more" })} options={[{ value: "more", label: "More than" }, { value: "less", label: "Less than" }]} /><Money label="Amount" value={Number(c.amount)} onChange={(amount) => set({ amount })} /></div></Field>
          ) : c.type ? (
            <Field label="Wait before checking (seconds)" htmlFor="fl-wait"><input id="fl-wait" type="number" min={0} value={Number(c.waitSeconds)} onChange={(e) => set({ waitSeconds: Math.max(0, Number(e.target.value)) })} /></Field>
          ) : null}
        </>
      )}
      {node.kind === "tag" && <Field label="Tag" htmlFor="fl-tagname"><input id="fl-tagname" placeholder="e.g. Interested" value={String(c.tag)} onChange={(e) => set({ tag: e.target.value })} /></Field>}
      {node.kind === "merge" && <p className="muted">Joins the paths of a condition back into one. There is nothing to set.</p>}
      {isMsg && (
        <>
          <div className="drawer-tabs"><button type="button" className="active" onClick={() => document.getElementById("fl-edit")?.scrollIntoView?.({ block: "start" })}>Edit Message<span className="muted">0</span></button><button type="button" onClick={() => document.getElementById("fl-general")?.scrollIntoView?.({ block: "start" })}>General Settings<span className="muted">Sent</span></button></div>
          <h3 className="sec" id="fl-edit">Edit your message</h3>
          <Field label="Message Title" htmlFor="fl-title">
            <input id="fl-title" placeholder="Example: Welcome Message" aria-invalid={missingTitle} value={String(c.title)} onChange={(e) => set({ title: e.target.value })} />
            {missingTitle && <span className="field-err">Please input the title text</span>}
          </Field>
          <Field label="Text" htmlFor="fl-text" hint={<>Put <code className="name-chip">{"{name}"}</code> <button type="button" className="mini" aria-label="Copy {name}" onClick={() => void navigator.clipboard?.writeText("{name}")}><CopyIcon /></button> in your message to replace it with the fan&apos;s first name.</>}>
            <textarea id="fl-text" ref={textRef} placeholder="Write your message here" aria-invalid={missingText} value={String(c.text)} onChange={(e) => set({ text: e.target.value })} />
            {missingText && <span className="field-err">Please input the message text</span>}
            <span className="fl-emoji"><EmojiPicker onPick={(e) => set({ text: String(c.text) + e })} /></span>
          </Field>
          <Field label="Media"><MediaPicker accountId={accountId} media={Array.isArray(c.media) ? c.media : []} price={Number(c.price)} onChange={(media) => set({ media })} /></Field>
          <Field label="Price" htmlFor="fl-price"><span className="num-field"><span className="muted">$</span><input id="fl-price" type="number" min={0} step="0.01" placeholder="Free" value={Number(c.price) || ""} onChange={(e) => set({ price: Math.max(0, Number(e.target.value)) })} /></span></Field>
          <ToggleCard label="Override with Personalized AI Pricing" tip={`${accountName}'s AI pricing may change the price for each fan.`} checked={!!c.aiPricing} onChange={(aiPricing) => set({ aiPricing })} />
          <h3 className="sec" id="fl-general">Message Settings</h3>
          <ToggleCard label="Don't send if the fan purchased this media" checked={!!c.skipIfBought} onChange={(skipIfBought) => set({ skipIfBought })} />
          <ToggleCard label="Unsend message if the fan doesn't reply within 8 hours" checked={!!c.unsendOn} onChange={(unsendOn) => set({ unsendOn })} />
          <ToggleCard label="Skip this message if the fan has sent you a message recently" checked={!!c.skipRecent} onChange={(skipRecent) => set({ skipRecent })} />
        </>
      )}
    </Modal>
  );
}

/** "Set live": the last question before a flow starts (exit rules). */
export function SetLive({ title, exit: start, onGo, onClose }: { title: string; exit: Flow["exit"]; onGo: (exit: Flow["exit"]) => void; onClose: () => void }) {
  const [exit, setExit] = useState(start);
  return (
    <Modal title={`Set live "${title}"`} onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => onGo(exit)}><PlayCircleIcon /> Set Live</button></>}>
      <h4>Set an exit rule?</h4>
      <p className="muted">Fans that match the entry event will start receiving messages. Also, you can set up exit rules if needed.</p>
      <ExitRules exit={exit} onChange={setExit} />
    </Modal>
  );
}
