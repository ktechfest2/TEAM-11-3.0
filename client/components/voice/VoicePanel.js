"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Button, Icon, Notice } from "@/components/ui";
import { LANGUAGES } from "@/lib/i18n/messages";
import { NAV_ROUTES, SENSITIVE } from "@/lib/nano/router";
import SpeechStatus, { SpeechAttribution } from "./SpeechStatus";

/**
 * Voice command sheet. Shows the current step of the command pipeline, the recognised text
 * (editable, for correction), and only the buttons relevant to that step. It keeps no
 * conversation history — it is a command bar, not a chat.
 */
export default function VoicePanel({ onClose }) {
  const { t, getEngine, settings } = useApp();
  const [engine, setEngine] = useState(null);
  const [state, setState] = useState("idle");
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [result, setResult] = useState(null);
  const [clarify, setClarify] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastCommand, setLastCommand] = useState("");
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    let eng;
    const subs = [];
    getEngine().then((e) => {
      eng = e;
      const on = (type, fn) => { const h = (ev) => fn(ev.detail); e.addEventListener(type, h); subs.push(() => e.removeEventListener(type, h)); };
      on("state", (d) => setState(d.state));
      on("level", (d) => setLevel(d.level));
      on("transcript", (d) => setTranscript(d.text));
      on("response", (d) => setResponse(d.text));
      on("result", (d) => { setResult(d); setClarify(null); });
      on("clarify", (d) => setClarify(d.options));
      on("confirm-request", () => setConfirming(true));
      on("confirm-resolved", () => setConfirming(false));
      on("tts-unavailable", () => setNotice(tRef.current("voice.ttsUnavailable")));
      on("asr-unavailable", () => setNotice(tRef.current("voice.asrUnavailable")));
      setEngine(e);
    });
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    return () => {
      subs.forEach((u) => u());
      eng?.release(); // free model memory: nothing keeps running after the panel closes
    };
  }, [getEngine]);

  const run = useCallback(async (fn) => {
    setNotice(null);
    setClarify(null);
    await fn();
  }, []);

  const listen = () => run(async () => {
    setTranscript(""); setResponse(""); setResult(null);
    const text = await (await getEngine()).listen();
    if (text) setLastCommand(text);
  });

  const submitText = (text) => run(async () => {
    if (!text.trim()) return;
    setTranscript(text);
    setLastCommand(text);
    // Await the engine: Enter can submit the form before the lazy-loaded engine is ready.
    await (await getEngine()).handleText(text.trim());
  });

  const close = () => { engine?.cancelListening(); dialogRef.current?.close(); onClose(); };
  const busy = ["loading", "listening", "transcribing", "understanding"].includes(state);
  const langName = (code) => LANGUAGES.find((l) => l.code === code)?.native ?? code;

  return (
    <dialog ref={dialogRef} onCancel={(e) => { e.preventDefault(); close(); }} aria-labelledby="voice-title"
      className="mx-auto mb-0 mt-auto w-full max-w-xl rounded-t-[2rem] bg-surface p-0 text-ink shadow-2xl sm:mb-auto sm:rounded-[2rem]">
      <div className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div aria-hidden="true" className="mx-auto -mt-1 h-1.5 w-12 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between">
          <h2 id="voice-title" className="text-2xl font-bold">{t("voice.title")}</h2>
          <button type="button" onClick={close} className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 transition active:scale-95" aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        <p className="text-sm text-muted">{t("voice.notChat")} · {langName(settings.language)}</p>

        {/* Big microphone control */}
        <div className="adire -mx-5 flex flex-col items-center gap-3 px-5 py-6 text-hero-ink">
          <button type="button" onClick={busy ? () => engine?.cancelListening() : listen} disabled={!engine}
            aria-label={busy ? t("voice.stop") : t("voice.tapToSpeak")}
            className={`relative grid h-28 w-28 place-items-center rounded-full shadow-xl transition active:scale-95 ${state === "listening" ? "bg-danger text-white" : "bg-accent text-accent-ink"}`}>
            {state === "listening" && (
              <span aria-hidden="true" className="absolute inset-0 rounded-full ring-4 ring-white/60"
                style={{ transform: `scale(${1 + level * 0.35})`, transition: "transform 80ms linear" }} />
            )}
            <Icon name={busy ? "stop" : "mic"} size={44} />
          </button>
          <p role="status" aria-live="polite" className="font-display text-xl font-semibold">
            {state === "idle" || state === "speaking" ? (state === "speaking" ? t("voice.speaking") : t("voice.tapToSpeak")) : t(`voice.${state}`)}
          </p>
        </div>
        <SpeechStatus />

        {/* Recognised text: editable so users can correct recognition errors */}
        <form onSubmit={(e) => { e.preventDefault(); submitText(inputRef.current.value); }} className="flex flex-col gap-2">
          <label htmlFor="voice-text" className="font-semibold">{transcript ? t("voice.youSaid") : t("voice.typeCommand")}</label>
          <div className="flex gap-2">
            <input id="voice-text" ref={inputRef} key={transcript} defaultValue={transcript} autoComplete="off"
              className="min-h-13 w-full min-w-0 rounded-2xl bg-surface-2/70 px-4 text-lg ring-1 ring-inset ring-line focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand" />
            <Button type="submit" size="md" disabled={!engine || busy}>{t("voice.go")}</Button>
          </div>
          {transcript && <p className="text-sm text-muted">{t("voice.correctHint")}</p>}
        </form>

        {result && (
          <p className="text-sm text-muted">
            {t("voice.detected", { lang: langName(result.classification.language) })} · {t("voice.confidence", { pct: Math.round(result.classification.confidence * 100) })}
          </p>
        )}

        {response && <p className="rounded-2xl rounded-tl-md bg-brand-soft p-4 text-lg leading-snug" aria-live="polite">{response}</p>}
        {notice && <Notice tone="warn">{notice}</Notice>}

        {clarify?.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {clarify.map((intent) => (
              <Button key={intent} variant="secondary" onClick={() => run(() => engine.perform(intentToAction(intent)))}>
                {t(`intent.${intent}`)}
              </Button>
            ))}
          </div>
        )}

        {confirming && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => run(() => engine.answerConfirmation(true))}>{t("common.yes")}</Button>
            <Button variant="secondary" onClick={() => run(() => engine.answerConfirmation(false))}>{t("common.no")}</Button>
          </div>
        )}

        <SpeechAttribution />
        {lastCommand && !busy && (
          <Button variant="ghost" icon="refresh" onClick={() => submitText(lastCommand)}>{t("voice.repeatCommand")}</Button>
        )}
      </div>
    </dialog>
  );
}

/** Turn a clarification choice back into a router action (the user tapped it, so it's certain). */
function intentToAction(intent) {
  if (intent in NAV_ROUTES) {
    if (SENSITIVE.has(intent)) return { type: "confirm", action: { type: "sync_now", intent }, promptKey: "voice.confirmSync" };
    return { type: "navigate", path: NAV_ROUTES[intent], intent };
  }
  const map = { "action.go_back": "go_back", "action.read_aloud": "read_aloud", "action.repeat": "repeat", "action.help": "help", "action.stop_speaking": "stop_speaking" };
  return { type: map[intent] || "help" };
}
