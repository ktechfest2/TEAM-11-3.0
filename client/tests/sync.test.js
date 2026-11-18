import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { _resetDBForTests, getDB } from "@/lib/db";
import { saveEvidence, saveIncident, verifyEvidenceIntegrity } from "@/lib/records";
import { flushOutbox, outboxCounts } from "@/services/sync";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const receipt = { record_id: "x", content_hash: "h", received_at: "2026-11-18T00:00:00Z", signature: "s", duplicate: false };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
  vi.stubGlobal("navigator", { onLine: true });
  vi.restoreAllMocks();
});

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], { type: "image/jpeg" });

describe("offline evidence storage", () => {
  it("stores the original encrypted at rest and verifies integrity", async () => {
    const rec = await saveEvidence({ original: jpeg() });
    const raw = await (await getDB()).get("evidence", rec.id);
    expect(raw.original.data).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(raw.original.data)[0]).not.toBe(0xff); // ciphertext, not the JPEG
    expect((await verifyEvidenceIntegrity(raw)).ok).toBe(true);
    expect(rec.reference).toMatch(/^AWV-EV-\d{8}-[2-9A-Z]{6}$/);
  });
  it("detects locally duplicated photos", async () => {
    const a = await saveEvidence({ original: jpeg() });
    const b = await saveEvidence({ original: jpeg() });
    expect(b.duplicateOf).toBe(a.id);
  });
});

describe("sync engine", () => {
  it("does nothing offline and loses nothing", async () => {
    navigator.onLine = false;
    await saveIncident({ category: "violence", description: "test report" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect((await flushOutbox()).offline).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await outboxCounts()).pending).toBe(1);
  });

  it("uploads evidence before reports, marks them synced and keeps the local records", async () => {
    await saveIncident({ category: "violence", description: "test report" });
    const ev = await saveEvidence({ original: jpeg() });
    const calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      return String(url).endsWith("/api/evidence") ? json(201, { evidence: { status: "submitted" }, receipt }) : json(201, { incident: { status: "allegation" }, receipt });
    });
    const s = await flushOutbox();
    expect(s.sent).toBe(2);
    expect(calls[0]).toMatch(/\/api\/evidence$/);
    const db = await getDB();
    expect((await db.get("evidence", ev.id)).syncStatus).toBe("synced");
    expect((await db.getAll("incidents"))[0].syncStatus).toBe("synced");
    expect(await db.count("outbox")).toBe(0);
    expect(await db.count("evidence")).toBe(1);
  });

  it("backs off on server errors and retries later", async () => {
    await saveIncident({ category: "other", description: "abc" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(503, { detail: "down" }));
    const s = await flushOutbox();
    expect(s.deferred).toBe(1);
    const [item] = await (await getDB()).getAll("outbox");
    expect(item.status).toBe("pending");
    expect(item.attempts).toBe(1);
    expect(item.nextAttemptAt).toBeGreaterThan(Date.now());
    expect((await flushOutbox()).deferred).toBe(0); // not due yet
  });

  it("flags conflicts for the user instead of discarding", async () => {
    const inc = await saveIncident({ category: "other", description: "abc" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(409, { detail: "different content" }));
    expect((await flushOutbox()).conflicts).toBe(1);
    const db = await getDB();
    expect((await db.get("incidents", inc.id)).syncStatus).toBe("conflict");
    expect((await outboxCounts()).conflict).toBe(1);
  });

  it("never sends contact details for anonymous reports", async () => {
    await saveIncident({ category: "other", description: "abc", anonymous: true, reporterContact: "0800" });
    let body;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => { body = JSON.parse(init.body); return json(201, { incident: {}, receipt }); });
    await flushOutbox();
    expect(body.reporter_contact).toBeNull();
    expect(body.anonymous).toBe(true);
  });
});
