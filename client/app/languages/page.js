"use client";
import Link from "next/link";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { ButtonLink, Card } from "@/components/ui";
import { LANGUAGES } from "@/lib/i18n/languages";
import { languageSupport } from "@/components/languages/status";

/** The languages AwaVote speaks: translated text and on-device voice per language. */
export default function LanguagesPage() {
  const { t, languageStats } = useApp();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("langs.title")} subtitle={t("langs.subtitle")} />
      <ul className="flex flex-col gap-2">
        {LANGUAGES.map((l) => {
          const s = languageSupport(l.code, languageStats);
          return (
            <li key={l.code}>
              <Card>
                <p className="text-lg font-bold" lang={l.bcp47}>{l.native} <span className="text-base font-normal text-muted">· {l.name}</span></p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-muted">{t("langs.text")}</dt><dd className="font-semibold">{s.ui.pct}%</dd></div>
                  <div><dt className="text-muted">{t("langs.voice")}</dt>
                    <dd className="font-semibold">{s.voice.state === "model" ? s.voice.model : s.voice.state === "recordings" ? t("langs.voiceRecordings") : "—"}</dd></div>
                </dl>
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
