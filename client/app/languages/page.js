"use client";
import Link from "next/link";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { ButtonLink, Card, Notice, Pill } from "@/components/ui";
import { LANGUAGES } from "@/lib/i18n/languages";
import { TOTAL_KEYS, languageSupport } from "@/components/languages/status";

/** Public, measured progress towards supporting the languages ~90% of Nigerians use. */
export default function LanguagesPage() {
  const { t, languageStats } = useApp();
  const criteria = languageStats?.criteria;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("langs.title")} subtitle={t("langs.subtitle")} />
      {!languageStats && <Notice tone="warn">{t("langs.offline")}</Notice>}
      {criteria && (
        <Notice tone="info">{t("langs.criteria", { pct: Math.round(criteria.accuracy * 100), speakers: criteria.min_held_out_speakers, attempts: criteria.min_attempts })}</Notice>
      )}
      <ul className="flex flex-col gap-2">
        {LANGUAGES.map((l) => {
          const s = languageSupport(l.code, languageStats);
          const raw = languageStats?.languages?.[l.code];
          return (
            <li key={l.code}>
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-bold" lang={l.bcp47}>{l.native} <span className="text-base font-normal text-muted">· {l.name}</span></p>
                  {l.code !== "en" && (s.voice.state === "validated" && s.ui.pct >= 90
                    ? <Pill tone="ok" icon="check">{t("langs.supported")}</Pill>
                    : <Pill tone="muted">{t("langs.inProgress")}</Pill>)}
                </div>
                {l.code !== "en" && (
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div><dt className="text-muted">{t("langs.text")}</dt><dd className="font-semibold">{raw?.translations_approved || 0}/{TOTAL_KEYS}</dd></div>
                    <div><dt className="text-muted">{t("langs.prompts")}</dt><dd className="font-semibold">{raw?.prompts_approved || 0}</dd></div>
                    <div><dt className="text-muted">{t("langs.commands")}</dt><dd className="font-semibold">{raw?.command_templates || 0} · {t("langs.speakers", { n: raw?.command_speakers || 0 })}</dd></div>
                    <div><dt className="text-muted">{t("langs.accuracy")}</dt>
                      <dd className="font-semibold">{raw?.evaluation?.accuracy != null ? `${Math.round(raw.evaluation.accuracy * 100)}% · ${t("langs.speakers", { n: raw.evaluation.held_out_speakers })}` : "—"}</dd></div>
                  </dl>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      <ButtonLink href="/contribute" icon="mic">{t("langs.contribute")}</ButtonLink>
      <p className="text-sm text-muted"><Link className="underline" href="/settings">{t("nav.settings")}</Link></p>
    </div>
  );
}
