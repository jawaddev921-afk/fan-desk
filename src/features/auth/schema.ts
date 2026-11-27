// Sign-up rules that the server enforces and the sign-up form also checks while typing. No imports, so the browser can use it.
export const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200;
const MAX_NAME = 60;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// Password rules (NIST style: length and a common-password check, no "must contain a symbol" rules).
// shortcut: tiny list of the most common 10+ character passwords; upgrade to a breached-password check (e.g. HIBP k-anonymity) when real users sign up.
const COMMON = new Set([
  "1234567890", "12345678910", "0123456789", "1234512345", "password123", "password1234", "password12345", "passw0rd123",
  "qwertyuiop", "qwerty12345", "qwerty123456", "1q2w3e4r5t", "1qaz2wsx3edc", "iloveyou123", "letmein1234", "welcome1234",
  "administrator", "abcdefghij", "abcd123456", "changeme123", "trustno1234", "football123", "baseball123", "superman123",
]);

/** What is wrong with the name, or null. The name is shown in the dashboard and used in the emails we send. */
export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter your name.";
  if (n.length > MAX_NAME) return `Use at most ${MAX_NAME} characters.`;
  if (/[<>\r\n]/.test(n)) return "Use letters, numbers and spaces only.";
  return null;
}

/** Everything wrong with this password, in plain words. Empty list = acceptable. */
export function passwordProblems(password: string, email = ""): string[] {
  const p: string[] = [];
  if (password.length < MIN_PASSWORD) p.push(`Use at least ${MIN_PASSWORD} characters (you have ${password.length}).`);
  else if (password.length > MAX_PASSWORD) p.push(`Use at most ${MAX_PASSWORD} characters.`);
  else {
    const lower = password.toLowerCase();
    const local = email.trim().toLowerCase().split("@")[0];
    if (COMMON.has(lower)) p.push("That password is too common. Try a few unrelated words.");
    else if (/^(.)\1+$/.test(password)) p.push("Do not repeat one character. Try a few unrelated words.");
    else if (lower === email.trim().toLowerCase() || (local.length >= 5 && lower === local)) p.push("The password cannot be your email address.");
  }
  return p;
}
