/** REST client for the AwaVote FastAPI backend. */
export function apiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  if (typeof location !== "undefined") return `${location.protocol}//${location.hostname}:8000`;
  return "http://localhost:8000";
}

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
  /** Retryable = server/network trouble; permanent = the server rejected the data itself. */
  get retryable() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export async function apiFetch(path, { timeoutMs = 30000, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(0, e?.name === "AbortError" ? "Request timed out" : "Network unavailable");
  } finally {
    clearTimeout(timer);
  }
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, body?.detail ?? body);
  return body;
}

export async function checkServer() {
  try {
    await apiFetch("/api/health", { timeoutMs: 5000 });
    return true;
  } catch {
    return false;
  }
}
