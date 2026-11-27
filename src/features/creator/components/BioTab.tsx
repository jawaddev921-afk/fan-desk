"use client";
import { Fragment, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { AI_NAME } from "@/config/ai.ts";
import { Select } from "@/components/common/Select.tsx";
import { EmojiPicker } from "@/components/common/EmojiPicker.tsx";
import { TagInput } from "@/components/common/TagInput.tsx";
import { BulbIcon, ChatIcon, CheckIcon, CloseIcon, FlaskIcon, HeartIcon, ImageIcon, InfoIcon, LinkIcon, NewsIcon, RulerIcon, SunIcon, UserIcon } from "@/components/common/icons.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import { BIO_SECTIONS, cleanBio, TRAIN_TOTAL, trainDone, type BioValue, type BioValues, type Field } from "../schema.ts";
import type { CreatorView } from "../types.ts";
import { TrainPanel } from "./TrainPanel.tsx";
import { UpdatesPanel } from "./UpdatesPanel.tsx";

const ICONS: Record<string, ReactNode> = {
  personal: <UserIcon />,
  chatting: <ChatIcon />,
  lifestyle: <SunIcon />,
  physique: <RulerIcon />,
  content: <ImageIcon />,
  intimate: <HeartIcon />,
  socials: <LinkIcon />,
  train: <FlaskIcon />,
  updates: <NewsIcon />,
};

const isFilled = (v: BioValue | undefined) => (Array.isArray(v) ? v.length > 0 : !!v?.trim());
const title = (o: string) => o.split(":")[0]!; // "Aggressive: leads toward sales" is shown as "Aggressive", the rest is the explanation
// a pick with 4 or fewer options is shown as one row of buttons; if the labels are long it needs the full width to stay on one line
const needsRow = (f: Field) => f.kind === "select" && (f.options?.length ?? 0) <= 4 && (f.options ?? []).reduce((n, o) => n + title(o).length, 0) > 34;
const explain = (o: string) => (o.includes(":") ? o.slice(o.indexOf(":") + 1).trim().replace(/^./, (c) => c.toUpperCase()) : "");

function EmojiInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="emoji">
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      <EmojiPicker onPick={(e) => onChange(value + e)} />
    </div>
  );
}

function Measure({ id, value, units, onChange }: { id: string; value: string; units: readonly string[]; onChange: (v: string) => void }) {
  const [unit, setUnit] = useState(units.find((u) => value.endsWith(` ${u}`)) ?? units[0]!);
  const num = value.endsWith(` ${unit}`) ? value.slice(0, -unit.length - 1) : value;
  const set = (n: string, u: string) => onChange(n.trim() ? `${n.trim()} ${u}` : "");
  return (
    <div className="measure">
      <input id={id} value={num} onChange={(e) => set(e.target.value, unit)} />
      <Select ariaLabel="Unit" value={unit} onChange={(u) => { setUnit(u); set(num, u); }} options={units.map((u) => ({ value: u, label: u }))} />
    </div>
  );
}

