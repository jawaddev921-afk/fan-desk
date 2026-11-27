"use client";
import { DownloadIcon } from "@/components/common/icons.tsx";
import { FlashNote } from "@/components/common/FlashNote.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";

/** Expired Fans: the list of creators with the win-back status. Nothing is sent: win-back is not built, so the numbers are empty. */
export default function ExpiredFansPage() {
  const { me } = useSession();
  return (
    <div className="creator">
      <h2>Expired fans</h2>
      <p className="muted">Win back expired fans automatically. Review each creator&apos;s status and open their settings.</p>
      <FlashNote />
      <div className="note">Win-back messages are not switched on yet, so there is nothing to configure.</div>
      <table className="data-table">
        <thead><tr><th>Creator</th><th>Status</th><th>Available fans</th><th>Auto follows (14d)</th><th>Last run</th><th className="right"><span className="link-btn"><DownloadIcon /> Export</span></th></tr></thead>
        <tbody>
          {(me?.accounts ?? []).map((a) => <tr key={a.accountId}><td><span className="avatar-s">{a.settings.name.slice(0, 1)}</span> {a.settings.name}</td><td>Off</td><td>–</td><td>–</td><td>–</td><td><button type="button" disabled>Configure ›</button></td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
