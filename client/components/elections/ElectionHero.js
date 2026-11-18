"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";
import { daysUntil, getReference } from "@/lib/elections";

/** Counts up to `value` once (≈0.7 s); shows the final number immediately with reduced motion. */
function CountUp({ value }) {
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (value == null) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reduceMotion === "true";
    if (reduced) { setShown(value); return; }
    let raf, start;
    const step = (ts) => {
      start ??= ts;
      const p = Math.min(1, (ts - start) / 700);
      setShown(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown ?? (value == null ? "–" : 0)}</>;
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
          <div className="mt-4 flex items-end gap-3" aria-live="polite">
            <span className="font-display text-[4.2rem] font-extrabold leading-[0.85] tracking-tight text-accent tabular-nums">
              <CountUp value={next?.n} />
            </span>
            <span className="pb-1 font-display text-xl font-semibold leading-tight">
              {next?.n === 1 ? t("hero.day") : t("hero.days")}<br />{t("hero.toGo")}
            </span>
          </div>
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