function YesNo({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const yes = value.startsWith("Yes");
  const detail = value.startsWith("Yes: ") ? value.slice(5) : "";
  return (
    <div className="yesno" role="radiogroup" aria-labelledby={`${id}-label`}>
      <label className="inline"><input type="radio" name={id} checked={value === "No"} onChange={() => onChange("No")} /> No</label>
      <div className="row">
        <label className="inline"><input type="radio" name={id} checked={yes} onChange={() => onChange(detail ? `Yes: ${detail}` : "Yes")} /> Yes</label>
        <input id={id} className="grow" aria-label="Details" disabled={!yes} value={detail} onChange={(e) => onChange(e.target.value ? `Yes: ${e.target.value}` : "Yes")} />
      </div>
    </div>
  );
}

function Control({ f, value, onChange }: { f: Field; value: BioValue | undefined; onChange: (v: BioValue) => void }) {
  const id = `bio-${f.key}`;
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? value : [];
  const opts = f.options ?? [];
  if (f.kind === "text")
    return (
      <div className={f.max ? "counted" : undefined}>
        <input id={id} value={text} placeholder={f.placeholder} maxLength={f.max} onChange={(e) => onChange(e.target.value)} />
        {f.max && text.length > 0 && <span className="count-hint">{text.length} / {f.max}</span>}
      </div>
    );
  if (f.kind === "area") return <textarea id={id} value={text} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  if (f.kind === "tags") return <TagInput id={id} value={list} placeholder={f.placeholder} onChange={onChange} />;
  if (f.kind === "radio")
    return (
      <div className="radios" role="radiogroup" aria-labelledby={`${id}-label`}>
        {opts.map((o) => <label className="inline" key={o}><input type="radio" name={id} checked={text === o} onChange={() => onChange(o)} /> {o}</label>)}
      </div>
    );
  if (f.kind === "multiselect")
    return (
      <div className="multi">
        <div className="tags">
          {list.map((t) => <span className="input-tag" key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(list.filter((x) => x !== t))}><CloseIcon /></button></span>)}
        </div>
        <Select id={id} ariaLabel={f.label} value="" placeholder={list.length ? "Add another" : "Select"} onChange={(v) => v && onChange([...list, v])} options={opts.filter((o) => !list.includes(o)).map((o) => ({ value: o, label: o }))} />
      </div>
    );
  if (f.kind === "date") return <input id={id} type="date" value={text} onChange={(e) => onChange(e.target.value)} />;
  if (f.kind === "emoji") return <EmojiInput id={id} value={text} onChange={onChange} />;
  if (f.kind === "measure") return <Measure id={id} value={text} units={opts} onChange={onChange} />;
  if (f.kind === "yesno") return <YesNo id={id} value={text} onChange={onChange} />;
  if (f.kind === "switch") return <input id={id} type="checkbox" role="switch" checked={text === "on"} onChange={(e) => onChange(e.target.checked ? "on" : "")} />;
  if (f.kind === "slider") {
    const at = opts.indexOf(text);
    return (
      <div className="slider">
        <input id={id} type="range" min={0} max={opts.length - 1} step={1} value={at < 0 ? 1 : at} data-unset={at < 0} aria-valuetext={at < 0 ? "Not set" : text} onChange={(e) => onChange(opts[Number(e.target.value)]!)} />
        <div className="slider-labels" aria-hidden="true">{opts.map((o) => <span key={o}>{o}</span>)}</div>
      </div>
    );
  }
  if (f.kind === "checks")
    return (
      <div className="choices">
        {opts.map((o) => (
          <button type="button" className="choice" key={o} aria-pressed={list.includes(o)} onClick={() => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o])}>{o}</button>
        ))}
      </div>
    );
  if (opts.length > 4 || f.dropdown)
    return (
      <>
        <Select id={id} value={text} onChange={onChange} placeholder="Choose…" options={[{ value: "", label: "Not set" }, ...opts.map((o) => ({ value: o, label: o, hint: f.details?.[o], badge: f.beta?.includes(o) ? "Beta" : undefined, icon: f.extra?.[o]?.icon, meta: f.extra?.[o]?.meta }))]} />
        {f.details?.[text] && <div className="hint">{f.details[text]}</div>}
      </>
    );
  return (
    <>
      <div className="segmented" role="radiogroup" aria-labelledby={`${id}-label`}>
        {opts.map((o) => (
          <button type="button" role="radio" aria-checked={text === o} key={o} onClick={() => onChange(text === o ? "" : o)}>{title(o)}</button>
        ))}
      </div>
      {explain(text) && <div className="hint">{explain(text)}</div>}
    </>
  );
}

/** The questions of one section: a heading, a rule or a row of columns where the form asks for it. */
export function BioFields({ fields, values, onChange }: { fields: readonly Field[]; values: BioValues; onChange: (key: string, v: BioValue) => void }) {
  const one = (f: Field) => (
    <div className={f.kind === "area" || f.kind === "checks" || needsRow(f) ? "field wide" : "field"} key={f.key}>
      <label id={`bio-${f.key}-label`} htmlFor={`bio-${f.key}`}>
        {f.required && <span className="req" title="Required" aria-label="required">*</span>}{f.label}
        {f.info && <span className="info" title={f.info} tabIndex={0} aria-label={f.info}><InfoIcon /></span>}
      </label>
      <Control f={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} />
      {f.hint && <div className="hint">{f.hint}</div>}
    </div>
  );
  const out: ReactNode[] = [];
  for (let i = 0; i < fields.length; ) {
    const first = fields[i]!;
    const group = [first];
    while (first.cols && fields[i + group.length]?.cols === first.cols) group.push(fields[i + group.length]!);
    i += group.length;
    out.push(
      <Fragment key={first.key}>
        {first.rule && <hr className="wide" />}
        {first.heading && <h4 className="field-heading wide">{first.heading}</h4>}
        {first.cols ? <div className={`wide fields-row cols${first.cols}`}>{group.map(one)}</div> : one(first)}
      </Fragment>,
    );
  }
  return <div className="fields">{out}</div>;
}

