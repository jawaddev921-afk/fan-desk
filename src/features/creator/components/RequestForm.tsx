"use client";
import { Loading } from "@/components/common/Loading.tsx";
import { useEffect, useState, type FormEvent } from "react";
import { CheckIcon } from "@/components/common/icons.tsx";
import { api, ApiError, enc } from "@/lib/client/api.ts";
import { BIO_SECTIONS, type BioValue, type BioValues } from "../schema.ts";
import { BioFields } from "./BioTab.tsx";

/** The page behind a "Request from Creator" link: the whole bio on one page, no account needed. */
export function RequestForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [values, setValues] = useState<BioValues | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const path = `/api/request/${enc(token)}`;

  useEffect(() => {
    api<{ name: string; values: BioValues }>("GET", path).then((r) => { setName(r.name); setValues(r.values); }, (e) => setError(e instanceof Error ? e.message : "Could not open this link."));
  }, [path]);

  if (error) return <main className="page"><div className="empty">{error}</div></main>;
  if (!values) return <main className="page"><Loading /></main>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    api("PUT", path, { values }).then(() => setSaved(true), (err) => setError(err instanceof ApiError ? err.message : "Could not save."));
  };
  const change = (key: string, v: BioValue) => { setSaved(false); setValues({ ...values, [key]: v }); };

  return (
    <main className="page wide">
      <h2>Tell us about you{name ? `, ${name}` : ""}</h2>
      <div className="note">Answer in your own words. Your answers help your team write messages that sound like you. This page works with the link only, for 7 days.</div>
      <form className="creator" onSubmit={submit}>
        {BIO_SECTIONS.map((s) => (
          <section className="card bio-panel" key={s.id}>
            <h3 className="first">{s.title}</h3>
            <BioFields fields={s.fields} values={values} onChange={change} />
          </section>
        ))}
        <div className="savebar">
          <span className="muted" role="status">{saved ? <span className="ok-text"><CheckIcon /> Saved. Thank you!</span> : "Save when you are done. You can come back to this link and edit."}</span>
          <button className="primary" type="submit">Save my answers</button>
        </div>
      </form>
    </main>
  );
}
