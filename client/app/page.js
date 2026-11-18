"use client";
import Link from "next/link";
import { useApp } from "@/hooks/useApp";
import { Card, Icon, Notice, Pill } from "@/components/ui";
import SpeakButton from "@/components/voice/SpeakButton";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listEvidence, listIncidents, listResults } from "@/lib/records";
import { timeAgo } from "@/lib/time";
import { LANGUAGES } from "@/lib/i18n/messages";
import ElectionDates from "@/components/elections/ElectionDates";

const ACTIONS = [
  { href: "/countcam", icon: "camera", title: "nav.countcam", desc: "home.countcam.desc", primary: true },
  { href: "/verify", icon: "checkCircle", title: "nav.verify", desc: "home.verify.desc" },
  { href: "/report", icon: "alert", title: "nav.report", desc: "home.report.desc" },
  { href: "/polling-unit", icon: "map", title: "nav.pollingUnit", desc: "home.pollingUnit.desc" },
  { href: "/info", icon: "book", title: "nav.info", desc: "home.info.desc" },
  { href: "/candidates", icon: "file", title: "candidates.title", desc: "home.candidates.desc" },
  { href: "/dashboard", icon: "chart", title: "nav.dashboard", desc: "home.dashboard.desc" },
];

export default function Home() {
  const { t, online, sync, settings } = useApp();
  const counts = useLiveQuery(async () => {
    const [e, i, r] = await Promise.all([listEvidence(), listIncidents(), listResults()]);
    return { evidence: e.length, incidents: i.length, results: r.length };
  }, ["evidence", "incidents", "results"]);
  const lang = LANGUAGES.find((l) => l.code === settings.language);

  return (
    <div className="flex flex-col gap-5" data-speak-root>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">{t("app.tagline")}</p>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight">{t("home.title")}</h1>
        </div>
        <SpeakButton />
      </div>

      {!online && <Notice tone="warn">{t("status.offlineHint")}</Notice>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <li key={a.href} className={a.primary ? "sm:col-span-2" : ""}>
            <Link href={a.href}
              className={`flex min-h-24 items-center gap-4 rounded-2xl border-2 p-4 ${a.primary ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface hover:border-brand"}`}>
              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl ${a.primary ? "bg-brand-ink/15" : "bg-brand-soft text-brand"}`}>
                <Icon name={a.icon} size={30} />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-bold">{t(a.title)}</span>
                <span className={`block ${a.primary ? "opacity-90" : "text-muted"}`}>{t(a.desc)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <h2 className="mb-2 text-lg font-bold">{t("home.election")}</h2>
        <ElectionDates compact />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t("home.yourData")}</h2>
          <Link href="/settings" className="inline-flex min-h-10 items-center gap-1 font-semibold text-brand underline">
            <Icon name="globe" size={18} /> {lang?.native}
          </Link>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[["nav.evidence", counts?.evidence, "/evidence"], ["report.myReports", counts?.incidents, "/report"], ["verify.mySubmissions", counts?.results, "/verify"]].map(([k, v, href]) => (
            <Link key={k} href={href} className="rounded-xl bg-surface-2 p-2">
              <dt className="text-sm text-muted">{t(k)}</dt>
              <dd className="text-2xl font-bold tabular-nums">{v ?? "–"}</dd>
            </Link>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone={sync.pending ? "info" : "ok"} icon="upload">{sync.pending ? t("status.pending", { n: sync.pending }) : t("sync.synced")}</Pill>
          {sync.failed + sync.conflict > 0 && <Pill tone="danger" icon="alert">{t("status.attention", { n: sync.failed + sync.conflict })}</Pill>}
          <Pill tone="muted">{sync.lastSyncAt ? t("status.lastSync", { when: timeAgo(sync.lastSyncAt, settings.language) }) : t("status.neverSynced")}</Pill>
        </div>
      </Card>

      <Link href="/voice" className="flex min-h-14 items-center gap-3 rounded-2xl border-2 border-line bg-surface p-4">
        <Icon name="mic" />
        <span><span className="block font-bold">{t("nav.voice")}</span><span className="text-muted">{t("home.voice.desc")}</span></span>
      </Link>
    </div>
  );
}
