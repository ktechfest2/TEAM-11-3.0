"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { daysUntil, getReference } from "@/lib/elections";

/** The two 2027 election days, from INEC's calendar (bundled; works offline). */
export default function ElectionDates({ compact = false }) {
  const { t, settings } = useApp();
  const [ref, setRef] = useState(null);
  const [now, setNow] = useState(null);
  useEffect(() => { getReference().then(setRef).catch(() => setRef(false)); setNow(new Date()); }, []);
  if (ref === false) return <p className="text-muted">{t("home.noElection")}</p>;
  if (!ref || !now) return <p className="text-muted">{t("common.loading")}</p>;

  const days = {};
  for (const e of ref.elections) (days[e.date] ||= []).push(e.id);
  const fmt = (d) => new Date(`${d}T12:00:00+01:00`).toLocaleDateString(settings.language === "pcm" ? "en-NG" : settings.language, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {Object.entries(days).map(([date, ids]) => {
          const n = daysUntil(date, now);
          return (
            <li key={date} className="rounded-xl bg-surface-2 p-3">
              <p className="font-bold">{fmt(date)}</p>
              <p>{ids.map((id) => t(`election.${id}`)).join(", ")}</p>
              <p className="text-sm font-semibold text-brand">{n > 1 ? t("elections.daysLeft", { n }) : n === 1 ? t("elections.tomorrow") : n === 0 ? t("elections.today") : t("elections.held")}</p>
            </li>
          );
        })}
      </ul>
      {!compact && <p className="text-sm text-muted">{t("elections.governorshipStates")}</p>}
      <p className="text-sm text-muted">
        {t("info.source")}: <a className="underline" href={ref.dates_source.url} target="_blank" rel="noreferrer">INEC</a> · {t("info.reviewed")}: {ref.dates_source.checked_at}
      </p>
      <Link href="/candidates" className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-line px-4 font-semibold hover:border-brand">{t("candidates.title")}</Link>
    </div>
  );
}
