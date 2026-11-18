/** Local repositories for evidence, incidents and result submissions. Nothing here deletes data. */
import { decryptBlob, encryptBlob, sha256Hex, uuid } from "./crypto";
import { getDB, notifyChange } from "./db";
import { makeReference } from "./reference";
import { enqueue } from "@/services/sync";

const nowIso = () => new Date().toISOString();

// ---------------- evidence ----------------
/**
 * Save a captured image. `original` is preserved byte-for-byte and is the only thing hashed
 * and uploaded as evidence; `processed` (cropped/enhanced) is a derived convenience copy.
 */
export async function saveEvidence({ original, processed = null, kind = "result_sheet", source = "camera",
  location = null, pollingUnitCode = "", note = "", quality = null, capturedAt = nowIso() }) {
  const id = uuid();
  const sha256 = await sha256Hex(original);
  const db = await getDB();
  const duplicateOf = await db.getFromIndex("evidence", "sha256", sha256);
  const record = {
    id, kind, source, sha256, capturedAt, createdAt: nowIso(),
    reference: await makeReference("evidence", id, capturedAt),
    mimeType: original.type || "image/jpeg", size: original.size,
    location, pollingUnitCode: pollingUnitCode.trim(), note: note.trim(), quality,
    original: await encryptBlob(original),
    processed: processed ? await encryptBlob(processed) : null,
    processedSha256: processed ? await sha256Hex(processed) : null,
    duplicateOf: duplicateOf?.id ?? null,
    syncStatus: "pending", syncError: null, receipt: null,
  };
  await db.put("evidence", record);
  await enqueue("evidence", id);
  notifyChange("evidence");
  return record;
}

export async function listEvidence() {
  const all = await (await getDB()).getAll("evidence");
  return all.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function getEvidence(id) {
  return (await getDB()).get("evidence", id);
}

/** Decrypt and return the original (default) or processed image. */
export async function getEvidenceBlob(record, which = "original") {
  return decryptBlob(which === "processed" ? record.processed : record.original);
}

/** Re-hash the stored original and compare to the hash recorded at capture. */
export async function verifyEvidenceIntegrity(record) {
  const blob = await getEvidenceBlob(record);
  const now = await sha256Hex(blob);
  return { ok: now === record.sha256, recorded: record.sha256, current: now };
}

// ---------------- incidents ----------------
export async function saveIncident(data) {
  const id = uuid();
  const createdAt = nowIso();
  const record = {
    id, createdAt, reference: await makeReference("incident", id, createdAt),
    category: data.category, description: data.description.trim(), occurredAt: data.occurredAt || null,
    pollingUnitCode: (data.pollingUnitCode || "").trim(), locationText: (data.locationText || "").trim(),
    anonymous: data.anonymous !== false,
    reporterContact: data.anonymous !== false ? null : (data.reporterContact || "").trim() || null,
    evidenceIds: data.evidenceIds || [], language: data.language || null,
    status: "allegation", syncStatus: "pending", syncError: null, receipt: null,
  };
  const db = await getDB();
  await db.put("incidents", record);
  await enqueue("incident", id);
  notifyChange("incidents");
  return record;
}

export async function listIncidents() {
  const all = await (await getDB()).getAll("incidents");
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------- result submissions ----------------
export async function saveResult(data) {
  const id = uuid();
  const createdAt = nowIso();
  const record = { ...data, id, createdAt, reference: await makeReference("result", id, createdAt),
    source: "independent_submission", syncStatus: "pending", syncError: null, receipt: null };
  const db = await getDB();
  await db.put("results", record);
  await enqueue("result", id);
  notifyChange("results");
  return record;
}

export async function listResults() {
  const all = await (await getDB()).getAll("results");
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
