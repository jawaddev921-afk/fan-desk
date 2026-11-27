import "server-only";
import { config } from "../config.ts";
import { HttpError } from "../http.ts";

/** Sends one email through Resend. Throws a 502 the person can read if it did not go out. The key stays on the server. */
export async function sendEmail(mail: { to: string; subject: string; text: string; html: string }): Promise<void> {
  if (!config.resendApiKey) throw new HttpError(500, "Email is not set up on this server.");
  let res: Response;
  try {
    res = await fetch(`${config.emailApiUrl}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.emailFrom, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, "Could not send the email. Try again in a moment.");
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    console.error("[email] Resend refused the mail:", res.status, detail?.message ?? detail?.name ?? "");
    throw new HttpError(502, "Could not send the confirmation email. Check the address and try again.");
  }
}
