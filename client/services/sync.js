/**
 * OfflineSync engine: a durable outbox in IndexedDB, flushed to the API when online.
 *
 * Guarantees:
 *  - Local records are never deleted by sync. Failures are kept and shown to the user.
 *  - Every record carries a client-generated UUID that the server treats as an idempotency
 *    key, so retries after a lost response cannot create duplicates.
 *  - Retryable failures (network, 5xx, 429) back off exponentially; permanent rejections
 *    (4xx) and conflicts (409) stop retrying and are flagged for attention.
 *  - Background Sync is used where the browser supports it; everywhere else we flush on
 *    app start, on the `online` event, on a timer while visible, and on demand.
 */
import { getDB, getDeviceId, kvSet, notifyChange } from "@/lib/db";
import { decryptBlob } from "@/lib/crypto";
import { ApiError, apiFetch, checkServer } from "./api";

const STORE = { evidence: "evidence", incident: "incidents", result: "results" };
const ORDER = { evidence: 0, incident: 1, result: 2 }; // evidence first: others may reference it
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;

export async function enqueue(entityType, entityId) {
  const db = await getDB();
  await db.put("outbox", {
    id: `${entityType}:${entityId}`, entityType, entityId, status: "pending",
    attempts: 0, nextAttemptAt: 0, lastError: null, createdAt: Date.now(),
  });
  notifyChange("outbox");
  requestBackgroundSync();
}

export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg && "sync" in reg) await reg.sync.register("awavote-outbox");
  } catch {
    /* unsupported or denied: foreground triggers still apply */
  }
}

function backoff(attempts) {
  const d = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempts - 1));
  return d * (0.75 + Math.random() * 0.5);
}

async function buildRequest(item, record) {
  if (item.entityType === "evidence") {
    const fd = new FormData();
    fd.append("metadata", JSON.stringify({
      id: record.id, kind: record.kind, sha256: record.sha256, captured_at: record.capturedAt,
      latitude: record.location?.latitude ?? null, longitude: record.location?.longitude ?? null,
      location_accuracy_m: record.location?.accuracy ?? null,
      polling_unit_code: record.pollingUnitCode || null, device_id: await getDeviceId(), note: record.note || null,
    }));
    fd.append("file", await decryptBlob(record.original), `${record.reference}.jpg`);
    return ["/api/evidence", { method: "POST", body: fd, timeoutMs: 120_000 }];
  }
  const json = (path, body) => [path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }];
  if (item.entityType === "incident") {
    return json("/api/incidents", {
      id: record.id, category: record.category, description: record.description,
      occurred_at: record.occurredAt || null, created_at: record.createdAt,
      polling_unit_code: record.pollingUnitCode || null, location_text: record.locationText || null,
      anonymous: record.anonymous, reporter_contact: record.anonymous ? null : record.reporterContact,
      evidence_ids: record.evidenceIds, language: record.language,
    });
  }
  const { id, createdAt, electionType, pollingUnitCode, state, constituency, figures, partyVotes, evidenceId, extractionMethod } = record;
  return json("/api/results", {
    id, created_at: createdAt, election_type: electionType, polling_unit_code: pollingUnitCode,
    state: state || null, constituency: constituency || null, ...figures,
    party_votes: partyVotes, evidence_id: evidenceId || null, extraction_method: extractionMethod,
  });
}

let flushing = null;

/** Flush due outbox items. Safe to call often; concurrent calls share one run. */
export function flushOutbox({ force = false } = {}) {
  if (!flushing) flushing = runFlush(force).finally(() => (flushing = null));
  return flushing;
}

async function runFlush(force) {
  const summary = { sent: 0, failed: 0, conflicts: 0, deferred: 0, offline: false };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    summary.offline = true;
    return summary;
  }
  const db = await getDB();
  const now = Date.now();
  const items = (await db.getAllFromIndex("outbox", "status", "pending"))
    .filter((i) => force || i.nextAttemptAt <= now)
    .sort((a, b) => ORDER[a.entityType] - ORDER[b.entityType] || a.createdAt - b.createdAt);

  for (const item of items) {
    const store = STORE[item.entityType];
    const record = await db.get(store, item.entityId);
    if (!record) {
      await db.put("outbox", { ...item, status: "failed", lastError: "Local record missing" });
      continue;
    }
    try {
      const [path, init] = await buildRequest(item, record);
      const res = await apiFetch(path, init);
      const entity = res.evidence || res.incident || res.result;
      await db.put(store, { ...record, syncStatus: "synced", syncError: null, receipt: res.receipt,
        serverStatus: entity?.status ?? null, syncedAt: new Date().toISOString() });
      await db.delete("outbox", item.id); // the record itself is kept; only the queue entry is done
      summary.sent++;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      const attempts = item.attempts + 1;
      if (err.retryable) {
        await db.put("outbox", { ...item, attempts, lastError: err.message, nextAttemptAt: Date.now() + backoff(attempts) });
        await db.put(store, { ...record, syncError: err.message });
        summary.deferred++;
        if (err.status === 0) break; // network is down: stop hammering
      } else {
        const status = err.status === 409 ? "conflict" : "failed";
        await db.put("outbox", { ...item, attempts, status, lastError: err.message });
        await db.put(store, { ...record, syncStatus: status, syncError: err.message });
        status === "conflict" ? summary.conflicts++ : summary.failed++;
      }
    }
  }
  // "Last sync" means the server was actually reached and nothing due was left unsent.
  const reached = summary.sent > 0 || (items.length === 0 && (await checkServer()));
  if (reached) await kvSet("lastSyncAt", new Date().toISOString());
  ["outbox", "evidence", "incidents", "results"].forEach(notifyChange);
  return summary;
}

/** Move a failed/conflicted item back to pending (user-initiated retry). */
export async function retryItem(id) {
  const db = await getDB();
  const item = await db.get("outbox", id);
  if (!item) return;
  await db.put("outbox", { ...item, status: "pending", nextAttemptAt: 0 });
  const store = STORE[item.entityType];
  const rec = await db.get(store, item.entityId);
  if (rec) await db.put(store, { ...rec, syncStatus: "pending" });
  notifyChange("outbox");
}

export async function outboxCounts() {
  const all = await (await getDB()).getAll("outbox");
  return all.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), { pending: 0, failed: 0, conflict: 0 });
}

export async function listOutbox() {
  return (await getDB()).getAll("outbox");
}

/** Wire up automatic triggers. Returns a cleanup function. */
export function startAutoSync() {
  const run = () => flushOutbox().catch(() => {});
  const onMsg = (e) => e.data?.type === "awavote-sync" && run();
  window.addEventListener("online", run);
  navigator.serviceWorker?.addEventListener("message", onMsg);
  const timer = setInterval(() => document.visibilityState === "visible" && run(), 60_000);
  run();
  return () => {
    window.removeEventListener("online", run);
    navigator.serviceWorker?.removeEventListener("message", onMsg);
    clearInterval(timer);
  };
}
