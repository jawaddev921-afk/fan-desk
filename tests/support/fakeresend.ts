// A fake of Resend's POST /emails that keeps every mail it is given, so a test can read the confirmation link. No real email is ever sent.
import http from "node:http";

export type SentMail = { from: string; to: string[]; subject: string; text: string; html: string; authorization: string };

export async function startFakeResend() {
  const mails: SentMail[] = [];
  const state = { fail: false };
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    if (req.method === "POST" && req.url === "/emails") {
      if (state.fail) {
        res.writeHead(422, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ name: "validation_error", message: "The to address is invalid." }));
      }
      mails.push({ ...JSON.parse(raw), authorization: String(req.headers.authorization ?? "") });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ id: "mail_" + mails.length }));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as import("node:net").AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, mails, state, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/** The token in the confirmation link of a mail. */
export const tokenOf = (mail: SentMail): string => /\/verify\?token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
