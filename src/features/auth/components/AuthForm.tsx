"use client";
import { useRouter } from "next/navigation";
import { AI_NAME } from "@/config/ai.ts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client/api.ts";
import { EyeIcon, EyeOffIcon } from "@/components/common/icons.tsx";
import { EMAIL_RE, MIN_PASSWORD, nameProblem, passwordProblems } from "../schema.ts";

type Fields = { name?: string; email?: string; password?: string; terms?: string };
type Mode = "login" | "signup";

// The same rules the server enforces (../policy.ts); the server stays the judge.
function problems(mode: Mode, name: string, email: string, password: string, terms: boolean): Fields {
  const p: Fields = {};
  if (mode === "login") {
    if (!email) p.email = "Enter your email.";
    if (!password) p.password = "Enter your password.";
    return p;
  }
  const nameIssue = nameProblem(name);
  if (nameIssue) p.name = nameIssue;
  if (!EMAIL_RE.test(email)) p.email = email ? "That does not look like an email address. Example: name@example.com." : "Enter your email.";
  if (!password) p.password = `Choose a password of at least ${MIN_PASSWORD} characters.`;
  else p.password = passwordProblems(password, email)[0];
  if (!terms) p.terms = "Please confirm this to create your account.";
  return p;
}

type Summary = { message: string; fields?: Fields; offerLogin: boolean };

