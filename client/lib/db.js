/**
 * Browser-side offline database (IndexedDB). The backend's SQLite database is NOT
 * reachable from the browser; records reach it only through the sync engine + REST API.
 */
import { openDB } from "idb";

export const DB_NAME = "awavote";
export const DB_VERSION = 1;

let dbPromise;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const evidence = db.createObjectStore("evidence", { keyPath: "id" });
        evidence.createIndex("syncStatus", "syncStatus");
        evidence.createIndex("sha256", "sha256");
        evidence.createIndex("capturedAt", "capturedAt");
        const incidents = db.createObjectStore("incidents", { keyPath: "id" });
        incidents.createIndex("syncStatus", "syncStatus");
        const results = db.createObjectStore("results", { keyPath: "id" });
        results.createIndex("syncStatus", "syncStatus");
        results.createIndex("pollingUnitCode", "pollingUnitCode");
        const outbox = db.createObjectStore("outbox", { keyPath: "id" });
        outbox.createIndex("status", "status");
        db.createObjectStore("kv");
      },
      blocked() {
        console.warn("AwaVote DB upgrade blocked by another open tab");
      },
    });
  }
  return dbPromise;
}

/** Reset the cached connection (tests only). */
export function _resetDBForTests() {
  dbPromise = undefined;
}

// ---- change notifications (so lists refresh after background sync) ----
const bus = typeof EventTarget !== "undefined" ? new EventTarget() : null;
let channel = null;
if (typeof BroadcastChannel !== "undefined") {
  channel = new BroadcastChannel("awavote-db");
  channel.onmessage = (e) => bus?.dispatchEvent(new CustomEvent("change", { detail: e.data }));
}

export function notifyChange(store) {
  bus?.dispatchEvent(new CustomEvent("change", { detail: { store } }));
  channel?.postMessage({ store });
}

export function onChange(fn) {
  if (!bus) return () => {};
  const h = (e) => fn(e.detail);
  bus.addEventListener("change", h);
  return () => bus.removeEventListener("change", h);
}

// ---- key/value ----
export async function kvGet(key, fallback = null) {
  const v = await (await getDB()).get("kv", key);
  return v === undefined ? fallback : v;
}

export async function kvSet(key, value) {
  await (await getDB()).put("kv", value, key);
  notifyChange("kv");
}

export async function getDeviceId() {
  let id = await kvGet("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    await kvSet("deviceId", id);
  }
  return id;
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
