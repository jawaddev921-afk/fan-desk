import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/common/Avatar.tsx";
import { ago } from "@/lib/client/format.ts";
import type { FanView } from "../types.ts";

/** Where the page loads a fan's photo from (our own route), or null when we have none. */
export const avatarSrc = (f: { account_id: string; fan_id: string; avatar_url: string | null }): string | null =>
  f.avatar_url ? `/api/accounts/${encodeURIComponent(f.account_id)}/avatar?fan=${encodeURIComponent(f.fan_id)}` : null;

export const fanName = (f: { name: string | null; username: string | null; fan_id: string }): string => f.name || f.username || f.fan_id;

export function TierMark({ tier, score }: { tier: string; score: number }) {
  return (
    <span className={`tier ${tier}`}>
      <i />
      {tier} {score}
    </span>
  );
}

/** One fan in a list: opens that fan's conversation. `tags` are the small labels (to review, with a human, ...). */
export function FanListItem({ fan, summary, tags, selected = false }: { fan: FanView; summary: string; tags?: ReactNode; selected?: boolean }) {
  return (
    <Link href={`/inbox/${fan.fan_id}`} className={`fan${selected ? " sel" : ""}`} aria-current={selected ? "true" : undefined}>
      <Avatar name={fanName(fan)} id={fan.fan_id} src={avatarSrc(fan)} />
      <span>
        <span className="fan-top">
          <span className="name">{fanName(fan)}</span>
          <span className="when">{ago(fan.last_message_at)}</span>
        </span>
        <span className="fan-sum">{summary}</span>
        <span className="fan-meta">
          {tags}
          <TierMark tier={fan.tier} score={fan.score} />
          <span>${Number(fan.total_spend).toFixed(0)}</span>
        </span>
      </span>
    </Link>
  );
}
