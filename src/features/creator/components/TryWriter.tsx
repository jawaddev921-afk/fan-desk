"use client";
import { Loading } from "@/components/common/Loading.tsx";
import { useEffect, useRef, useState } from "react";
import { AI_NAME } from "@/config/ai.ts";
import { ClockIcon, HeartIcon, ImageIcon, LockIcon, SendIcon, TagIcon, UserIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { enc } from "@/lib/client/api.ts";
import type { LibraryView } from "@/features/library/types.ts";
import type { CreatorView, Item, SentPpv } from "../types.ts";
import { advance, approve, chatterReply, clockText, deliver, discard, fanTags, fire, flowResults, giveBack, isOpen, newSim, pauseChat, priceHint, resume, waitingJobs, withPicks, writerFailed, type Ask, type Entry, type Event, type Sim, type SimConfig } from "./autopilot.ts";

type Preview = { reply: string; needsHuman: boolean; reason: string; intent: string; summary: string; model: string };
function Thumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? <span className="sb-thumb missing"><ImageIcon /></span> : <img className="sb-thumb" src={src} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />;
}
const START_LABEL: Record<string, string> = { jazz: "Jazz decides", keywords: "keywords", content: "asks for content", subscribe: "on subscribe", resubscribe: "on resubscribe", online: "when online", like: "on a like", tip: "on a tip", buy: "on a purchase", expire: "on expiry" };
const ASKS: [string, string][] = [["A custom video", "can you make me a custom video?"], ["Something free", "send me something for free?"], ["Your best set's price", "how much is your best set?"], ["To meet up", "can we meet up sometime?"], ["Can't afford it", "i'd love to but i can't afford it right now"], ["Are you real?", "are you a real person or a bot?"], ["To stop", "stop messaging me"]];
const STARTERS = ["hey, how are you?", "what do you have for sale?", "what are you up to today?", "are you a real person or a bot?"];
const SKIPS: [string, number][] = [["1 min", 60_000], ["10 min", 600_000], ["1 hr", 3_600_000], ["8 hr", 28_800_000], ["1 day", 86_400_000]];
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };
const wait = (ms: number) => (ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : ms < 5_400_000 ? `${Math.round(ms / 60_000)} min` : ms < 172_800_000 ? `${Math.round(ms / 3_600_000)} h` : `${Math.round(ms / 86_400_000)} days`);