export function BioTab({ accountId, view, patch, reload }: { accountId: string; view: CreatorView; patch: (p: Partial<CreatorView>) => void; reload: () => void }) {
  const { call, run, me, setFlash } = useSession();
  const [values, setValues] = useState<BioValues>(view.values);
  const [savedJson, setSavedJson] = useState(JSON.stringify(view.values));
  const [section, setSection] = useState<string>(BIO_SECTIONS[0]!.id);
  const [justSaved, setJustSaved] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const base = `/api/accounts/${enc(accountId)}/creator`;
  const others = (me?.accounts ?? []).filter((a) => a.accountId !== accountId);

  const current = BIO_SECTIONS.find((s) => s.id === section);
  const dirty = JSON.stringify(values) !== savedJson;
  const change = (key: string, v: BioValue) => { setJustSaved(false); setValues({ ...values, [key]: v }); };
  const save = () => {
    void run(async () => {
      await call("PUT", base, { values });
      setSavedJson(JSON.stringify(values));
      patch({ values, updatedAt: Date.now() });
      setJustSaved(true);
    });
  };
  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()) as { values?: BioValues };
      setValues(cleanBio(j.values ?? (j as BioValues))); // shown as unsaved: the person reviews it, then saves
      setJustSaved(false);
    } catch {
      setFlash({ kind: "err", text: "That file is not a valid bio file (JSON)." });
    }
  };
  const makeLink = () => run(async () => setLink((await call<{ url: string }>("POST", `${base}/request`)).url));
  const copy = () => run(async () => {
    await call("POST", `${base}/copy`, { fromAccountId: copyFrom });
    const v = (await call<CreatorView>("GET", base)).values;
    setValues(v);
    setSavedJson(JSON.stringify(v));
    patch({ values: v });
    setCopyFrom(null);
  });

  const nav = [...BIO_SECTIONS.map((s) => ({ id: s.id, title: s.title, count: `${s.fields.filter((f) => isFilled(values[f.key])).length}/${s.fields.length}`, full: s.fields.every((f) => isFilled(values[f.key])) })), { id: "train", title: `Train ${AI_NAME}`, count: `${trainDone(view.train)}/${TRAIN_TOTAL + view.counts.sample}`, full: trainDone(view.train) === TRAIN_TOTAL + view.counts.sample }, { id: "updates", title: "Live updates", count: String(view.counts.update), full: false }];

  return (
    <div className="bio-wrap">
      <div className="tab-head">
        <h3>Bio</h3>
        <div className="row">
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={importFile} />
          <button type="button" onClick={() => file.current?.click()}>Import from file</button>
          <button type="button" onClick={() => void makeLink()}>Request from creator</button>
          <button type="button" disabled={!others.length} title={others.length ? undefined : "Connect another creator account to copy from it"} onClick={() => setCopyFrom(copyFrom === null ? others[0]!.accountId : null)}>Copy from other creator</button>
        </div>
      </div>
      {link && (
        <div className="card copy-row">
          <span className="muted">Send this link to the creator. Anyone with it can edit this bio for 7 days.</span>
          <input readOnly aria-label="Link for the creator" value={link} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="primary" onClick={() => void navigator.clipboard.writeText(link)}>Copy link</button>
          <button type="button" onClick={() => setLink(null)}>Close</button>
        </div>
      )}
      {copyFrom !== null && (
        <div className="card copy-row">
          <span className="muted">Replace this bio with the bio of</span>
          <Select ariaLabel="Copy bio from" value={copyFrom} onChange={setCopyFrom} options={others.map((a) => ({ value: a.accountId, label: a.settings.name }))} />
          <button type="button" className="primary" onClick={() => void copy()}>Copy</button>
          <button type="button" onClick={() => setCopyFrom(null)}>Cancel</button>
        </div>
      )}
      <div className="bio">
        <nav className="bio-nav card" aria-label="Bio sections">
          {nav.map((s) => (
            <button type="button" key={s.id} className="bio-tab" aria-current={s.id === section ? "page" : undefined} onClick={(e) => { setSection(s.id); e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }}>
              {ICONS[s.id]}
              <span className="grow">{s.title}</span>
              <span className={s.full ? "bio-count full" : "bio-count"}>{s.full ? <CheckIcon /> : s.count}</span>
            </button>
          ))}
        </nav>
        {section === "train" ? (
          <TrainPanel accountId={accountId} train={view.train} onTrain={(train) => patch({ train })} changed={reload} />
        ) : section === "updates" ? (
          <UpdatesPanel accountId={accountId} changed={reload} />
        ) : current ? (
          <div className="bio-panel card">
            <h3 className="first">{current.title}</h3>
            {current.tip && <div className="tip"><BulbIcon /><div><b>{current.tip.title}</b><p>{current.tip.text}</p></div></div>}
            <BioFields fields={current.fields} values={values} onChange={change} />
          </div>
        ) : null}
      </div>
      <div className="save-all" role="status">
        {dirty && <span className="unsaved">Unsaved changes</span>}
        <span className="muted">{view.updatedAt ? `Last updated: ${new Date(view.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} by ${me?.name ?? "-"}` : "Not saved yet"}</span>
        <button type="button" className="primary" disabled={!dirty} onClick={save}>Save All Changes</button>
      </div>
    </div>
  );
}
