/** Authenticated API calls for native-speaker contributors. The token lives only on this device. */
import { kvGet, kvSet } from "@/lib/db";
import { apiFetch } from "./api";

export const getToken = () => kvGet("contribToken");
export const setToken = (t) => kvSet("contribToken", t || null);

async function authed(path, init = {}) {
  const token = await getToken();
  return apiFetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
}

const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const me = () => authed("/api/contrib/me");
export const listTranslations = (lang) => authed(`/api/contrib/translations?lang=${lang}`);
export const proposeTranslation = (body) => authed("/api/contrib/translations", json(body));
export const reviewTranslation = (id, approve, note) => authed(`/api/contrib/translations/${id}/review`, json({ approve, note }));
export const listRecordings = (lang, params = "") => authed(`/api/contrib/recordings?lang=${lang}${params}`);
export const reviewRecording = (id, approve) => authed(`/api/contrib/recordings/${id}/review`, json({ approve }));
export const logEvaluation = (body) => authed("/api/contrib/evaluations", json(body));

export async function uploadRecording(meta, wavBlob) {
  const fd = new FormData();
  fd.append("metadata", JSON.stringify(meta));
  fd.append("file", wavBlob, `${meta.id}.wav`);
  return authed("/api/contrib/recordings", { method: "POST", body: fd, timeoutMs: 60_000 });
}

export async function recordingAudioUrl(id) {
  const { apiBase } = await import("./api");
  const res = await fetch(`${apiBase()}/api/contrib/recordings/${id}/audio`, { headers: { Authorization: `Bearer ${await getToken()}` } });
  if (!res.ok) throw new Error("Audio unavailable");
  return URL.createObjectURL(await res.blob());
}
