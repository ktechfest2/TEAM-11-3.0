"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Eyebrow, Icon, Notice, Pill } from "@/components/ui";
import ElectionHero from "@/components/elections/ElectionHero";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listEvidence, listIncidents, listResults } from "@/lib/records";
import { timeAgo } from "@/lib/time";

// Each action has its own colour so people can find it again by colour + icon, not just text.
const CHIP = {
  green: "bg-brand-soft text-brand",
  gold: "bg-accent-soft text-[color:var(--warn)]",
  red: "bg-danger-soft text-danger",
  blue: "bg-info-soft text-info",
};

const ACTIONS = [
  { href: "/verify", icon: "checkCircle", title: "nav.verify", desc: "home.verify.desc", chip: "green" },
  { href: "/report", icon: "alert", title: "nav.report", desc: "home.report.desc", chip: "red" },
  { href: "/polling-unit", icon: "map", title: "nav.pollingUnit", desc: "home.pollingUnit.desc", chip: "blue" },
  { href: "/info", icon: "book", title: "nav.info", desc: "home.info.desc", chip: "gold" },
];

const MORE = [
  { href: "/candidates", icon: "users", title: "candidates.title" },
  { href: "/dashboard", icon: "chart", title: "nav.dashboard" },
  { href: "/evidence", icon: "image", title: "nav.evidence" },
  { href: "/languages", icon: "languages", title: "langs.title" },
];

function VoiceExamples() {
  const { t, settings } = useApp();
  const [ex, setEx] = useState([]);
  useEffect(() => {
    fetch("/models/nano/examples.json").then((r) => r.json())
      .then((d) => setEx((d[settings.language] || d.en || []).filter((e) => e.intent.startsWith("nav.")).slice(0, 4)))
      .catch(() => setEx([]));
  }, [settings.language]);
  if (!ex.length) return null;
  return (
    <section className="rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-brand-ink"><Icon name="mic" size={22} /></span>
        <div>
          <p className="font-display text-lg font-bold leading-tight">{t("home.voice.title")}</p>
          <p className="text-sm text-muted">{t("home.voice.desc")}</p>
        </div>
      </div>
      <Eyebrow className="mt-4">{t("home.voiceExamples")}</Eyebrow>
      <ul className="mt-2 flex flex-wrap gap-2">
        {ex.map((e) => (
          <li key={e.intent} lang={settings.language} className="rounded-full bg-surface-2 px-3 py-1.5 text-[0.95rem]">“{e.text}”</li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  const { t, online, sync, settings } = useApp();
  const counts = useLiveQuery(async () => {
    const [e, i, r] = await Promise.all([listEvidence(), listIncidents(), listResults()]);
    return { evidence: e.length, incidents: i.length, results: r.length };
  }, ["evidence", "incidents", "results"]);
  const attention = sync.failed + sync.conflict;

  return (
    <div className="flex flex-col gap-6" data-speak-root>
      <ElectionHero />

      {!online && <Notice tone="warn">{t("status.offlineHint")}</Notice>}

      <section aria-labelledby="actions-title" className="flex flex-col gap-3">
        <h2 id="actions-title" className="text-2xl font-bold leading-tight">{t("home.actions")}</h2>

        {/* Primary action: the one thing an observer does most on election day */}
        <Link href="/countcam"
          className="adire lift group relative flex items-center gap-4 overflow-hidden rounded-3xl p-5 text-hero-ink active:scale-[0.99]">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink shadow-lg">
            <Icon name="camera" size={32} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[1.4rem] font-bold leading-tight">{t("nav.countcam")}</span>
            <span className="mt-0.5 block leading-snug opacity-85">{t("home.countcam.desc")}</span>
          </span>
          <Icon name="chevronRight" size={26} className="shrink-0 opacity-70 transition group-hover:translate-x-0.5" />
        </Link>

        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ACTIONS.map((a, n) => (
            <li key={a.href} className="animate-rise" style={{ animationDelay: `${80 + n * 50}ms` }}>
              <Link href={a.href}
                className="lift flex h-full min-h-36 flex-col gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line hover:ring-brand active:scale-[0.98]">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${CHIP[a.chip]}`}><Icon name={a.icon} size={26} /></span>
                <span>
                  <span className="block font-display text-[1.1rem] font-bold leading-tight">{t(a.title)}</span>
                  <span className="mt-1 block text-sm leading-snug text-muted">{t(a.desc)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
          {MORE.map((m) => (
            <li key={m.href}>
              <Link href={m.href} className="flex min-h-14 items-center gap-3 px-4 font-semibold transition hover:bg-surface-2">
                <Icon name={m.icon} size={22} className="text-muted" />
                <span className="flex-1">{t(m.title)}</span>
                <Icon name="chevronRight" size={20} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <VoiceExamples />

      <section aria-labelledby="mine-title" className="rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="mine-title" className="font-display text-lg font-bold">{t("home.yourData")}</h2>
          <Link href="/sync" className="text-sm font-semibold text-brand underline-offset-4 hover:underline">{t("nav.sync")}</Link>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {[["nav.evidence", counts?.evidence, "/evidence"], ["report.myReports", counts?.incidents, "/report"], ["verify.mySubmissions", counts?.results, "/verify"]].map(([k, v, href]) => (
            <Link key={k} href={href} className="flex flex-col rounded-2xl bg-surface-2/70 p-3 transition hover:bg-surface-2">
              <dd className="order-1 font-display text-3xl font-bold tabular-nums">{v ?? "–"}</dd>
              <dt className="order-2 text-[0.8rem] leading-tight text-muted">{t(k)}</dt>
            </Link>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone={sync.pending ? "info" : "ok"} icon={sync.pending ? "upload" : "check"}>{sync.pending ? t("status.pending", { n: sync.pending }) : t("sync.synced")}</Pill>
          {attention > 0 && <Pill tone="danger" icon="alert">{t("status.attention", { n: attention })}</Pill>}
          <Pill tone="muted">{sync.lastSyncAt ? t("status.lastSync", { when: timeAgo(sync.lastSyncAt, settings.language) }) : t("status.neverSynced")}</Pill>
        </div>
      </section>
    </div>
  );
}
