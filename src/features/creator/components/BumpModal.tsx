"use client";
import { useState } from "react";
import { ChatIcon, ImageIcon } from "@/components/common/icons.tsx";
import { EmojiPicker } from "@/components/common/EmojiPicker.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { Select } from "@/components/common/Select.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { BUMP_TRIGGERS } from "../schema.ts";
import type { ItemData } from "../types.ts";
import { FanLists } from "./FanLists.tsx";
import { ImportBumpModal } from "./ImportModals.tsx";
import { MediaPicker, Row } from "./ProductModal.tsx";

type Bump = ItemData["bump"];
export const blankBump = (): Bump => ({ message: "", price: 0, trigger: "Online", media: [], onlyLists: [], neverLists: [] });
/** Bumps saved before media and audience existed have no such fields. */
export const withDefaults = (b: Partial<Bump> & Pick<Bump, "message" | "price" | "trigger">): Bump => ({ ...blankBump(), ...b });

/** "Add New Message" for a bump: when it goes out, to whom, with what, and the text. */
export function BumpModal({ accountId, initial, changed, onSave, onClose }: { accountId: string; initial: { id: number | null; live: boolean; data: Bump }; changed: () => void; onSave: (id: number | null, live: boolean, data: Bump) => Promise<unknown>; onClose: () => void }) {
  const { setFlash } = useSession();
  const [d, setD] = useState<Bump>(initial.data);
  const [price, setPrice] = useState(String(initial.data.price));
  const [importing, setImporting] = useState(false);
  const set = (patch: Partial<Bump>) => setD({ ...d, ...patch });
  const create = async () => {
    if (!d.message.trim()) return setFlash({ kind: "err", text: "Write the message." });
    await onSave(initial.id, initial.live, { ...d, message: d.message.trim(), price: Number(price) || 0 });
    onClose();
  };
  return (
    <Modal size="lg" title={initial.id === null ? "Add new message" : "Edit message"} onClose={onClose} extra={<button type="button" className="primary" onClick={() => setImporting(true)}>Import PPVs</button>} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => void create()}>{initial.id === null ? "Create" : "Save"}</button></>}>
      <Row title="Trigger event" help="Sent when a fan comes online, tips, comments on your post, or likes your post."><Select ariaLabel="Trigger event" value={d.trigger} onChange={(trigger) => set({ trigger })} options={BUMP_TRIGGERS.map((t) => ({ value: t, label: t }))} /></Row>
      <Row title="Audience" help="Limit who this bump message can reach. Leave both empty to send it to everyone who passes the trigger event. If a fan is on both an include and an exclude list, the exclude list wins.">
        <div className="fan-targets">
          <div><b>Send only to</b><p className="muted">Only fans on these lists get this message. Empty means everyone.</p><FanLists accountId={accountId} value={d.onlyLists} onChange={(onlyLists) => set({ onlyLists })} changed={changed} /></div>
          <div><b>Never send to</b><p className="muted">Fans on these lists never get this message, even if they match above.</p><FanLists accountId={accountId} value={d.neverLists} onChange={(neverLists) => set({ neverLists })} changed={changed} /></div>
        </div>
      </Row>
      <Row icon={<ImageIcon />} title="Media"><MediaPicker accountId={accountId} media={d.media} price={Number(price) || 0} onChange={(media) => set({ media })} /></Row>
      <Row title="Minimum price" help="Set the minimum price for the bundle"><span className="num-field"><span className="muted">$</span><input type="number" min="0" step="0.01" aria-label="Minimum price" value={price} onChange={(e) => setPrice(e.target.value)} /></span></Row>
      <Row icon={<ChatIcon />} title="Text" help={<>Put <code>{"{name}"}</code> in your message to replace it with the fan&apos;s first name from your CRM. Fans with no CRM name get your fallback nickname instead.</>}>
        <div className="row"><textarea className="grow" aria-label="Message" placeholder="Type your message here..." value={d.message} onChange={(e) => set({ message: e.target.value })} /><EmojiPicker onPick={(e) => set({ message: d.message + e })} /></div>
      </Row>
      {importing && <ImportBumpModal accountId={accountId} onClose={() => setImporting(false)} onImport={async (b, edit) => {
        if (edit) { setD({ ...d, message: b.message, trigger: b.trigger }); setPrice(String(b.price)); }
        else { await onSave(null, true, { ...blankBump(), ...b }); onClose(); }
        setImporting(false);
      }} />}
    </Modal>
  );
}
