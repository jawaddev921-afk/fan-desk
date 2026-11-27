"use client";
import { ConfirmBox } from "@/components/common/Dialogs.tsx";
import { useState, type ReactNode } from "react";
import { AI_NAME } from "@/config/ai.ts";
import { ArrowLeftIcon, ClockIcon, CopyIcon, FilterIcon, FitIcon, GearIcon, LockIcon, MailIcon, MergeIcon, MinusIcon, PlayCircleIcon, PlusIcon, TagIcon, TrashIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { blankFlow, flowAdd, flowDelete, flowDetail, flowDuplicate, flowIssues, flowKids, flowLabel, type Flow, type FlowKind, type FlowNode } from "../schema.ts";
import { FlowStats } from "./FlowStats.tsx";
import { NodeDrawer, SetLive, SettingsDrawer } from "./FlowDrawers.tsx";

const ICON: Record<FlowKind, ReactNode> = { start: <PlayCircleIcon />, delay: <ClockIcon />, condition: <FilterIcon />, message: <MailIcon />, tag: <TagIcon />, merge: <MergeIcon /> };
const ADD: [FlowKind, string][] = [["delay", "Time Delay"], ["condition", "Condition"], ["message", "Message"], ["tag", "Tag Fan"], ["merge", "Merge Nodes"]];
const ZOOMS = ["z0", "z1", "z2", "z3"] as const;

type Ctx = { nodes: FlowNode[]; locked: boolean; canMerge: boolean; add: (parent: string, branch: FlowNode["branch"], kind: FlowKind) => void; open: (id: string) => void; del: (id: string) => void; dup: (id: string) => void };

/** The "+" on a line: opens the list of steps that can be added there. */
function Plus({ ctx, parent, branch }: { ctx: Ctx; parent: string; branch: FlowNode["branch"] }) {
  const [menu, setMenu] = useState(false);
  if (ctx.locked) return <span className="fl-line" />;
  return (
    <span className="fl-edge">
      <span className="fl-line" />
      <span className="fl-add">
        <button type="button" aria-label="Add a step" aria-expanded={menu} onClick={() => setMenu(!menu)}><PlusIcon /></button>
        {menu && <div className="fl-menu" role="menu">{ADD.filter(([k]) => k !== "merge" || ctx.canMerge).map(([k, label]) => <button type="button" role="menuitem" key={k} className={`fl-item ${k}`} onClick={() => { setMenu(false); ctx.add(parent, branch, k); }}>{ICON[k]} {label}</button>)}</div>}
      </span>
      <span className="fl-line" />
    </span>
  );
}

function Tree({ ctx, id }: { ctx: Ctx; id: string }) {
  const n = ctx.nodes.find((x) => x.id === id)!;
  const next = flowKids(ctx.nodes, id)[0];
  const detail = flowDetail(n);
  return (
    <div className="fl-branch">
      <div className={`fl-node ${n.kind}`}>
        {!ctx.locked && n.kind !== "start" && <span className="fl-tools"><button type="button" aria-label="Delete step" onClick={() => ctx.del(n.id)}><TrashIcon /></button>{n.kind !== "condition" && <button type="button" aria-label="Duplicate step" onClick={() => ctx.dup(n.id)}><CopyIcon /></button>}</span>}
        <button type="button" className="fl-card" disabled={n.kind === "merge" && ctx.locked} onClick={() => ctx.open(n.id)}>
          <span className="fl-head">{ICON[n.kind]}<b>{flowLabel(n)}</b></span>
          {detail && <span className="fl-detail">{detail}</span>}
        </button>
      </div>
      {n.kind === "condition" ? (
        <div className="fl-split">
          {(["true", "false"] as const).map((b) => {
            const k = flowKids(ctx.nodes, id, b)[0];
            return (
              <div className="fl-arm" key={b}>
                <span className="fl-line" /><span className="fl-pill">If {b === "true" ? "True" : "False"}</span>
                <Plus ctx={ctx} parent={id} branch={b} />
                {k && <Tree ctx={ctx} id={k.id} />}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <Plus ctx={ctx} parent={id} branch={null} />
          {next && <Tree ctx={ctx} id={next.id} />}
        </>
      )}
    </div>
  );
}

/** The flow editor: Builder (the canvas) and Statistics, with Save and Set Live. `onSave` writes it. */
export function FlowBuilder({ accountId, accountName, initial, onSave, onClose }: { accountId: string; accountName: string; initial: { id: number | null; flow: Flow; stats?: boolean }; onSave: (id: number | null, flow: Flow) => Promise<void>; onClose: () => void }) {
  const [flow, setFlow] = useState<Flow>(initial.flow ?? blankFlow());
  const [id, setId] = useState(initial.id);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<"builder" | "stats">(initial.stats ? "stats" : "builder");
  const [openId, setOpenId] = useState<string | null>(null);
  const [gear, setGear] = useState(false);
  const [live, setLive] = useState(false);
  const [leave, setLeave] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [locked, setLocked] = useState(false);
  const [rename, setRename] = useState<string | null>(null);

  const change = (patch: Partial<Flow>) => { setFlow({ ...flow, ...patch }); setDirty(true); };
  const nodes = flow.nodes;
  const issues = flowIssues(flow);
  const save = async (next: Flow = flow) => { await onSave(id, { ...next, editedAt: Date.now() }); setDirty(false); };
  const ctx: Ctx = {
    nodes, locked, canMerge: nodes.some((n) => n.kind === "condition"),
    add: (parent, branch, kind) => { const next = flowAdd(nodes, parent, branch, kind); change({ nodes: next }); setOpenId(next.at(-1)!.id); },
    open: setOpenId,
    del: (nid) => change({ nodes: flowDelete(nodes, nid) }),
    dup: (nid) => change({ nodes: flowDuplicate(nodes, nid) }),
  };
  const opened = nodes.find((n) => n.id === openId);

  return (
    <div className="flow">
      <div className="flow-bar">
        <button type="button" className="icon-link" aria-label="Back to the flows" onClick={() => (dirty ? setLeave(true) : onClose())}><ArrowLeftIcon /></button>
        {rename === null
          ? <button type="button" className="flow-title" title="Rename" onClick={() => setRename(flow.title)}>{flow.title}</button>
          : <input className="flow-title-edit" autoFocus aria-label="Flow title" value={rename} onChange={(e) => setRename(e.target.value)} onBlur={() => { if (rename.trim()) change({ title: rename.trim() }); setRename(null); }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />}
        <span className={`fs s-${flow.status}`}>{flow.status === "active" ? "Live" : flow.status === "stopped" ? "Stopped" : "Draft"}</span>
        <span className="grow" />
        <div className="seg" role="tablist"><button type="button" role="tab" aria-selected={view === "builder"} className={view === "builder" ? "active" : ""} onClick={() => setView("builder")}>Builder</button><button type="button" role="tab" aria-selected={view === "stats"} className={view === "stats" ? "active" : ""} onClick={() => setView("stats")}>Statistics</button></div>
        <span className="grow" />
        <button type="button" className="icon-link" aria-label="Flow settings" onClick={() => setGear(true)}><GearIcon /></button>
        <button type="button" onClick={() => void save()}>Save</button>
        <button type="button" className={issues.length ? "" : "primary"} disabled={issues.length > 0} title={issues.length ? "Finish configuration of messages series nodes to set it live" : undefined} onClick={() => setLive(true)}><PlayCircleIcon /> Set Live</button>
      </div>

      {view === "stats" ? <FlowStats /> : (
        <div className="flow-canvas-wrap">
          <div className={`flow-canvas ${ZOOMS[Math.round((zoom - 0.5) / 0.25)] ?? "z2"}`}><Tree ctx={ctx} id="start" /></div>
          <div className="flow-zoom" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom in" disabled={zoom >= 1.25} onClick={() => setZoom(zoom + 0.25)}><PlusIcon /></button>
            <button type="button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(zoom - 0.25)}><MinusIcon /></button>
            <button type="button" aria-label="Fit view" onClick={() => setZoom(1)}><FitIcon /></button>
            <button type="button" aria-label={locked ? "Unlock the canvas" : "Lock the canvas"} aria-pressed={locked} onClick={() => setLocked(!locked)}><LockIcon /></button>
          </div>
        </div>
      )}
      <div className="note">Flows are saved here. Running them on real fans is not switched on yet ({AI_NAME} sends nothing from a flow).</div>

      {opened && <NodeDrawer key={opened.id} accountId={accountId} accountName={accountName} node={opened} onSave={(config) => { change({ nodes: nodes.map((n) => (n.id === opened.id ? { ...n, config } : n)) }); setOpenId(null); }} onClose={() => setOpenId(null)} />}
      {gear && <SettingsDrawer flow={flow} onSave={(exit, goal) => { change({ exit, goal }); setGear(false); }} onClose={() => setGear(false)} />}
      {live && <SetLive title={flow.title} exit={flow.exit} onClose={() => setLive(false)} onGo={(exit) => void save({ ...flow, exit, status: "active" }).then(onClose)} />}
      {leave && <ConfirmBox title="Leave this page?" text="You have changes that are not saved." sub="If you leave now they are lost." yes="Leave" onYes={onClose} onNo={() => setLeave(false)} />}
    </div>
  );
}