export function AuthForm({ mode, allowSignup, initialEmail = "", notice }: { mode: Mode; allowSignup: boolean; initialEmail?: string; notice?: string }) {
  const router = useRouter();
  const signup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null); // set once the confirmation email is sent
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Fields>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (signup ? nameRef : initialEmail ? passwordRef : emailRef).current?.focus();
  }, [initialEmail, signup]);
  useEffect(() => {
    if (summary) summaryRef.current?.focus();
  }, [summary]);

  const switchTo = (m: Mode) => router.push(`/${m}${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`);

  // once a field shows an error, clear it as soon as the value is acceptable (and the summary with the last one)
  function recheck(next: { name: string; email: string; password: string; terms: boolean }) {
    const p = problems(mode, next.name, next.email.trim(), next.password, next.terms);
    setErrors((cur) => {
      const kept: Fields = {};
      for (const k of ["name", "email", "password", "terms"] as const) if (cur[k] && p[k]) kept[k] = p[k];
      if (!kept.name && !kept.email && !kept.password && !kept.terms) setSummary(null);
      return kept;
    });
  }

  function onBlur(field: "name" | "email" | "password") {
    const value = field === "name" ? name : field === "email" ? email : password;
    if (!value) return;
    setErrors((cur) => ({ ...cur, [field]: problems(mode, name, email.trim(), password, terms)[field] }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = email.trim();
    setErrors({});
    setSummary(null);
    const p = problems(mode, name, clean, password, terms);
    if (p.name || p.email || p.password || p.terms) {
      setErrors(p);
      setSummary({ message: "Please fix the highlighted fields.", fields: p, offerLogin: false });
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ verify?: string }>("POST", `/api/auth/${mode}`, signup ? { name: name.trim(), email: clean, password, terms } : { email: clean, password });
      if (r.verify === "email_sent") {
        setBusy(false);
        setSentTo(clean); // the account is created when the emailed link is opened
        return;
      }
    } catch (err) {
      setBusy(false);
      const fields = err instanceof ApiError ? err.fields : undefined;
      if (fields) setErrors(fields);
      setSummary({ message: err instanceof Error ? err.message : "Something went wrong.", fields, offerLogin: err instanceof ApiError && err.status === 409 });
      if (!signup) setPassword("");
      return;
    }
    router.replace(signup ? "/connection?welcome=1" : "/inbox");
  }

  const entries = summary?.fields ? Object.entries(summary.fields).filter(([, v]) => v) : [];
  const describe = (name: keyof Fields, hint?: string) => [hint, errors[name] ? `e-${name}` : null].filter(Boolean).join(" ") || undefined;

  if (sentTo) {
    return (
      <div className="auth-card" role="status">
        <h2>Check your email</h2>
        <p className="muted">We sent a confirmation link to <b>{sentTo}</b>. Open it to finish creating your account. The link works once and expires in 24 hours.</p>
        <p className="muted">
          Nothing there? Look in spam, or{" "}
          <button type="button" className="linkish" disabled={busy} onClick={(e) => void onSubmit(e as unknown as FormEvent)}>send it again</button>
          {" · "}
          <button type="button" className="linkish" onClick={() => setSentTo(null)}>use a different email</button>
        </p>
      </div>
    );
  }

  return (
    <form id="authForm" className="auth-card" noValidate aria-labelledby="authTitle" onSubmit={onSubmit}>
      {allowSignup && (
        <div className="seg" role="group" aria-label="Log in or create an account">
          <button type="button" aria-pressed={!signup} className={!signup ? "active" : ""} onClick={() => switchTo("login")}>Log in</button>
          <button type="button" aria-pressed={signup} className={signup ? "active" : ""} onClick={() => switchTo("signup")}>Create account</button>
        </div>
      )}
      <h2 id="authTitle">{signup ? "Create your account" : "Welcome back"}</h2>
      <p className="muted">{signup ? "It takes a minute. We will email you a link to confirm your address, then you connect your OFMAPI key." : "Log in to see your inbox."}</p>
      {!allowSignup && <div className="note">Sign-ups are closed on this server. Ask the owner to create an account for you.</div>}
      {notice && <div className="note">{notice}</div>}

      <div id="authSummary" ref={summaryRef} className="summary-err" role="alert" tabIndex={-1} hidden={!summary}>
        {summary && (entries.length > 1 ? (
          <>
            <strong>Please fix {entries.length} things:</strong>
            <ul>
              {entries.map(([k, v]) => (
                <li key={k}>
                  <a href={`#a-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`a-${k}`)?.focus(); }}>{v}</a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <strong>{entries.length === 1 ? entries[0][1] : summary.message}</strong>
        ))}
        {summary?.offerLogin && (
          <p><button type="button" className="linkish" onClick={() => router.push(`/login?email=${encodeURIComponent(email.trim())}`)}>Log in instead</button></p>
        )}
      </div>

      {signup && (
        <div className="field">
          <label htmlFor="a-name">Your name</label>
          <input
            id="a-name" name="name" type="text" autoComplete="name" ref={nameRef} value={name} aria-invalid={!!errors.name} aria-describedby={describe("name")}
            onChange={(e) => { setName(e.target.value); recheck({ name: e.target.value, email, password, terms }); }}
            onBlur={() => onBlur("name")}
          />
          <div className="field-err" id="e-name" hidden={!errors.name}>{errors.name}</div>
        </div>
      )}

      <div className="field">
        <label htmlFor="a-email">Email</label>
        <input
          id="a-email" name="email" type="email" inputMode="email" autoComplete={signup ? "email" : "username"} autoCapitalize="none" spellCheck={false}
          ref={emailRef} value={email} aria-invalid={!!errors.email} aria-describedby={describe("email")}
          onChange={(e) => { setEmail(e.target.value); recheck({ name, email: e.target.value, password, terms }); }}
          onBlur={() => onBlur("email")}
        />
        <div className="field-err" id="e-email" hidden={!errors.email}>{errors.email}</div>
      </div>

      <div className="field">
        <label htmlFor="a-password">Password</label>
        <div className="pw">
          <input
            id="a-password" name="password" type={showPw ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"}
            ref={passwordRef} value={password} aria-invalid={!!errors.password} aria-describedby={describe("password", signup ? "h-password" : undefined)}
            onChange={(e) => { setPassword(e.target.value); recheck({ name, email, password: e.target.value, terms }); }}
            onBlur={() => onBlur("password")}
          />
          <button type="button" className="ghost pw-toggle" aria-pressed={showPw} aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)}>
            {showPw ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {signup && (
          <div className="hint" id="h-password">
            <progress max={14} value={Math.min(password.length, 14)} aria-hidden="true" />
            <span aria-live="polite" className={password.length >= MIN_PASSWORD ? "ok-text" : ""}>
              {password.length === 0 ? `At least ${MIN_PASSWORD} characters.` : password.length < MIN_PASSWORD ? `${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? "" : "s"}` : "Good length."}
            </span>
            <span className="muted"> A few unrelated words works well.</span>
          </div>
        )}
        <div className="field-err" id="e-password" hidden={!errors.password}>{errors.password}</div>
      </div>

      {signup && (
        <div className="field consent">
          <label className="check" htmlFor="a-terms">
            <input
              id="a-terms" name="terms" type="checkbox" checked={terms} aria-invalid={!!errors.terms} aria-describedby={describe("terms")}
              onChange={(e) => { setTerms(e.target.checked); recheck({ name, email, password, terms: e.target.checked }); }}
            />
            <span>I understand {AI_NAME} only writes drafts that a person approves before they are sent, and I am responsible for following OnlyFans&apos; rules on my account.</span>
          </label>
          <div className="field-err" id="e-terms" hidden={!errors.terms}>{errors.terms}</div>
        </div>
      )}

      <button className="primary block" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? (signup ? "Creating account…" : "Logging in…") : signup ? "Create account" : "Log in"}
      </button>
      {allowSignup && (
        <p className="switch-line muted">
          {signup ? "Already have an account?" : "New here?"}{" "}
          <button type="button" className="linkish" onClick={() => switchTo(signup ? "login" : "signup")}>{signup ? "Log in" : "Create an account"}</button>
        </p>
      )}
    </form>
  );
}
