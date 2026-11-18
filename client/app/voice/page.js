"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { ButtonLink, Card, Notice } from "@/components/ui";
import { deviceVoiceFor } from "@/lib/nano/tts";

/** Example commands come from the same seed dataset the classifier was trained on. */
export default function VoiceHelpPage() {
  const { t, settings, packs } = useApp();
  const [examples, setExamples] = useState([]);
  const [hasVoice, setHasVoice] = useState(null);

  useEffect(() => {
    fetch("/models/nano/examples.json").then((r) => r.json()).then((d) => setExamples(d[settings.language] || d.en || [])).catch(() => setExamples([]));
    const check = () => setHasVoice(!!deviceVoiceFor(settings.language));
    check();
    speechSynthesis?.addEventListener?.("voiceschanged", check);
    return () => speechSynthesis?.removeEventListener?.("voiceschanged", check);
  }, [settings.language]);

  return (
    <div className="flex flex-col gap-4" data-speak-root>
      <PageHeader title={t("nav.voice")} subtitle={t("voice.notChat")} />
      {!packs["asr-whisper-tiny"] && !settings.allowOnlineSpeech && (
        <Notice tone="warn">{t("voice.asrUnavailable")}</Notice>
      )}
      {hasVoice === false && <Notice tone="warn">{t("voice.ttsUnavailable")}</Notice>}
      <Card>
        <h2 className="text-lg font-bold">{t("voice.examples")}</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {examples.map((e) => (
            <li key={e.intent} className="rounded-xl bg-surface-2 p-3">
              <span className="block text-lg font-semibold" lang={settings.language}>“{e.text}”</span>
              <span className="text-sm text-muted">→ {t(`intent.${e.intent}`)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <ButtonLink href="/settings" variant="secondary" icon="download">{t("voice.packsTitle")}</ButtonLink>
    </div>
  );
}
