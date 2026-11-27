import "server-only";
import { isAvatarUrl } from "@/features/inbox/schema.ts";
import { accountsOfUser, getConnection, type Account } from "@/features/accounts/queries.ts";
import { parseSettings } from "@/features/accounts/schema.ts";
import { claudeKeyLast4, requireAccount, webhookUrl } from "@/features/accounts/service.ts";
import { outboxOfFan, pendingByFan, pendingCount } from "@/features/assistant/queries.ts";
import { fanCounts, getFan, listFans, recentMessages } from "@/features/inbox/queries.ts";
import { requireFanId, SYNC_WINDOW_DAYS } from "@/features/inbox/service.ts";
import { config } from "@/lib/config.ts";
import { must, type Handler, type SessionUser } from "@/lib/http.ts";
import type { AccountView, MeView } from "@/features/accounts/types.ts";
import type { OutboxView } from "@/features/assistant/types.ts";
import type { FanRow, FanView, MessageView } from "@/features/inbox/types.ts";

/** A fan's chat with the AI drafts waiting for approval: the one API answer that mixes two features. */
export type FanDetail = { fan: FanView; messages: MessageView[]; outbox: OutboxView[] };

// Read models: screens that mix data from several features. Features own their writes; this layer only reads.

async function publicAccount(a: Account): Promise<AccountView> {
  return {
    accountId: a.account_id,
    username: a.username,
    displayName: a.display_name,
    aiEnabled: a.ai_enabled === 1,
    hasAvatar: isAvatarUrl(a.avatar_url),
    sendMode: a.send_mode,
    note: a.note,
    settings: parseSettings(a.settings),
    counts: { pending: await pendingCount(a.account_id), ...(await fanCounts(a.account_id)) },
    sync: { status: a.sync_status, chats: a.sync_chats, messages: a.sync_messages, windowDays: SYNC_WINDOW_DAYS, error: a.sync_error },
  };
}

export async function meView(user: SessionUser): Promise<MeView> {
  const conn = await getConnection(user.id);
  const aiLast4 = await claudeKeyLast4(user.id);
  return {
    email: user.email,
    name: user.name,
    aiProvider: config.aiProvider,
    aiModel: config.aiProvider === "ollama" ? `ollama:${config.ollamaModel}` : config.aiModel,
    aiKey: aiLast4 ? { last4: aiLast4 } : null,
    connection: conn
      ? {
          keyLast4: conn.key_last4,
          teamName: conn.team_name,
          creditsBalance: conn.credits_balance,
          webhook: {
            url: webhookUrl(conn.webhook_token),
            registered: !!conn.webhook_id,
            error: conn.webhook_error,
            publicUrlConfigured: !!config.publicUrl,
          },
        }
      : null,
    accounts: await Promise.all((await accountsOfUser(user.id)).map(publicAccount)),
  };
}

export const meHandler: Handler = ({ user }) => meView(user);

export const fansHandler: Handler = async (ctx): Promise<FanRow[]> => {
  const account = await requireAccount(ctx);
  const pending = await pendingByFan(account.account_id);
  return (await listFans(account.account_id, ctx.url.searchParams.get("tier"))).map((f) => ({ ...f, pending: pending.get(f.fan_id) ?? 0 }));
};

export const fanHandler: Handler = async (ctx): Promise<FanDetail> => {
  const account = await requireAccount(ctx);
  const fan = must(await getFan(account.account_id, requireFanId(ctx.params.fanId)));
  const messages = (await recentMessages(account.account_id, fan.fan_id, 200)).map((m) => ({ ...m, media: m.media.map(({ url, ...rest }) => ({ ...rest, viewable: url != null && !rest.gone })) }));
  return { fan, messages, outbox: await outboxOfFan(account.account_id, fan.fan_id) };
};