/** "Try": a made-up fan and a virtual clock. Everything the platform would do on its own (replies, bumps, follow-ups, flows, unsends, active hours) runs here, on autopilot, for this one fan. Nothing is saved or sent to anyone. */
export function TryWriter({ accountId, creator, view, handleChats, onClose }: { accountId: string; creator: string; view: CreatorView; handleChats: boolean; onClose: () => void }) {
  const { call, run } = useSession();
  const [baseCfg, setCfg] = useState<SimConfig | null>(null);
  const [picks, setPicks] = useState<Record<string, boolean>>({});
  const [mass, setMass] = useState<SentPpv[]>([]);
  const [massText, setMassText] = useState("");
  const [massPrice, setMassPrice] = useState("0");
  const [massMedia, setMassMedia] = useState<{ id: string; type: string }[]>([]);
  const [massPick, setMassPick] = useState<number | null>(null);
  const [sim, setSim] = useState<Sim | null>(null);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("10");
  const [tag, setTag] = useState("");
  const [fast, setFast] = useState(true);
  const [chatter, setChatter] = useState("");
  const [teach, setTeach] = useState<{ id: number; text: string } | null>(null);
  const [taught, setTaught] = useState<number[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const queued = useRef<Event[]>([]); // what the fan did while the writer was busy
  const zone = view.advanced.timezone || browserZone();

  useEffect(() => {
    void run(async () => {
      const base = `/api/accounts/${enc(accountId)}/creator/items`;
      const get = async <K extends "bump" | "flow" | "product" | "fanlist" | "script">(kind: K) => (await call<{ items: Item<K>[] }>("GET", `${base}?kind=${kind}`)).items;
      const [bumps, flows, products, lists, scripts] = await Promise.all([get("bump"), get("flow"), get("product"), get("fanlist"), get("script")]);
      const c: SimConfig = { creator, enabled: view.flags.enabled, handleChats, bumpOn: view.flags.bump, adv: { ...view.advanced, timezone: zone }, targeting: view.targeting, bumps, flows, products, lists, scripts };
      setCfg(c);
      // her real mass messages (sent to 3+ fans), then the Message Library messages for this creator
      const sent = (await call<{ ppvs: SentPpv[] }>("GET", `/api/accounts/${enc(accountId)}/creator/ppvs?kind=mass`).catch(() => ({ ppvs: [] }))).ppvs.slice(0, 30);
      const lib = await call<LibraryView>("GET", "/api/library").catch(() => null);
      const saved: SentPpv[] = (lib?.messages ?? []).filter((m) => !m.accountIds.length || m.accountIds.includes(accountId)).map((m) => ({ text: m.text || m.title, price: m.price, media: m.media, sentAt: m.createdAt }));
      setMass([...saved, ...sent]);
      setSim(newSim({ name: "Sam", spend: 0, subscribedDays: 30, tags: [], lists: [] }, Date.now()));
    });
  }, [accountId, call, run, creator, handleChats, view, zone]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [sim?.entries.length, busy]);
  const cfg = baseCfg ? withPicks(baseCfg, picks) : null;
  if (!cfg || !sim) return <Modal title={`Try ${AI_NAME}`} onClose={onClose}><Loading /></Modal>;

  /** Runs the clock; every time the writer is asked, waits for its answer and carries on. */
  const settle = async (state: { sim: Sim; ask: Ask | null }) => {
    let cur = state;
    setBusy(true);
    try {
      while (cur.ask) {
        setSim(cur.sim);
        let answer: { reply: string; needsHuman: boolean; reason: string } | null = null;
        try {
          const p = await call<Preview>("POST", `/api/accounts/${enc(accountId)}/creator/preview`, { turns: cur.ask.turns, followUp: cur.ask.kind === "followup", ...(cur.ask.instruction ? { instruction: cur.ask.instruction } : {}) });
          answer = { reply: p.reply, needsHuman: p.needsHuman, reason: p.reason };
        } catch (err) {
          // a timeout or an error is not a hand-off: say so and stop, the fan's message stays unanswered
          cur = { sim: writerFailed(cur.sim, err instanceof Error ? err.message : "error"), ask: null };
          break;
        }
        cur = resume(deliver(cur.sim, cfg, cur.ask, answer!, auto), cfg);
      }
    } finally {
      setSim(cur.sim);
      setBusy(false);
    }
    const more = queued.current.splice(0); // the fan kept going meanwhile: handle it as one batch
    if (more.length) {
      let next = cur.sim;
      for (const ev of more) next = fire(next, cfg, ev);
      await settle(advance(next, cfg, fast && cfg.adv.delay.on ? cfg.adv.delay.max * 1000 + 1000 : 0));
    }
  };
  const happen = (ev: Event) => { if (busy) { if (ev.t === "message") { queued.current.push(ev); setSim({ ...sim, entries: [...sim.entries, { id: sim.seq + queued.current.length, at: sim.now, kind: "fan", text: ev.text }] }); } return; } const next = fire(sim, cfg, ev); setSim(next); void settle(advance(next, cfg, fast && cfg.adv.delay.on ? cfg.adv.delay.max * 1000 + 1000 : 0)); };
  const skip = (ms: number) => { if (!busy) void settle(advance(sim, cfg, ms)); };
  const profile = (patch: Partial<Sim["fan"]>) => setSim({ ...sim, fan: { ...sim.fan, ...patch } });
  const money = Math.max(0, Number(amount) || 0);
  const queue = waitingJobs(sim, cfg);
  const open = isOpen(cfg.adv, sim.now);
  const tags = fanTags(sim);
  const hint = priceHint(sim);
  const results = flowResults(sim);

  const kindOf = (t: string) => (t.startsWith("Handed to a person") || t.startsWith("A manager paused") ? "warn" : t.startsWith("Flow") || t.startsWith("Goal") || t.startsWith("Follow-back") || t.includes("credited") ? "flow" : t.startsWith("The platform tags") ? "tag" : /skipped|ignored|Unsent|waits/.test(t) ? "quiet" : "");
  const line = (e: Entry) => {
    if (e.kind === "system") return <div key={e.id} className={`sim-evt ${kindOf(e.text)}`}>{e.text}</div>;
    const side = e.kind === "fan" ? "in" : "out";
    return (
      <div key={e.id} className={`sb-wrap ${side}`}>
        <span className="sb-meta">{e.kind === "fan" ? sim.fan.name : e.kind === "draft" ? `Draft from ${AI_NAME} · not sent` : creator}{e.tag && <span className="sb-tag">{e.tag}</span>}<span className="faint">{clockText(e.at, zone)}</span></span>
        <div className={`sb ${e.kind === "draft" ? "sb-draft" : side}${e.unsent ? " unsent" : ""}${e.chatter ? " sb-human" : ""}`}>
          {e.text}
          {e.note && <span className="sb-ai">{e.note}</span>}
          {(e.price || e.media) ? (
            <span className={`sb-ppv${e.unlocked ? " open" : ""}`}><LockIcon />{e.unlocked ? `Unlocked · paid $${e.price}` : e.price ? `PPV $${e.price}` : "Free media"}{e.media ? ` · ${e.media} media` : ""}</span>
          ) : null}
          {e.items?.length ? (
            <span className={`sb-media${e.price && !e.unlocked ? " locked" : ""}`} aria-label={e.price && !e.unlocked ? "Locked media" : "Media"}>
              {e.items.slice(0, 4).map((m) => <Thumb key={m.id} src={`/api/accounts/${enc(accountId)}/creator/vault-thumb?id=${enc(m.id)}`} />)}
              {e.media && e.media > 4 ? <i className="sb-more">+{e.media - 4}</i> : null}
              {e.price && !e.unlocked ? <b className="sb-lock"><LockIcon /></b> : null}
            </span>
          ) : null}
          {e.price && !e.unlocked && e.kind === "jazz" ? <button type="button" className="sb-unlock" disabled={busy} onClick={() => happen({ t: "unlock", entry: e.id })}>Fan unlocks for ${e.price}</button> : null}
        </div>
        {e.unsent && <span className="sb-note">unsent</span>}
        {(e.kind === "jazz" || e.kind === "draft") && !e.chatter && !e.tag?.startsWith("Script") && (() => {
          const at = sim.entries.findIndex((x) => x.id === e.id);
          const fans: string[] = [];
          for (let k = at - 1; k >= 0; k--) { const x = sim.entries[k]!; if (x.kind === "fan") fans.unshift(x.text); else if (x.kind !== "system") break; }
          if (!fans.length) return null;
          if (taught.includes(e.id)) return <span className="sb-note">Saved to Train</span>;
          return teach?.id === e.id ? (
            <div className="teach">
              <textarea aria-label="How she would reply" autoFocus value={teach.text} onChange={(ev) => setTeach({ id: e.id, text: ev.target.value })} />
              <div className="row"><button type="button" className="primary" disabled={!teach.text.trim()} onClick={() => void saveTeach(e, fans)}>Save to Train</button><button type="button" onClick={() => setTeach(null)}>Cancel</button></div>
            </div>
          ) : <button type="button" className="ghost teach-btn" onClick={() => setTeach({ id: e.id, text: e.text })}>Teach {AI_NAME}</button>;
        })()}
        {e.kind === "draft" && <div className="row"><button type="button" className="primary" onClick={() => setSim(approve(sim, cfg, e.id))}>Approve &amp; send</button><button type="button" onClick={() => setSim(discard(sim, e.id))}>Skip</button></div>}
      </div>
    );
  };
  /** "Teach": her corrected reply becomes a Train sample (the fan messages before it, her answer), the same as answering it in Train. */
  const saveTeach = (entry: Entry, fans: string[]) => run(async () => {
    const base = `/api/accounts/${enc(accountId)}/creator`;
    const answer = (teach?.text ?? "").trim();
    if (!answer) return;
    await call("POST", `${base}/items`, { kind: "sample", live: true, data: { category: "Try Jazz", title: fans.at(-1)!.slice(0, 60), fan: fans.slice(-6).map((t) => t.slice(0, 500)) } });
    const made = (await call<{ items: Item<"sample">[] }>("GET", `${base}/items?kind=sample`)).items.reduce((a, b) => (b.id > a.id ? b : a));
    await call("PUT", `${base}/train`, { key: `custom/${made.id}`, response: answer });
    setTaught([...taught, entry.id]);
    setTeach(null);
  });
  const act = (label: string, icon: React.ReactNode, ev: Event) => <button type="button" className="sim-act" disabled={busy} onClick={() => happen(ev)}>{icon}{label}</button>;

  return (
    <Modal size="xl" title={`Try ${AI_NAME}`} onClose={onClose} footer={<><span className="muted grow">Simulation only: nothing is saved or sent to a real fan.</span><button type="button" disabled={busy} onClick={() => setSim(newSim({ name: sim.fan.name, spend: 0, subscribedDays: sim.fan.subscribedDays, tags: [], lists: [] }, Date.now()))}>Start over</button><button type="button" className="primary" onClick={onClose}>Done</button></>}>
      <div className="sim">
        <section className="sim-chat">
          <header className="sim-head">
            <span className="sim-ava">{(sim.fan.name || "?").slice(0, 1).toUpperCase()}</span>
            <div className="grow"><b>{sim.fan.name || "Practice fan"}</b><span className="sim-state"><i className={sim.online ? "on" : ""} />{sim.online ? "online" : "offline"}{sim.human ? (sim.paused ? " · paused: a person has the chat" : " · escalated to a person") : ` · ${AI_NAME} handles the chat`}</span><span className="sim-tags">{tags.map((t) => <span key={t} className={`sim-tag t-${t.replace(/\s+/g, "").toLowerCase()}`}>{t}</span>)}</span></div>
            <label className="inline sim-sw">Autopilot <input type="checkbox" role="switch" aria-label="Autopilot" checked={auto} onChange={(e) => setAuto(e.target.checked)} /></label>
          </header>
          <div className="sim-log" role="log" aria-label="Practice chat">
            {!sim.entries.length && <div className="sim-empty"><SendIcon /><b>Start a conversation</b><p className="muted">Write as the fan, or use the controls beside or below the chat. {AI_NAME} replies, bumps, follows up and runs your flows by itself.</p><div className="choices">{STARTERS.map((x) => <button type="button" className="choice" key={x} disabled={busy} onClick={() => happen({ t: "message", text: x })}>{x}</button>)}</div></div>}
            {sim.entries.map(line)}
            {busy && <div className="sb-wrap out"><span className="sb-meta">{AI_NAME} is writing…</span><div className="sb out"><span className="sim-typing"><i /><i /><i /></span></div></div>}
            <div ref={end} />
          </div>
          <form className="sim-input" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { happen({ t: "message", text: text.trim() }); setText(""); } }}>
            <input aria-label="Fan message" placeholder="Type as the fan…" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="primary" disabled={!text.trim()} aria-label="Send"><SendIcon /></button>
          </form>
          {sim.human ? (
            <form className="sim-input sim-human" onSubmit={(e) => { e.preventDefault(); if (chatter.trim()) { setSim(chatterReply(sim, cfg, chatter)); setChatter(""); } }}>
              <input aria-label="Reply as the chatter" placeholder={`Reply as ${creator}'s team…`} value={chatter} onChange={(e) => setChatter(e.target.value)} />
              <button type="submit" disabled={!chatter.trim()}>Reply</button>
              <button type="button" className="primary" disabled={busy} onClick={() => void settle(advance(giveBack(sim, cfg), cfg, fast && cfg.adv.delay.on ? cfg.adv.delay.max * 1000 + 1000 : 0))}>Give back to {AI_NAME}</button>
            </form>
          ) : (
            <div className="sim-lock"><LockIcon /><span className="grow">The reply box is locked while {AI_NAME} handles this chat, so nobody writes over {AI_NAME}.</span><button type="button" disabled={busy} onClick={() => setSim(pauseChat(sim, cfg))}>Pause {AI_NAME} for this chat</button></div>
          )}
        </section>

        <aside className="sim-side">
          <div className="card sim-clock">
            <span className="sim-time"><ClockIcon />{clockText(sim.now, zone)}</span>
            <span className={`sim-avail ${open ? "ok" : "bad"}`}><i />{open ? `${creator} is available` : `${creator} is outside active hours`}</span>
            <div className="sim-skips" role="group" aria-label="Skip time">{SKIPS.map(([label, ms]) => <button key={label} type="button" disabled={busy} onClick={() => skip(ms)}>+{label}</button>)}</div>
            <label className="inline sim-sw">Skip the message delay automatically <input type="checkbox" role="switch" checked={fast} onChange={(e) => setFast(e.target.checked)} /></label>
          </div>

          <div className="card sim-card">
            <h4>The fan does something</h4>
            <div className="sim-grid2">
              {act("Subscribes", <UserIcon />, { t: "subscribe" })}
              {act("Comes online", <i className="sim-dot on" />, { t: "online" })}
              {act("Goes offline", <i className="sim-dot" />, { t: "offline" })}
              {act("Likes a post", <HeartIcon />, { t: "like" })}
              {act("Turns auto-renew off", <ClockIcon />, { t: "renewoff" })}
              {act("Subscription expires", <ClockIcon />, { t: "expire" })}
              {act("Resubscribes", <UserIcon />, { t: "resubscribe" })}
            </div>
            <div className="row"><span className="num-field"><span className="muted">$</span><input type="number" min={1} aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></span><button type="button" disabled={busy || !money} onClick={() => happen({ t: "tip", amount: money })}>Tips</button><button type="button" disabled={busy || !money} onClick={() => happen({ t: "buy", amount: money })}>Buys a PPV</button></div>
            <div className="row"><label className="search-box grow"><TagIcon /><input aria-label="Tag" placeholder="Tag the fan…" value={tag} onChange={(e) => setTag(e.target.value)} /></label><button type="button" disabled={busy || !tag.trim()} onClick={() => { happen({ t: "tag", tag: tag.trim() }); setTag(""); }}>Tag</button></div>
          </div>

          <div className="card sim-card">
            <h4>The fan asks for something</h4>
            <div className="choices">{ASKS.map(([label, line]) => <button key={label} type="button" className="choice" disabled={busy} onClick={() => happen({ t: "message", text: line })}>{label}</button>)}</div>
          </div>

          <div className="card sim-card">
            <h4>Send a mass message</h4>
            <p className="muted fine">Pick one (or write your own). It arrives like a mass message with its price and media; then answer as the fan to see how {AI_NAME} carries it on.</p>
            {mass.length > 0 && (
              <div className="mass-list" role="listbox" aria-label="Pick a mass message">
                {mass.map((m, i) => (
                  <button key={i} type="button" role="option" aria-selected={massPick === i} className={`mass-item${massPick === i ? " on" : ""}`} onClick={() => { setMassPick(i); setMassText(m.text); setMassPrice(String(m.price || 0)); setMassMedia(m.media); }}>
                    <span className="mass-text">{m.text}</span>
                    <span className="mass-meta">
                      <span className={m.price ? "chip price" : "chip"}>{m.price ? `$${m.price}` : "Free"}</span>
                      {m.media.length > 0 && <span className="chip">{m.media.length} media</span>}
                      <span className="muted">{m.fans ? `sent to ${m.fans} fans` : "Message Library"}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <textarea aria-label="Mass message text" placeholder="Or write one…" value={massText} onChange={(e) => { setMassText(e.target.value); setMassMedia([]); setMassPick(null); }} />
            {massMedia.length > 0 && <p className="muted fine">{massMedia.length} media attached ({massMedia.filter((m) => m.type === "video").length} videos)</p>}
            <div className="row"><span className="num-field"><span className="muted">$</span><input type="number" min={0} aria-label="Mass message price" value={massPrice} onChange={(e) => setMassPrice(e.target.value)} /></span><button type="button" disabled={busy || !massText.trim()} onClick={() => { happen({ t: "mass", text: massText.trim(), price: Math.max(0, Number(massPrice) || 0), media: massMedia.length, items: massMedia }); setMassText(""); setMassMedia([]); setMassPick(null); }}>Send to this fan</button></div>
          </div>

          <details className="card sim-card">
            <summary><h4>What this test uses</h4></summary>
            <p className="muted fine">Switch products, bump messages and flows on or off for this test only. Nothing is saved.</p>
            {([["Products", "p", baseCfg!.products.map((x) => ({ id: x.id, name: `${x.data.name} · $${x.data.price}`, on: x.live }))], ["Bump messages", "b", baseCfg!.bumps.map((x) => ({ id: x.id, name: `${x.data.trigger}: ${x.data.message.slice(0, 40)}`, on: x.live }))], ["Scripts", "s", (baseCfg!.scripts ?? []).map((x) => ({ id: x.id, name: `${x.data.name} (${START_LABEL[x.data.startsOn ?? "jazz"]})`, on: x.live }))], ["Flows", "f", baseCfg!.flows.map((x) => ({ id: x.id, name: `${x.data.title}${x.data.status !== "active" ? " (draft)" : ""}`, on: x.live && x.data.status === "active" }))]] as const).map(([title, key, rows]) => (
              <div key={key}><b className="fine">{title}</b>{rows.length === 0 ? <p className="muted fine">None yet.</p> : <div className="choices">{rows.map((r) => { const on = picks[`${key}:${r.id}`] ?? r.on; return <button key={r.id} type="button" className="choice" aria-pressed={on} onClick={() => setPicks({ ...picks, [`${key}:${r.id}`]: !on })}>{r.name}</button>; })}</div>}</div>
            ))}
          </details>

          <details className="card sim-card" open>
            <summary><h4>The fan</h4></summary>
            <div className="sim-fan">
              <label>Name<input value={sim.fan.name} onChange={(e) => profile({ name: e.target.value })} /></label>
              <label>Spent ($)<input type="number" min={0} value={sim.fan.spend} onChange={(e) => profile({ spend: Math.max(0, Number(e.target.value)) })} /></label>
              <label>Subscribed (days ago)<input type="number" min={0} value={sim.fan.subscribedDays} onChange={(e) => profile({ subscribedDays: Math.max(0, Number(e.target.value)) })} /></label>
            </div>
            <div className="choices">
              <button type="button" className="choice" aria-pressed={sim.fan.tags.includes("Super Fan")} onClick={() => profile({ tags: sim.fan.tags.includes("Super Fan") ? sim.fan.tags.filter((t) => t !== "Super Fan") : [...sim.fan.tags, "Super Fan"] })}>Super Fan</button>
              {cfg.lists.map((l) => <button type="button" className="choice" key={l.id} aria-pressed={sim.fan.lists.includes(l.id)} onClick={() => profile({ lists: sim.fan.lists.includes(l.id) ? sim.fan.lists.filter((x) => x !== l.id) : [...sim.fan.lists, l.id] })}>On list: {l.data.name}</button>)}
              {tags.filter((t) => t !== "Super Fan").map((t) => <span className="chip" key={t}>{t}</span>)}
            </div>
          </details>

          {sim.escalations.length > 0 && (
            <div className="card sim-card">
              <h4>{AI_NAME} escalations</h4>
              <ul className="sim-queue">{sim.escalations.map((x, i) => <li key={i}><span>{clockText(x.at, zone)}</span>{x.reason}</li>)}</ul>
            </div>
          )}
          {results.length > 0 && (
            <div className="card sim-card">
              <h4>Flow results for this fan</h4>
              <ul className="sim-queue">{results.map((r, i) => <li key={i}><span>{r.running ? "running" : "done"}</span>{r.title}: {r.replied ? "replied" : "no reply yet"}, ${r.sales} in sales</li>)}</ul>
            </div>
          )}
          <div className="card sim-card">
            <h4>What this fan pays</h4>
            {hint.count ? <p className="muted">{hint.count} purchase{hint.count > 1 ? "s" : ""}. Max ${hint.max}, average ${hint.avg}. A price with AI Pricing on stays between ${Math.round(hint.avg * 0.5)} and ${Math.round(hint.avg * 1.5)}.</p> : <p className="muted">No purchases yet, so prices are not changed.</p>}
          </div>

          <div className="card sim-card">
            <h4>Waiting to happen</h4>
            {queue.length === 0 ? <p className="muted">Nothing is queued.</p> : <ol className="sim-queue">{queue.slice(0, 8).map((j, i) => <li key={i}><span>in {wait(j.in)}</span>{j.label}</li>)}</ol>}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
