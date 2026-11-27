// Calls our own API from the browser. The custom header is what the server's CSRF check looks for.
export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  /** Set once the session provider has dealt with the error (a 401 sends the user to the login page). */
  handled = false;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fan-desk" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `HTTP ${res.status}`, data.fields);
  return data as T;
}

export const enc = encodeURIComponent;
