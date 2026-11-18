"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/hooks/useApp";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import PageHeader from "@/components/layout/PageHeader";
import { Button, ButtonLink, Card, Notice } from "@/components/ui";
import SyncPill from "@/components/ui/SyncPill";
import { getEvidence, getEvidenceBlob, listEvidence, verifyEvidenceIntegrity } from "@/lib/records";
import { formatDateTime } from "@/lib/time";

function useBlobUrl(record, which) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u;
    if (record && (which === "original" || record.processed)) {
      getEvidenceBlob(record, which).then((b) => b && setUrl((u = URL.createObjectURL(b))));
    }
    return () => u && URL.revokeObjectURL(u);
  }, [record, which]);
  return url;
}

function Thumb({ record }) {
  const url = useBlobUrl(record, record.processed ? "processed" : "original");
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" /> : <div className="h-20 w-16 shrink-0 rounded-lg bg-surface-2" />;
}

function Detail({ id }) {
  const { t } = useApp();
  const rec = useLiveQuery(() => getEvidence(id), ["evidence"], [id]);
  const original = useBlobUrl(rec, "original");
  const processed = useBlobUrl(rec, "processed");
  const [integrity, setIntegrity] = useState(null);
  if (rec === undefined) return <p>{t("common.loading")}</p>;
  if (!rec) return <Notice tone="danger">Not found</Notice>;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={rec.reference} />
      <div className="flex flex-wrap gap-2"><SyncPill status={rec.syncStatus} /></div>
      {rec.syncError && <Notice tone={rec.syncStatus === "pending" ? "warn" : "danger"}>{rec.syncError}</Notice>}
      <Card>
        <dl className="grid gap-3">
          <div><dt className="text-sm text-muted">{t("evidence.captured")}</dt><dd>{formatDateTime(rec.capturedAt)}</dd></div>
          {rec.pollingUnitCode && <div><dt className="text-sm text-muted">{t("countcam.pollingUnit")}</dt><dd>{rec.pollingUnitCode}</dd></div>}
          {rec.location && <div><dt className="text-sm text-muted">{t("evidence.location")}</dt><dd>{rec.location.latitude.toFixed(5)}, {rec.location.longitude.toFixed(5)} (±{rec.location.accuracy} m)</dd></div>}
          <div><dt className="text-sm text-muted">{t("countcam.hash")}</dt><dd className="break-all font-mono text-sm">{rec.sha256}</dd></div>
          {rec.note && <div><dt className="text-sm text-muted">{t("countcam.note")}</dt><dd>{rec.note}</dd></div>}
        </dl>
        <p className="mt-3 text-sm text-muted">{t("countcam.hashNote")}</p>
        <Button variant="secondary" icon="shield" className="mt-3 w-full" onClick={async () => setIntegrity(await verifyEvidenceIntegrity(rec))}>{t("evidence.checkIntegrity")}</Button>
        {integrity && <Notice className="mt-3" tone={integrity.ok ? "ok" : "danger"}>{integrity.ok ? t("evidence.integrityOk") : t("evidence.integrityBad")}</Notice>}
      </Card>
      {processed && (
        <Card><h2 className="mb-2 font-bold">{t("evidence.processed")}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={processed} alt={t("evidence.processed")} className="w-full rounded-lg" />
        </Card>
      )}
      {original && (
        <Card><h2 className="mb-2 font-bold">{t("evidence.original")}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={original} alt={t("evidence.original")} className="w-full rounded-lg" />
        </Card>
      )}
      <ButtonLink href={`/verify?evidence=${rec.id}`} icon="checkCircle">{t("countcam.verifyNow")}</ButtonLink>
    </div>
  );
}

function List() {
  const { t } = useApp();
  const items = useLiveQuery(listEvidence, ["evidence"]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("evidence.title")} />
      {items?.length === 0 && <Card><p>{t("evidence.empty")}</p><ButtonLink className="mt-3 w-full" href="/countcam" icon="camera">{t("nav.countcam")}</ButtonLink></Card>}
      <ul className="flex flex-col gap-2">
        {items?.map((e) => (
          <li key={e.id}>
            <Link href={`/evidence?id=${e.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand">
              <Thumb record={e} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{e.reference}</span>
                <span className="block text-sm text-muted">{formatDateTime(e.capturedAt)}{e.pollingUnitCode && ` · ${e.pollingUnitCode}`}</span>
                <span className="mt-1 block"><SyncPill status={e.syncStatus} /></span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceRouter() {
  const id = useSearchParams().get("id");
  return id ? <Detail id={id} /> : <List />;
}

export default function EvidencePage() {
  return <Suspense><EvidenceRouter /></Suspense>;
}
