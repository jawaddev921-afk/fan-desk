"use client";
import { useState, type ReactNode } from "react";
import { BulbIcon, ImageIcon, SparkIcon, UserIcon } from "@/components/common/icons.tsx";
import { Modal } from "@/components/common/Modal.tsx";
import { Select } from "@/components/common/Select.tsx";
import { TagInput } from "@/components/common/TagInput.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { AI_NAME } from "@/config/ai.ts";
import type { ItemData } from "../types.ts";
import { ImportProductModal } from "./ImportModals.tsx";
import { mediaCounts, VaultPicker } from "./VaultPicker.tsx";

type Product = ItemData["product"];
export const blankProduct = (): Product => ({ name: "", price: 0, description: "", tags: [], progression: 1, bundle: false, media: [] });

export const Row = ({ icon, title, help, children }: { icon?: ReactNode; title: string; help?: ReactNode; children: ReactNode }) => (
  <div className="mrow"><div><b className="mrow-title">{icon}{title}</b>{help && <p className="muted">{help}</p>}</div><div className="mrow-ctl">{children}</div></div>
);

export function MediaPicker({ accountId, media, price, onChange }: { accountId: string; media: Product["media"]; price?: number; onChange: (m: Product["media"]) => void }) {
  const [open, setOpen] = useState(false);
  const c = mediaCounts(media);
  return (
    <div className="media-pick">
      <div className="row">
        <button type="button" onClick={() => setOpen(true)}><ImageIcon /> Select media from Vault</button>
        {media.length > 0 && <><span className="media-count">{c.photos > 0 && <span>{c.photos} photos</span>}{c.videos > 0 && <span>{c.videos} videos</span>}</span><button type="button" className="ghost" onClick={() => onChange([])}>Clear</button></>}
      </div>
      {open && <VaultPicker accountId={accountId} selected={media} price={price} onDone={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** "Add New Bundle" / "Edit Bundle". `onSave(id, live, data)` writes it. */
export function ProductModal({ accountId, accountName, initial, onSave, onClose }: { accountId: string; accountName: string; initial: { id: number | null; live: boolean; data: Product }; onSave: (id: number | null, live: boolean, data: Product) => Promise<unknown>; onClose: () => void }) {
  const { setFlash } = useSession();
  const [d, setD] = useState<Product>(initial.data);
  const [price, setPrice] = useState(String(initial.data.price));
  const [importing, setImporting] = useState(false);
  const set = (patch: Partial<Product>) => setD({ ...d, ...patch });
  const create = async () => {
    if (!d.name.trim()) return setFlash({ kind: "err", text: "Give the bundle a name." });
    await onSave(initial.id, initial.live, { ...d, name: d.name.trim(), price: Number(price) || 0 });
    onClose();
  };
  const aiTip = d.media.length ? `${AI_NAME} cannot describe media yet.` : "No media selected. Choose media first.";

  return (
    <Modal size="lg" title={initial.id === null ? "Add new bundle" : "Edit bundle"} onClose={onClose} extra={<button type="button" className="primary" onClick={() => setImporting(true)}>Import PPVs</button>} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => void create()}>{initial.id === null ? "Create" : "Save"}</button></>}>
      <Row icon={<UserIcon />} title="Account"><Select ariaLabel="Account" value={accountId} onChange={() => {}} options={[{ value: accountId, label: accountName }]} /></Row>
      <Row icon={<ImageIcon />} title="Media"><MediaPicker accountId={accountId} media={d.media} price={Number(price) || 0} onChange={(media) => set({ media })} /></Row>
      <Row title="Name" help="Name is for your internal organization only"><input aria-label="Name" value={d.name} onChange={(e) => set({ name: e.target.value })} /></Row>
      <Row title="Minimum price" help="Set the minimum price for the bundle"><span className="num-field"><span className="muted">$</span><input type="number" min="0" step="0.01" aria-label="Minimum price" value={price} onChange={(e) => setPrice(e.target.value)} /></span></Row>
      <Row icon={<SparkIcon />} title={`${AI_NAME} assistant`}><button type="button" disabled title={aiTip}><SparkIcon /> Describe with AI</button></Row>
      <Row title="Description" help="Write a detailed description of the content (media) in a few sentences. Avoid vague or implied descriptions: the more detail, the better. No need to include metadata like duration or photo count.">
        <div className="counted-area"><textarea aria-label="Description" maxLength={1000} placeholder="Describe the content (media) in a few sentences" value={d.description} onChange={(e) => set({ description: e.target.value })} /><span className="count-hint">{d.description.length} / 1000</span></div>
      </Row>
      <Row title="Tags"><TagInput id="pm-tags" value={d.tags} placeholder="E.g. Solo, Toys, Lingerie, Beach, Shower, Vibrator" onChange={(tags) => set({ tags })} /></Row>
      <div className="tip"><BulbIcon /><div><p>Products are what {AI_NAME} sells. The description is what it reads to decide when to offer one.</p></div></div>
      {importing && (
        <ImportProductModal accountId={accountId} start="recent" onClose={() => setImporting(false)}
          onImport={async (p, edit) => {
            if (edit) { setD({ ...d, name: p.name, description: p.description, media: p.media }); setPrice(String(p.price)); }
            else { await onSave(null, true, { ...blankProduct(), ...p }); onClose(); }
            setImporting(false);
          }} />
      )}
    </Modal>
  );
}
