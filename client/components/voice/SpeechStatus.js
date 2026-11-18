"use client";
import { useApp } from "@/hooks/useApp";
import { Button, Icon, Notice } from "@/components/ui";
import { languageByCode } from "@/lib/i18n/languages";

/** Shows the automatic speech setup state. Users never have to act, except to retry a failed setup. */
export default function SpeechStatus({ showReady = false }) {
  const { t, speech, downloadSpeech, settings, online } = useApp();
  const lang = languageByCode(settings.language)?.native || settings.language;
  const m = speech.model;

  if (speech.status === "downloading") {
    return (
      <div className="rounded-2xl bg-brand-soft p-4" role="status" aria-live="polite">
        <p className="font-semibold">{t("speech.downloading", { lang, pct: speech.pct ?? 0 })}</p>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${speech.pct ?? 0}%` }} />
        </div>
        <p className="mt-1.5 text-sm text-muted">{t("speech.once")}</p>
      </div>
    );
  }
  if (speech.status === "needs-download") {
    return (
      <div className="rounded-2xl bg-accent-soft p-4">
        <p className="font-semibold">{online ? t("speech.needsDownload", { lang }) : t("speech.needsInternet", { lang })}</p>
        {m?.heavy && <p className="mt-1 text-sm text-muted">{t("speech.heavy")}</p>}
        {online && (
          <Button size="md" icon="refresh" className="mt-3 w-full" onClick={downloadSpeech}>{t("speech.downloadNow")}</Button>
        )}
        {speech.error && <p className="mt-2 text-sm text-danger">{speech.error}</p>}
      </div>
    );
  }
  if (speech.status === "unavailable") return <Notice tone="info">{t("speech.unavailable", { lang })}</Notice>;
  if (speech.status === "templates") return showReady ? <Notice tone="ok">{t("speech.templates", { lang })}</Notice> : null;
  if (speech.status === "ready" && showReady) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-ok-soft p-4">
        <span className="text-ok"><Icon name="checkCircle" /></span>
        <div>
          <p className="font-semibold">{t("speech.ready", { lang })}</p>
          <p className="text-sm text-muted">{m?.name}</p>
        </div>
      </div>
    );
  }
  return null;
}

/** Licence-required attribution for N-ATLaS models ("Powered by Awarri"). */
export function SpeechAttribution() {
  const { speech } = useApp();
  if (speech.status !== "ready" || !speech.model?.natlas) return null;
  return <p className="text-center text-xs text-muted">{speech.model.name}. {speech.model.attribution}</p>;
}
