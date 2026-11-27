"use client";
import { Pager, usePaging } from "@/components/common/Pager.tsx";
import { Loading } from "@/components/common/Loading.tsx";
import { useDialogs } from "@/components/common/Dialogs.tsx";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDownIcon, CopyIcon, DownloadIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, ImageIcon, MicIcon, MoreIcon, PlusIcon, SearchIcon, UserIcon, VideoIcon } from "@/components/common/icons.tsx";
import { Select } from "@/components/common/Select.tsx";
import { useSession } from "@/features/accounts/components/session.tsx";
import { parseRows, renderMessage } from "../schema.ts";
import type { LibraryMessage, LibraryView } from "../types.ts";

type Draft = { id: number | null; title: string; text: string; price: string; aiPricing: boolean; folderId: number | null; accountIds: string[] };
const blank = (folderId: number | null): Draft => ({ id: null, title: "", text: "", price: "0", aiPricing: false, folderId, accountIds: [] });

export function LibraryScreen() {
  const { me, call, run } = useSession();
  const { confirm, prompt } = useDialogs();
  const [lib, setLib] = useState<LibraryView | null>(null);
  const [folder, setFolder] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [hasMedia, setHasMedia] = useState(false);
  const [acct, setAcct] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pasted, setPasted] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const accounts = me?.accounts ?? [];

  const load = useCallback(() => run(async () => setLib(await call<LibraryView>("GET", "/api/library"))), [call, run]);
  useEffect(() => { void load(); }, [load]);
  const act = (fn: () => Promise<unknown>) => run(async () => { await fn(); await load(); });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lib?.messages ?? []).filter(
      (m) =>
        (folder === "all" || m.folderId === folder) &&
        (!hasMedia || m.media.length > 0) &&
        (!acct || m.accountIds.length === 0 || m.accountIds.includes(acct)) &&
        (!q || m.title.toLowerCase().includes(q) || m.text.toLowerCase().includes(q)),
    );
  }, [lib, folder, search, hasMedia, acct]);
  const { slice: pageRows, pager } = usePaging(shown);

  if (!lib) return <Loading />;
  const accountName = (id: string) => accounts.find((a) => a.accountId === id)?.settings.name ?? id;

  const edit = (m: LibraryMessage) => setDraft({ id: m.id, title: m.title, text: m.text, price: String(m.price), aiPricing: m.aiPricing, folderId: m.folderId, accountIds: m.accountIds });
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const { id, price, ...rest } = draft;
    void act(async () => {
      await call(id === null ? "POST" : "PUT", id === null ? "/api/library/messages" : `/api/library/messages/${id}`, { ...rest, price: Number(price) || 0 });
      setDraft(null);
    });
  };
  const importRows = (e: FormEvent) => {
    e.preventDefault();
    const rows = parseRows(pasted ?? "");
    if (rows.length) void act(async () => { await call("POST", "/api/library/import", { folderId: folder === "all" ? null : folder, rows }); setPasted(null); });
  };
  const addFolder = () => {
    void prompt("Folder name").then((name) => void (name && act(() => call("POST", "/api/library/folders", { name }))));
  };
  const saveSettings = (fallbackName: string, capitalize: boolean) => act(() => call("PUT", "/api/library/settings", { fallbackName, capitalize }));
  const sample = (m: LibraryMessage) => renderMessage(m.text, "sam smith", lib.settings);

  const current = folder === "all" ? null : lib.folders.find((f) => f.id === folder);
  return (
    <>
    <details className="card personalize" open>
      <summary><ChevronDownIcon /> Personalize your messages with <code className="name-chip">{"{name}"}</code></summary>
      <NameSettings key={`${lib.settings.fallbackName}${lib.settings.capitalize}`} s={lib.settings} onSave={saveSettings} />
    </details>
    <div className="library">
      <aside className="lib-folders">
        <div className="muted">Folders</div>
        <button className={"folder-item" + (folder === "all" ? " active" : "")} onClick={() => setFolder("all")}><FolderOpenIcon /> All messages</button>
        {lib.folders.map((f) => <button key={f.id} className={"folder-item" + (folder === f.id ? " active" : "")} onClick={() => setFolder(f.id)}>{folder === f.id ? <FolderOpenIcon /> : <FolderIcon />} {f.name}</button>)}
        <button className="folder-item add" onClick={addFolder}><FolderPlusIcon /> New folder</button>
      </aside>

      <section className="lib-main">
        <div className="row lib-head"><h3 className="grow first">{current ? current.name : "All messages"}</h3>
          {current && <details className="menu"><summary aria-label="Folder actions"><MoreIcon /></summary><button type="button" className="danger" onClick={() => void confirm(`Delete folder "${current.name}"? Its messages stay.`).then((ok) => void (ok && act(async () => { await call("DELETE", `/api/library/folders/${current.id}`); setFolder("all"); })))}>Delete folder</button></details>}</div>
        <div className="row">
          <label className="search-box"><SearchIcon /><input aria-label="Search messages" placeholder="Search messages" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label className="inline has-media">Has media <input type="checkbox" role="switch" checked={hasMedia} onChange={(e) => setHasMedia(e.target.checked)} /></label>
          <UserIcon /><Select ariaLabel="Creator" value={acct} onChange={setAcct} options={[{ value: "", label: "All creators" }, ...accounts.map((a) => ({ value: a.accountId, label: a.settings.name }))]} />
          {picked.length > 0 && <button className="danger" onClick={() => void confirm(`Delete ${picked.length} messages?`).then((ok) => void (ok && act(async () => { for (const id of picked) await call("DELETE", `/api/library/messages/${id}`); setPicked([]); })))}>Delete ({picked.length})</button>}
          <button onClick={() => setPasted("")}><DownloadIcon /> Import</button>
          <button className="primary" onClick={() => setDraft(blank(folder === "all" ? null : folder))}><PlusIcon /> New Message</button>
        </div>

        {pasted !== null && (
          <form className="card" onSubmit={importRows}>
            <label htmlFor="lib-paste">Paste rows from a sheet: Title, Text, Price (tab separated, one message per line)</label>
            <textarea id="lib-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <div className="savebar"><button className="primary" type="submit">Import {parseRows(pasted).length} messages</button><button type="button" onClick={() => setPasted(null)}>Cancel</button></div>
          </form>
        )}

        {draft && (
          <form className="card" onSubmit={save}>
            <label htmlFor="lib-title">Title</label>
            <input id="lib-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <label htmlFor="lib-text">Text (use {"{name}"} for the fan&apos;s first name)</label>
            <textarea id="lib-text" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
            <div className="two">
              <div><label htmlFor="lib-price">Price ($, 0 = free)</label><input id="lib-price" type="number" min="0" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
              <div><label htmlFor="lib-folder">Folder</label>
                <Select id="lib-folder" value={draft.folderId === null ? "" : String(draft.folderId)} onChange={(v) => setDraft({ ...draft, folderId: v ? Number(v) : null })} options={[{ value: "", label: "No folder" }, ...lib.folders.map((f) => ({ value: String(f.id), label: f.name }))]} /></div>
            </div>
            <label className="inline"><input type="checkbox" checked={draft.aiPricing} onChange={(e) => setDraft({ ...draft, aiPricing: e.target.checked })} /> AI Pricing (the assistant may adjust the price)</label>
            <div className="muted">For accounts (none ticked = all):</div>
            {accounts.map((a) => (
              <label className="inline" key={a.accountId}>
                <input type="checkbox" checked={draft.accountIds.includes(a.accountId)} onChange={(e) => setDraft({ ...draft, accountIds: e.target.checked ? [...draft.accountIds, a.accountId] : draft.accountIds.filter((x) => x !== a.accountId) })} /> {a.settings.name}
              </label>
            ))}
            <div className="savebar"><button className="primary" type="submit">{draft.id === null ? "Add message" : "Save message"}</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
          </form>
        )}

        {shown.length === 0 ? (
          <div className="empty">{lib.messages.length ? "No message matches." : "No messages yet. Add one, or import a sheet."}</div>
        ) : (
          <>
          <table className="lib-table">
            <thead><tr><th><input type="checkbox" className="tbl-check" aria-label="Select all" checked={picked.length > 0 && picked.length === shown.length} onChange={(e) => setPicked(e.target.checked ? shown.map((m) => m.id) : [])} /></th><th className="c-title">Title</th><th>Text</th><th><ImageIcon /> Media</th><th className="c-num">Price ($)</th><th className="c-ai">AI pricing</th><th><UserIcon /> Accounts</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {pageRows.map((m) => (
                <tr key={m.id}>
                  <td><input type="checkbox" className="tbl-check" aria-label={`Select ${m.title}`} checked={picked.includes(m.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} /></td>
                  <td className="c-title">{m.title}</td>
                  <td className="lib-text" title={`Looks like: ${sample(m)}`}>{m.text}</td>
                  <td>{m.media.length ? <span className="media-chip">{m.media[0]?.type === "video" ? <VideoIcon /> : m.media[0]?.type === "audio" ? <MicIcon /> : <ImageIcon />} {m.media.length}</span> : ""}</td>
                  <td className="c-num">{m.price > 0 ? m.price : ""}</td>
                  <td className="c-ai"><input type="checkbox" className="tbl-check" disabled checked={m.aiPricing} aria-label="AI Pricing" /></td>
                  <td>{m.accountIds.length ? m.accountIds.map((id) => <span className="chip" key={id}>{accountName(id)}</span>) : <span className="chip">All</span>}</td>
                  <td className="lib-actions">
                    <button onClick={() => edit(m)}>Edit</button>
                    <button className="danger" onClick={() => void confirm("Delete this message?").then((ok) => void (ok && act(() => call("DELETE", `/api/library/messages/${m.id}`))))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager {...pager} />
          </>
        )}
        <button className="add-row" onClick={() => setDraft(blank(folder === "all" ? null : folder))}><PlusIcon /> Add Message</button>
      </section>
    </div>
    </>
  );
}

function NameSettings({ s, onSave }: { s: LibraryView["settings"]; onSave: (name: string, cap: boolean) => void }) {
  const [name, setName] = useState(s.fallbackName);
  const [cap, setCap] = useState(s.capitalize);
  return (
    <div className="personalize-body">
      <p>Insert the placeholder <code className="name-chip">{"{name}"}</code> <button type="button" className="ghost" aria-label="Copy {name}" onClick={() => void navigator.clipboard?.writeText("{name}")}><CopyIcon /></button> in your message to replace it with the fan&apos;s first name when sending the message!</p>
      <div className="row">When a fan doesn&apos;t have a name in CRM, use this fallback nickname: <input aria-label="Fallback nickname" value={name} onChange={(e) => setName(e.target.value)} /><button type="button" disabled={!name.trim()} onClick={() => onSave(name, cap)}>Save</button></div>
      <div className="row"><span className="grow">Use upper case for the first letter in name (e.g. Derek)</span><input type="checkbox" role="switch" aria-label="Capitalise the first letter" checked={cap} onChange={(e) => { setCap(e.target.checked); onSave(name, e.target.checked); }} /></div>
    </div>
  );
}
