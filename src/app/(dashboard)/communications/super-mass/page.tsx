"use client";
import { useState } from "react";
import { DownloadIcon, PlusIcon, SearchIcon } from "@/components/common/icons.tsx";
import { FlashNote } from "@/components/common/FlashNote.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { useItems } from "@/features/creator/components/useItems.tsx";

const STATUSES = ["All", "Scheduled", "Sending", "Sent", "Partially failed", "Stopped", "Unsent"];
const STEPS = ["Target", "Refine", "Message", "Pricing"];

/** Super Mass: campaigns that message whole lists. Only the first step of the wizard was recorded; nothing is sent. */
function NewSuperMass({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { items } = useItems(accountId, "fanlist", () => {});
  const [tab, setTab] = useState<"suggested" | "lists">("suggested");
  const [step, setStep] = useState(0);
  return (
    <Modal size="lg" title="New Super Mass" onClose={onClose}>
      <ol className="wizard-steps">{STEPS.map((s, i) => <li key={s} className={i === step ? "on" : i < step ? "done" : ""}><span>{i + 1}</span> {s}</li>)}</ol>
      {step === 0 ? (
        <>
          <div className="seg" role="tablist"><button type="button" role="tab" aria-selected={tab === "suggested"} className={tab === "suggested" ? "active" : ""} onClick={() => setTab("suggested")}>Suggested audiences</button><button type="button" role="tab" aria-selected={tab === "lists"} className={tab === "lists" ? "active" : ""} onClick={() => setTab("lists")}>Fan Lists</button></div>
          <p className="muted">Sends to everyone in the lists you pick, as they stand when you send. Sizes are this creator&apos;s share, and lists can overlap - the total below is what will actually be messaged.</p>
          {tab === "suggested" ? <div className="empty">No suggested audiences yet.</div> : items && items.length ? <div className="choices">{items.map((l) => <button type="button" className="choice" key={l.id}>{l.data.name}</button>)}</div> : <div className="empty">No lists yet. Create a fan list to target specific groups - like VIPs, non-spenders, or time-wasters.</div>}
          <div className="row"><span className="grow" /><button type="button" className="primary" onClick={() => setStep(1)}>Next →</button></div>
        </>
      ) : (
        <>
          <div className="note">{STEPS[step]} was not in the recording yet, so it is not built. Sending a Super Mass is not switched on.</div>
          <div className="row"><button type="button" onClick={() => setStep(step - 1)}>← Back</button>{step < 3 && <button type="button" className="primary" onClick={() => setStep(step + 1)}>Next →</button>}</div>
        </>
      )}
    </Modal>
  );
}

export default function SuperMassPage() {
  const { account } = useSession();
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className="creator">
      <div className="row"><h2 className="grow">Super Mass</h2></div>
      <FlashNote />
      <div className="row">
        <label className="search-box"><SearchIcon /><input aria-label="Search campaigns" placeholder="Search campaigns..." value={search} onChange={(e) => setSearch(e.target.value)} /></label><span className="grow" />
        <button type="button" className="primary" disabled={!account} onClick={() => setOpen(true)}><PlusIcon /> New Super Mass</button>
      </div>
      <div className="seg" role="tablist" aria-label="Status">{STATUSES.map((s) => <button key={s} type="button" role="tab" aria-selected={status === s} className={status === s ? "active" : ""} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <div className="row"><span className="grow" /><span className="link-btn"><DownloadIcon /> Export</span></div>
      <table className="data-table">
        <thead><tr><th>Message</th><th>Status</th><th>Progress</th><th>Audience</th><th>Reach</th><th>Sent</th><th>Earnings</th><th></th></tr></thead>
      </table>
      <div className="empty">No campaigns yet. Mass messages are not sent from Fan Desk yet.</div>
      {open && account && <NewSuperMass accountId={account.accountId} onClose={() => setOpen(false)} />}
    </div>
  );
}
