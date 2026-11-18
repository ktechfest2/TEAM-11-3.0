"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Button, ButtonLink, Card, Notice, TextArea, TextInput, Toggle } from "@/components/ui";
import CornerEditor from "@/features/countcam/CornerEditor";
import { useCamera } from "@/features/countcam/useCamera";
import { analyse, makeProcessed } from "@/features/countcam/process";
import { captureStill } from "@/lib/image/canvas";
import { saveEvidence } from "@/lib/records";
import { requestPersistentStorage } from "@/lib/db";
import { cleanPuCode } from "@/lib/pollingUnit";

const ACCEPT = "image/jpeg,image/png,image/webp";

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export default function CountCamPage() {
  const { t } = useApp();
  const { videoRef, streamRef, status: camStatus, start: startCamera, stop: stopCamera } = useCamera();
  const fileRef = useRef(null);
  const [step, setStep] = useState("capture"); // capture | review | details | saved
  const [shot, setShot] = useState(null); // { blob, url, source, capturedAt }
  const [analysis, setAnalysis] = useState(null);
  const [corners, setCorners] = useState(null);
  const [form, setForm] = useState({ pollingUnitCode: "", note: "", withLocation: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => () => shot?.url && URL.revokeObjectURL(shot.url), [shot]);

  async function accept(blob, source) {
    stopCamera();
    setError(null);
    const capturedAt = new Date().toISOString();
    setShot({ blob, url: URL.createObjectURL(blob), source, capturedAt });
    setStep("review");
    setAnalysis(null);
    try {
      const a = await analyse(blob);
      setAnalysis(a);
      setCorners(a.corners);
    } catch (e) {
      setError(e.message);
    }
  }

  async function capture() {
    const blob = await captureStill(videoRef.current, streamRef.current);
    if (blob) accept(blob, "camera");
  }

  function importFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) return setError("Please choose a JPEG, PNG or WebP photo.");
    accept(f, "gallery"); // the file's bytes are preserved exactly as the original
  }

  function retake() {
    setShot(null); setAnalysis(null); setCorners(null);
    setStep("capture");
    startCamera();
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const [processed, location] = await Promise.all([
        makeProcessed(shot.blob, corners),
        form.withLocation ? getLocation() : Promise.resolve(null),
      ]);
      const rec = await saveEvidence({
        original: shot.blob, processed, kind: "result_sheet", source: shot.source, capturedAt: shot.capturedAt,
        location, pollingUnitCode: form.pollingUnitCode, note: form.note, quality: analysis?.quality ?? null,
      });
      requestPersistentStorage();
      setSaved(rec);
      setStep("saved");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const camError = { denied: "countcam.permissionDenied", nocamera: "countcam.noCamera", insecure: "countcam.insecure", error: "countcam.noCamera" }[camStatus];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("countcam.title")} />
      <Notice tone="warn">{t("countcam.secrecy")}</Notice>
      {error && <Notice tone="danger">{error}</Notice>}

      {step === "capture" && (
        <Card className="flex flex-col gap-3">
          <div className={`relative overflow-hidden rounded-xl bg-black ${camStatus === "live" ? "" : "hidden"}`}>
            <video ref={videoRef} playsInline muted className="block w-full" aria-label="Camera preview" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-[6%] rounded-lg border-2 border-dashed border-white/70" />
          </div>
          {camStatus !== "live" && (
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface-2/60 p-5 text-center sm:flex-row sm:text-left">
              <svg viewBox="0 0 96 120" className="h-28 w-24 shrink-0" aria-hidden="true">
                <rect x="10" y="8" width="76" height="104" rx="6" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
                {[24, 36, 48, 60, 72].map((y) => <rect key={y} x="20" y={y} width={y % 24 ? 40 : 56} height="5" rx="2.5" fill="var(--line)" />)}
                <rect x="20" y="86" width="28" height="12" rx="3" fill="var(--brand-soft)" />
                {[[4, 2], [92, 2], [4, 118], [92, 118]].map(([x, y]) => (
                  <path key={`${x}${y}`} d={`M${x} ${y + (y < 60 ? 12 : -12)}V${y}H${x + (x < 48 ? 12 : -12)}`} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
                ))}
              </svg>
              <ol className="flex flex-col gap-2 text-left">
                {["countcam.tip1", "countcam.tip2", "countcam.tip3"].map((k, n) => (
                  <li key={k} className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-bold text-brand-ink">{n + 1}</span>
                    <span className="pt-0.5 leading-snug">{t(k)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {camError && <Notice tone="danger">{t(camError)}</Notice>}
          {camStatus === "live" ? (
            <Button icon="camera" onClick={capture} className="w-full">{t("countcam.capture")}</Button>
          ) : (
            <Button icon="camera" onClick={startCamera} disabled={camStatus === "starting"} className="w-full">
              {camStatus === "starting" ? t("common.loading") : t("countcam.startCamera")}
            </Button>
          )}
          <Button variant="secondary" icon="image" onClick={() => fileRef.current?.click()} className="w-full">{t("countcam.import")}</Button>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={importFile} />
        </Card>
      )}

      {step === "review" && shot && (
        <Card className="flex flex-col gap-3">
          {!analysis ? (
            <p role="status">{t("countcam.checking")}</p>
          ) : (
            <>
              <p className="font-semibold">{analysis.detected ? t("countcam.adjust") : t("countcam.notDetected")}</p>
              <CornerEditor src={shot.url} corners={corners} onChange={setCorners} label={t("evidence.original")} />
              <div role="status" className="flex flex-col gap-2">
                {analysis.quality.ok
                  ? <Notice tone="ok">{t("countcam.quality.ok")}</Notice>
                  : analysis.quality.issues.map((i) => <Notice key={i} tone="warn">{t(`countcam.quality.${i}`)}</Notice>)}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" icon="refresh" onClick={retake}>{t("countcam.retake")}</Button>
                <Button icon="check" onClick={() => setStep("details")}>{t("countcam.keep")}</Button>
              </div>
            </>
          )}
        </Card>
      )}

      {step === "details" && (
        <Card className="flex flex-col gap-4">
          <TextInput label={t("countcam.pollingUnit")} hint={`${t("common.optional")} — e.g. 24-11-05-003`} value={form.pollingUnitCode}
            onChange={(v) => setForm({ ...form, pollingUnitCode: cleanPuCode(v) })} autoCapitalize="characters" maxLength={32} />
          <TextArea label={`${t("countcam.note")} (${t("common.optional")})`} value={form.note} onChange={(v) => setForm({ ...form, note: v })} maxLength={2000} />
          <Toggle label={t("countcam.location")} hint={t("countcam.locationHint")} checked={form.withLocation} onChange={(v) => setForm({ ...form, withLocation: v })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => setStep("review")}>{t("common.back")}</Button>
            <Button icon="shield" onClick={save} disabled={saving}>{saving ? t("common.loading") : t("countcam.save")}</Button>
          </div>
        </Card>
      )}

      {step === "saved" && saved && (
        <Card className="flex flex-col gap-3">
          <Notice tone="ok" title={t("countcam.saved")}>{t("status.offlineHint")}</Notice>
          {saved.duplicateOf && <Notice tone="warn">{t("countcam.duplicate")}</Notice>}
          <dl className="grid gap-2">
            <div><dt className="text-sm text-muted">{t("countcam.reference")}</dt><dd className="text-2xl font-bold tracking-wide">{saved.reference}</dd></div>
            <div><dt className="text-sm text-muted">{t("countcam.hash")}</dt><dd className="break-all font-mono text-sm">{saved.sha256}</dd></div>
          </dl>
          <p className="text-sm text-muted">{t("countcam.hashNote")}</p>
          <ButtonLink href={`/verify?evidence=${saved.id}`} icon="checkCircle">{t("countcam.verifyNow")}</ButtonLink>
          <Button variant="secondary" icon="camera" onClick={retake}>{t("countcam.another")}</Button>
          <Link href={`/evidence?id=${saved.id}`} className="text-center font-semibold text-brand underline">{t("nav.evidence")}</Link>
        </Card>
      )}
    </div>
  );
}
