"use client";
import { Loading } from "@/components/common/Loading.tsx";
import Link from "next/link";
import { AI_NAME } from "@/config/ai.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "@/features/assistant/components/Composer.tsx";
import { DraftCard } from "@/features/assistant/components/DraftCard.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { fanName, TierMark, avatarSrc } from "@/features/inbox/components/FanListItem.tsx";
import { lockedLabel, readMessage } from "@/features/inbox/schema.ts";
import { LockIcon } from "@/components/common/icons.tsx";
import type { FanDetail } from "@/app/api/_lib/views.ts";
import type { MediaView } from "@/features/inbox/types.ts";
import { Avatar } from "@/components/common/Avatar.tsx";
import { ApiError, enc } from "@/lib/client/api.ts";
import { useInbox } from "../inbox-context.tsx";

// One fan's chat: the messages, the AI's drafts waiting for approval, and the box to answer yourself.
// It mixes the inbox feature (messages) with the assistant feature (drafts, replies), so it lives in the app layer.
export function Conversation({ fanId }: { fanId: string }) {
  const { account, call, run, refreshMe } = useSession();
  const { reload } = useInbox();
  const accountId = account?.accountId;
  const [detail, setDetail] = useState<FanDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const accountBase = accountId ? `/api/accounts/${enc(accountId)}` : "";
  const base = accountId ? `${accountBase}/fans/${enc(fanId)}` : "";

  const load = useCallback(async () => {
    if (!base) return;
    try {
      setDetail(await call<FanDetail>("GET", base));
      setMissing(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else throw err;
    }
  }, [base, call]);

  // Opening a chat reads that one chat again in the background (new messages, fresh media links); what is stored shows at once.
  useEffect(() => {
    if (!base) return;
    call<{ imported: number }>("POST", `${base}/refresh`).then(async (r) => { if (r.imported > 0) await load(); }).catch(() => {});
  }, [base, call, load]);

  useEffect(() => {
    setDetail(null);
    load().catch(() => {});
    const t = setInterval(() => {
      if (!document.hidden) load().catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, [load]);

  const pending = detail?.outbox.filter((o) => ["draft", "unknown", "failed"].includes(o.status)) ?? [];
  const lastId = detail?.messages.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight; // newest at the bottom, only when something new arrived
  }, [lastId, pending.length, fanId]);

  // After any change: show it here, update the list, and refresh the waiting count in the top bar.
  async function afterChange() {
    await load();
    reload();
    await refreshMe().catch(() => {});
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    await run(async () => {
      await fn();
      await afterChange();
    });
    setBusy(false);
  }

  if (missing) return <div className="empty">This chat was not found for the selected account.</div>;
  if (!detail) return <Loading />;
  const { fan, messages } = detail;

  return (
    <>
      <div className="detail-head">
        <Link href="/inbox" className="back" aria-label="Back to the list">&larr;<span className="back-label"> Inbox</span></Link>
        <Avatar name={fanName(fan)} id={fan.fan_id} src={avatarSrc(fan)} />
        <div className="who-fan">
          <div className="name">{fanName(fan)} {fan.username && <span className="muted">@{fan.username}</span>}</div>
          <div className="meta">
            <TierMark tier={fan.tier} score={fan.score} />
            <span>${Number(fan.total_spend).toFixed(2)} spent</span>
            <span>intent: {fan.intent}</span>
            {fan.mode === "human" ? <span className="tag human">with a human</span> : <span className="tag ai">{AI_NAME}</span>}
          </div>
        </div>
        <div className="row">
          {fan.mode === "human" ? (
            <button disabled={busy} onClick={() => void act(() => call("POST", `${base}/release`))}>Hand back to AI</button>
          ) : (
            <>
              <button disabled={busy} onClick={() => void act(() => call("POST", `${base}/takeover`))}>Take over</button>
              <button className="ghost" disabled={busy} onClick={() => void act(() => call("POST", `${base}/regenerate`))}>Regenerate</button>
            </>
          )}
        </div>
      </div>
      <div className="scroll" ref={scroller}>
        {(fan.ai_summary || fan.handoff_reason) && (
          <div className="ai-note">
            {fan.ai_summary && <><b>Summary:</b> {fan.ai_summary}</>}
            {fan.handoff_reason && <>{fan.ai_summary && <br />}<b>Handed to a human:</b> {fan.handoff_reason}</>}
          </div>
        )}
        {messages.map((m) => {
          const note = readMessage(m.text);
          if (note.kind === "payment") return <div key={m.id} className="msg system"><span className="pay-chip">{note.label}{note.amount != null ? ` \u00b7 $${note.amount.toFixed(2)}` : ""}</span></div>;
          return (
          <div key={m.id} className={`msg ${m.source === "system" ? "system" : m.direction}`}>
            {m.direction === "out" && <span className="src">{m.source}</span>}
            {note.kind === "tip" && <span className="pay-chip">Tip{note.amount != null ? ` \u00b7 $${note.amount.toFixed(2)}` : ""}</span>}
            {note.kind === "tip" ? (note.text && <div>{note.text}</div>) : note.kind === "text" ? note.text : null}
            {note.kind === "media-only" && m.media.length === 0 && <span className="media-tag">{note.count} media</span>}
            {m.media.some((x) => x.locked) && <LockedMedia items={m.media.filter((x) => x.locked)} />}
            {m.media.filter((x) => !x.locked).map((x) => <MediaItem key={x.id} item={x} src={x.viewable && !x.locked && !x.gone ? `${accountBase}/media?message=${m.id}&media=${encodeURIComponent(x.id)}` : null} />)}
          </div>
          );
        })}
        {pending.map((o) => (
          <DraftCard
            key={o.id}
            item={o}
            busy={busy}
            onApprove={(text) => void act(() => call("POST", `/api/outbox/${o.id}/approve`, { text }))}
            onReject={() => void act(() => call("POST", `/api/outbox/${o.id}/reject`, {}))}
          />
        ))}
      </div>
      <Composer
        onSend={async (text) => {
          let sent = false;
          await run(async () => {
            await call("POST", `${base}/reply`, { text });
            sent = true;
            await afterChange();
          });
          return sent;
        }}
      />
    </>
  );
}

/**
 * A photo/gif/video/audio in a message. Locked (paid) media is only labelled; viewable media comes through our media route. Until the
 * file has loaded the page shows a shimmering box of the right size, then the picture sharpens in (blur-up). A file that does not load is
 * tried again by itself (a few times with growing pauses, about 40 seconds in all: a connection to the provider times out now and then, and an old picture can need a long search), then a "Retry" button appears. The
 * file is tried as what the message says it is; a "video" that is really a picture (a preview) is then tried as a picture.
 */
const RETRY_PAUSES = [1500, 3000, 6000, 10_000, 15_000];
function MediaItem({ item, src }: { item: MediaView; src: string | null }) {
  const asVideo = item.type === "video" || item.type === "gif";
  const [as, setAs] = useState<"first" | "picture" | "failed">("first");
  const [attempt, setAttempt] = useState(0); // 0 = first try; a changed address makes the browser fetch again
  const [loaded, setLoaded] = useState(false);
  const label = item.locked ? `Locked ${item.type}${item.price ? ` \u00b7 $${item.price}` : ""}` : item.type;
  if (item.gone) return <span className="media-tag">{item.type} removed from the chat</span>; // the sender deleted it: nothing to retry
  if (!src) return <span className="media-tag">{label}</span>;
  if (as === "failed") {
    return (
      <button type="button" className="media-tag retry" onClick={() => { setAs("first"); setAttempt(0); setLoaded(false); }}>
        {item.type} unavailable &middot; Retry
      </button>
    );
  }
  const url = attempt ? `${src}&retry=${attempt}` : src;
  const onError = () => {
    if (as === "first" && asVideo) setAs("picture"); // a "video" that is really a picture
    else if (attempt < RETRY_PAUSES.length) window.setTimeout(() => setAttempt((n) => n + 1), RETRY_PAUSES[attempt]); // try again after a pause (an old picture may need a long search in the background)
    else setAs("failed");
  };
  const onLoad = () => setLoaded(true);
  const sized = item.width && item.height ? { width: item.width, height: item.height } : {};
  const box = `media-box${loaded ? " done" : ""}${sized.width ? "" : " unsized"}`;
  if (as === "first" && item.type === "audio") return <audio key={attempt} className="msg-audio" src={url} controls preload="none" onError={onError} />;
  if (as === "first" && item.type === "gif") return <span className={box}><video key={attempt} className="msg-media" src={url} {...sized} autoPlay loop muted playsInline onError={onError} onLoadedData={onLoad} /></span>; // OnlyFans "gifs" are short mp4 videos
  if (as === "first" && item.type === "video") return <span className={box}><video key={attempt} className="msg-media" src={url} {...sized} controls preload="metadata" onError={onError} onLoadedData={onLoad} /></span>;
  return <span className={box}><img key={attempt} className="msg-media" src={url} {...sized} alt={label} loading="lazy" decoding="async" onError={onError} onLoad={onLoad} /></span>;
}

/** The paid media of a message: the provider gives no picture, so this is a frosted box of the right shape with a lock and the words. */
function LockedMedia({ items }: { items: MediaView[] }) {
  const one = items.length === 1 && items[0].width && items[0].height ? items[0] : null;
  return (
    <span className={`locked-box${one ? "" : " wide"}`} role="img" aria-label={lockedLabel(items)}>
      {one && <svg className="locked-shape" viewBox={`0 0 ${one.width} ${one.height}`} aria-hidden="true" />}
      <span className="locked-words"><LockIcon /> {lockedLabel(items)}</span>
    </span>
  );
}
