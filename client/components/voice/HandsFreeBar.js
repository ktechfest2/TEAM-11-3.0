"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";
import { languageByCode } from "@/lib/i18n/languages";

/**
 * Hands-free voice status, floating above the bottom navigation. Shows that AwaVote is
 * listening, reacts when someone speaks, then shows what it heard and did (for a few seconds).
 * The only buttons: a one-time "Turn on" (microphone permission) and pause/resume.
 */
export default function HandsFreeBar() {
  const { t, settings, updateSettings, handsFree, startHandsFree, voiceEvent } = useApp();
  const [recent, setRecent] = useState(null);

  // Keep the last heard command / language switch visible for 6 s.
  useEffect(() => {
    if (!voiceEvent || !["result", "language-switched", "response", "ignored"].includes(voiceEvent.type)) return;
    // Background talk is ignored silently; a short visual hint only when it looked like a command attempt.
    if (voiceEvent.type === "ignored" && !(voiceEvent.text && voiceEvent.text.length <= 60)) return;
    setRecent((r) => ({ ...(r && Date.now() - r.at < 6000 ? r : {}), ...pick(voiceEvent), at: Date.now() }));
    const id = setTimeout(() => setRecent((r) => (r && Date.now() - r.at >= 5900 ? null : r)), 6000);
    return () => clearTimeout(id);
  }, [voiceEvent]);

  if (!settings.handsFree) return null;
  const st = handsFree.state;
  const engineState = voiceEvent?.state;
  const working = engineState === "transcribing" || engineState === "understanding" || engineState === "loading";

  let body;
  if (st === "needs-permission" || st === "error") {
    body = (
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Icon name="mic" size={20} /></span>
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{t("handsfree.offer")}</p>
        <button type="button" onClick={startHandsFree} className="min-h-11 shrink-0 rounded-full bg-brand px-4 text-sm font-bold text-brand-ink">{t("handsfree.turnOn")}</button>
      </div>
    );
  } else if (st === "denied") {
    body = <p className="text-sm"><Icon name="mic" size={16} className="mr-1 inline" />{t("handsfree.denied")}</p>;
  } else if (st === "unsupported" || st === "off" || st === "starting") {
    return null;
  } else {
    const hearing = st === "hearing";
    const label = st === "needs-gesture" ? t("handsfree.tapToStart")
      : working ? t("voice.understanding")
      : engineState === "speaking" ? t("voice.speaking")
      : hearing ? t("handsfree.hearing")
      : st === "paused" ? t("handsfree.paused")
      : t("handsfree.listening");
    body = (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full ${hearing || working ? "bg-accent text-accent-ink" : "bg-brand text-brand-ink"}`}>
            {(st === "listening" || hearing) && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30" style={{ animationDuration: hearing ? "0.9s" : "2.4s" }} />}
            <Icon name={working ? "refresh" : "mic"} size={18} className={working ? "animate-spin" : ""} />
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold" role="status" aria-live="polite">{label}</p>
          {hearing && <Level level={handsFree.level || 0} />}
          <button type="button" onClick={() => updateSettings({ handsFree: false })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted" aria-label={t("handsfree.stop")}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {recent && (recent.text || recent.response || recent.switched) && (
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm leading-snug" aria-live="polite">
            {recent.switched && (
              <p className="mb-0.5 font-semibold text-brand"><Icon name="globe" size={14} className="mr-1 inline" />{t("handsfree.switched", { lang: languageByCode(recent.switched)?.native || recent.switched })}</p>
            )}
            {recent.text && <p className="truncate">“{recent.text}”</p>}
            {recent.response && <p className="text-muted">{recent.response}</p>}
            {recent.unknown && (
              <p className="text-muted">{t("handsfree.notCommand")} · <Link href="/voice" className="font-semibold text-brand underline">{t("handsfree.whatCanISay")}</Link></p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 px-3 lg:bottom-5 lg:left-auto lg:right-5 lg:w-96 lg:px-0"
      data-handsfree data-state={working ? "working" : engineState === "speaking" ? "speaking" : st}>
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-line bg-surface/95 p-2.5 shadow-lg backdrop-blur-md">{body}</div>
    </div>
  );
}

function pick(ev) {
  if (ev.type === "result") return { text: ev.text, response: null, unknown: false };
  if (ev.type === "response") return { response: ev.text };
  if (ev.type === "language-switched") return { switched: ev.lang };
  if (ev.type === "ignored") return { text: ev.text, unknown: true, response: null };
  return {};
}

function Level({ level }) {
  return (
    <span aria-hidden="true" className="flex h-6 items-end gap-0.5">
      {[0.5, 1, 0.75, 0.9, 0.6].map((k, i) => (
        <span key={i} className="w-1 rounded-full bg-accent transition-[height] duration-75" style={{ height: `${Math.max(15, Math.min(100, level * k * 160))}%` }} />
      ))}
    </span>
  );
}
