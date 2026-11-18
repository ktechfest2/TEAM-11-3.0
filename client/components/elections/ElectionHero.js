"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";
import { daysUntil, getReference } from "@/lib/elections";

// Polls open at 08:30 Nigerian time (WAT, UTC+1) on election day.
const pollsOpen = (isoDate) => new Date(`${isoDate}T08:30:00+01:00`);

/** Live countdown (days · hours · minutes · seconds) to polls opening; ticks every second. */
function Countdown({ date, t }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = date && now != null ? Math.max(0, pollsOpen(date) - now) : null;
  const s = ms == null ? null : Math.floor(ms / 1000);
  const parts = s == null ? [null, null, null, null] : [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
  const pad = (v) => (v == null ? "––" : String(v).padStart(2, "0"));
  const units = [
    [parts[0] === 1 ? t("hero.day") : t("hero.days"), parts[0] == null ? "–" : String(parts[0])],
    [t("hero.hours"), pad(parts[1])],
    [t("hero.minutes"), pad(parts[2])],
    [t("hero.seconds"), pad(parts[3])],
  ];
  return (
    <div className="mt-4">
      <div className="flex items-end gap-2 sm:gap-3" role="timer" aria-label={parts[0] == null ? "" : `${parts[0]} ${units[0][0]}, ${parts[1]} ${units[1][0]}, ${parts[2]} ${units[2][0]}`}>
        {units.map(([label, value], i) => (
          <div key={label} className="flex items-end gap-2 sm:gap-3">
            {i > 0 && <span aria-hidden="true" className="pb-5 font-display text-3xl font-bold opacity-50 sm:text-4xl">:</span>}
            <div className="flex flex-col items-center">
              <span aria-hidden="true" className={`font-display font-extrabold leading-[0.9] tracking-tight tabular-nums text-accent ${i === 0 ? "text-[3.4rem] sm:text-[4.2rem]" : "text-[2.2rem] sm:text-[2.8rem]"}`}>{value}</span>
              <span aria-hidden="true" className="mt-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] opacity-80">{label}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm opacity-80">{t("hero.untilPolls")}</p>
    </div>
  );
}

/** Home hero: countdown to the next election day (INEC calendar, bundled for offline use). */
export default function ElectionHero() {
  const { t, settings } = useApp();
  const [ref, setRef] = useState(null);
  const [now, setNow] = useState(null);
  useEffect(() => { getReference().then(setRef).catch(() => setRef(false)); setNow(new Date()); }, []);

  const days = {};
  for (const e of ref?.elections || []) (days[e.date] ||= []).push(e.id);
  const upcoming = Object.entries(days).map(([date, ids]) => ({ date, ids, n: now ? daysUntil(date, now) : null }))
    .filter((d) => d.n === null || d.n >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const [next, later] = upcoming;
  const locale = settings.language === "pcm" ? "en-NG" : settings.language;
  const fmt = (d, opts) => new Date(`${d}T12:00:00+01:00`).toLocaleDateString(locale, opts);

  return (
    <section className="adire adire-live rounded-[2rem] p-5 text-hero-ink sm:p-7" aria-labelledby="hero-title">
      <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-80">{t("app.tagline")}</p>
      {ref === false || (ref && !next) ? (
        <h1 id="hero-title" className="mt-3 text-3xl font-bold leading-tight">{t("home.title")}</h1>
      ) : (
        <>
          <h1 id="hero-title" className="sr-only">{t("home.election")}</h1>
          <Countdown date={next?.date} t={t} />
          {next && (
            <p className="mt-3 max-w-md text-[1.05rem] leading-snug">
              <span className="font-semibold">{next.ids.map((id) => t(`election.${id}`)).join(" · ")}</span>
              <span className="block opacity-80">{fmt(next.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            </p>
          )}
          {later && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm">
              <Icon name="calendar" size={16} />
              {t("hero.then", { what: later.ids.map((id) => t(`election.${id}`)).join(" · "), date: fmt(later.date, { day: "numeric", month: "short" }) })}
            </p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex">
            <Link href="/candidates" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-hero-ink px-4 font-semibold text-hero transition active:scale-[0.98]">
              <Icon name="users" size={20} className="hidden min-[400px]:block" /> <span>{t("hero.seeCandidates")}</span>
            </Link>
            <Link href="/info" className="inline-flex min-h-12 items-center justify-center gap-1 rounded-2xl px-4 font-semibold ring-1 ring-inset ring-white/30 transition hover:bg-white/10 active:scale-[0.98]">
              {t("hero.howToVote")} <Icon name="chevronRight" size={18} />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
