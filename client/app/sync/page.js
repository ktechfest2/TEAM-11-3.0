"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import PageHeader from "@/components/layout/PageHeader";
import { Button, Card, Notice, Pill, Stat } from "@/components/ui";
import { flushOutbox, listOutbox, retryItem } from "@/services/sync";
import { getDB, requestPersistentStorage } from "@/lib/db";
import { timeAgo } from "@/lib/time";

const STORE = { evidence: "evidence", incident: "incidents", result: "results" };

async function loadQueue() {
  const db = await getDB();
  const items = await listOutbox();
  return Promise.all(items.map(async (i) => ({ ...i, record: await db.get(STORE[i.entityType], i.entityId) })));
}

export default function SyncPage() {
  const { t, sync, online, serverUp, settings } = useApp();
  const queue = useLiveQuery(loadQueue, ["outbox", "evidence", "incidents", "results"]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [env, setEnv] = useState({ bg: false, persisted: null, usage: null });

  useEffect(() => {
    (async () => {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      const est = await navigator.storage?.estimate?.();
      setEnv({ bg: !!reg && "sync" in reg, persisted: await navigator.storage?.persisted?.(), usage: est ? Math.round(est.usage / 1e6) : null });
    })();
  }, []);

  async function syncNow() {
    setBusy(true);
    setSummary(await flushOutbox({ force: true }));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("syncpage.title")} subtitle={sync.lastSyncAt ? t("status.lastSync", { when: timeAgo(sync.lastSyncAt, settings.language) }) : t("status.neverSynced")} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("sync.pending")} value={sync.pending} />
        <Stat label={t("sync.failed")} value={sync.failed} />
        <Stat label={t("sync.conflict")} value={sync.conflict} />
      </div>
      {!online && <Notice tone="warn">{t("status.offlineHint")}</Notice>}
      {online && serverUp === false && <Notice tone="warn">{t("status.serverDown")}</Notice>}
      <Button icon="upload" onClick={syncNow} disabled={busy || !online}>{busy ? t("common.loading") : t("syncpage.now")}</Button>
      {summary && !summary.offline && (
        <p role="status" className="text-muted">↑ {summary.sent} · ⟳ {summary.deferred} · ✕ {summary.failed + summary.conflicts}</p>
      )}
      <Notice tone="info">{t("syncpage.never")}</Notice>

      {queue?.length === 0 && <Card><p>{t("syncpage.nothing")}</p></Card>}
      <ul className="flex flex-col gap-2">
        {queue?.map((i) => (
          <li key={i.id} className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">{i.record?.reference ?? i.entityId}</p>
              <Pill tone={i.status === "pending" ? "info" : "danger"}>{t(`sync.${i.status}`)}</Pill>
            </div>
            <p className="text-sm text-muted">{i.entityType} · {t("syncpage.attempts", { n: i.attempts })}</p>
            {i.lastError && <p className="mt-1 text-sm text-danger">{i.lastError}</p>}
            {i.status !== "pending" && <Button size="md" variant="secondary" icon="refresh" className="mt-2" onClick={() => retryItem(i.id)}>{t("common.retry")}</Button>}
          </li>
        ))}
      </ul>

      <Card>
        <h2 className="font-bold">{t("syncpage.bgSync")}</h2>
        <p className="text-muted">{env.bg ? t("syncpage.bgSupported") : t("syncpage.bgUnsupported")}</p>
        <h2 className="mt-3 font-bold">{t("syncpage.storage")}{env.usage !== null && ` · ${env.usage} MB`}</h2>
        <p className="text-muted">{env.persisted ? t("syncpage.persisted") : t("syncpage.notPersisted")}</p>
        {!env.persisted && <Button size="md" variant="secondary" className="mt-2" onClick={async () => setEnv({ ...env, persisted: await requestPersistentStorage() })}>{t("syncpage.persisted")}?</Button>}
      </Card>
    </div>
  );
}
