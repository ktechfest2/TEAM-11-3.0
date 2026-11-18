"use client";
import { useRef, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import PageHeader from "@/components/layout/PageHeader";
import { Button, Card, ConfirmDialog, Notice, Pill, Select, TextArea, TextInput, Toggle } from "@/components/ui";
import SyncPill from "@/components/ui/SyncPill";
import { listIncidents, saveEvidence, saveIncident } from "@/lib/records";
import { selectRecognizer } from "@/lib/nano/asr";
import { formatDateTime } from "@/lib/time";

const CATEGORIES = ["intimidation", "violence", "vote_buying", "missing_materials", "disruption", "accessibility_barrier", "other"];
const STATUS_TONE = { allegation: "warn", under_review: "info", verified: "ok", not_verified: "muted" };
const blank = () => ({ category: "intimidation", description: "", occurredAt: "", where: "", anonymous: true, contact: "" });

export default function ReportPage() {
  const { t, settings, speech } = useApp();
  const reports = useLiveQuery(listIncidents, ["incidents"]);
  const [form, setForm] = useState(blank);
  const [photos, setPhotos] = useState([]); // saved evidence records
  const [dictating, setDictating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const fileRef = useRef(null);
  const abortRef = useRef(null);

  async function dictate() {
    if (dictating) { abortRef.current?.abort(); return; }
    // Dictation needs free text, so command templates cannot be used here.
    const rec = selectRecognizer({ allowOnline: settings.allowOnlineSpeech, speech });
    if (!rec) return setNotice(t("voice.asrUnavailable"));
    setNotice(null);
    setDictating(true);
    abortRef.current = new AbortController();
    try {
      const r = await rec.listen({ lang: settings.language, signal: abortRef.current.signal });
      if (r.text) setForm((f) => ({ ...f, description: (f.description ? f.description + " " : "") + r.text }));
      else setNotice(t("voice.didntCatch"));
    } catch (e) {
      if (e.name !== "AbortError") setNotice(e.name === "NotAllowedError" ? t("voice.micDenied") : t("voice.error"));
    } finally {
      setDictating(false);
    }
  }

  async function addPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const rec = await saveEvidence({ original: f, kind: "incident", source: "camera", pollingUnitCode: form.where });
    setPhotos((p) => [...p, rec]);
  }

  async function submit() {
    setConfirmOpen(false);
    const looksLikeCode = /^[0-9A-Za-z/-]{4,32}$/.test(form.where.trim()) && /\d/.test(form.where);
    const rec = await saveIncident({
      category: form.category, description: form.description,
      occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : null,
      pollingUnitCode: looksLikeCode ? form.where.trim() : "", locationText: looksLikeCode ? "" : form.where,
      anonymous: form.anonymous, reporterContact: form.contact, evidenceIds: photos.map((p) => p.id), language: settings.language,
    });
    setSaved(rec);
    setForm(blank());
    setPhotos([]);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("report.title")} />
      <Notice tone="danger">{t("report.safety")}</Notice>
      {saved && <Notice tone="ok" title={t("report.saved")}>{saved.reference}</Notice>}
      <Notice tone="info">{t("report.allegationNote")}</Notice>

      <Card className="flex flex-col gap-4">
        <Select label={t("report.category")} value={form.category} onChange={(v) => setForm({ ...form, category: v })}
          options={CATEGORIES.map((c) => ({ value: c, label: t(`report.cat.${c}`) }))} />
        <TextArea label={t("report.description")} value={form.description} onChange={(v) => setForm({ ...form, description: v })} maxLength={5000} />
        <Button variant="secondary" icon={dictating ? "stop" : "mic"} onClick={dictate}>{dictating ? t("voice.listening") : t("report.dictate")}</Button>
        {notice && <Notice tone="warn">{notice}</Notice>}
        <TextInput label={`${t("report.when")} (${t("common.optional")})`} type="datetime-local" value={form.occurredAt} onChange={(v) => setForm({ ...form, occurredAt: v })} />
        <TextInput label={`${t("report.where")}`} value={form.where} onChange={(v) => setForm({ ...form, where: v })} maxLength={255} />
        <div>
          <Button variant="secondary" icon="camera" className="w-full" onClick={() => fileRef.current?.click()}>{t("report.attach")}</Button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={addPhoto} />
          {photos.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{photos.map((p) => <li key={p.id}><Pill tone="info" icon="image">{p.reference}</Pill></li>)}</ul>}
        </div>
        <Toggle label={t("report.anonymous")} hint={t("report.anonymousHint")} checked={form.anonymous} onChange={(v) => setForm({ ...form, anonymous: v })} />
        {!form.anonymous && <TextInput label={t("report.contact")} value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} maxLength={255} autoComplete="tel" />}
        <Button icon="shield" disabled={form.description.trim().length < 3} onClick={() => setConfirmOpen(true)}>{t("report.submit")}</Button>
      </Card>

      <ConfirmDialog open={confirmOpen} title={t("report.submit")} confirmLabel={t("common.confirm")} cancelLabel={t("common.cancel")}
        onConfirm={submit} onCancel={() => setConfirmOpen(false)}>
        <p>{t("report.confirm")}</p>
        <p className="mt-2 font-semibold">{t(`report.cat.${form.category}`)}{form.anonymous ? ` · ${t("report.anonymous")}` : ""}</p>
      </ConfirmDialog>

      {reports?.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">{t("report.myReports")}</h2>
          <ul className="flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-surface p-3">
                <p className="font-bold">{r.reference}</p>
                <p className="text-sm text-muted">{t(`report.cat.${r.category}`)} · {formatDateTime(r.createdAt)}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Pill tone={STATUS_TONE[r.serverStatus || r.status]}>{t(`report.status.${r.serverStatus || r.status}`)}</Pill>
                  <SyncPill status={r.syncStatus} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
