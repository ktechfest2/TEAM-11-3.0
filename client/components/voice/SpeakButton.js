"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Icon } from "@/components/ui";

/** Read-aloud control with play / pause / resume / stop. Uses the TTS provider chain. */
export default function SpeakButton({ text }) {
  const { t, settings, readPage } = useApp();
  const [state, setState] = useState("idle"); // idle | playing | paused
  const [notice, setNotice] = useState(null);
  const ownsPlayback = useRef(false);

  // Stop on unmount only if THIS button started the speech (don't cut off voice-command replies).
  useEffect(() => () => { if (ownsPlayback.current) import("@/lib/nano/tts").then((m) => m.stop()); }, []);

  async function play() {
    setNotice(null);
    setState("playing");
    ownsPlayback.current = true;
    const tts = await import("@/lib/nano/tts");
    const r = text ? await tts.speak(text, { lang: settings.language, rate: settings.speechRate, mmsEnabled: settings.mmsVoice }) : await readPage();
    if (!r.spoken && r.reason === "no_voice") setNotice(t("voice.ttsUnavailable"));
    ownsPlayback.current = false;
    setState("idle");
  }
  async function toggle() {
    const tts = await import("@/lib/nano/tts");
    if (state === "playing") { tts.pause(); setState("paused"); } else { tts.resume(); setState("playing"); }
  }
  async function stop() {
    (await import("@/lib/nano/tts")).stop();
    ownsPlayback.current = false;
    setState("idle");
  }

  return (
    <div className="flex shrink-0 flex-col items-end">
      <div className="flex gap-1">
        {state === "idle" ? (
          <button type="button" onClick={play} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-line transition hover:ring-brand active:scale-95">
            <Icon name="speaker" size={20} /> <span>{t("common.readAloud")}</span>
          </button>
        ) : (
          <>
            <button type="button" onClick={toggle} className="grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-ink" aria-label={state === "playing" ? "Pause" : "Resume"}>
              <Icon name={state === "playing" ? "pause" : "play"} />
            </button>
            <button type="button" onClick={stop} className="grid h-11 w-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label={t("voice.stop")}>
              <Icon name="stop" />
            </button>
          </>
        )}
      </div>
      {notice && <p role="status" className="mt-1 max-w-48 text-right text-sm text-warn">{notice}</p>}
    </div>
  );
}
