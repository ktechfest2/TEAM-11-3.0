"use client";
import { useRef, useState } from "react";
import { recordUtterance } from "@/lib/nano/asr/recorder";
import { mfcc } from "@/lib/nano/asr/features";
import { encodeWav } from "@/lib/audio/wav";

/** Record one utterance (VAD-endpointed, 16 kHz) -> { wav, pcm, features, durationMs, url }. */
export function useRecorder() {
  const [state, setState] = useState("idle"); // idle | recording | done | error
  const [level, setLevel] = useState(0);
  const [take, setTake] = useState(null);
  const [error, setError] = useState(null);
  const abort = useRef(null);

  async function record({ maxMs = 6000 } = {}) {
    setError(null);
    setState("recording");
    abort.current = new AbortController();
    try {
      const pcm = await recordUtterance({ onLevel: setLevel, signal: abort.current.signal, maxMs, silenceMs: 700 });
      const durationMs = Math.round((pcm.length / 16000) * 1000);
      if (durationMs < 300) throw new Error("too_short");
      const wav = encodeWav(pcm);
      if (take?.url) URL.revokeObjectURL(take.url);
      const t = { pcm, wav, features: mfcc(pcm), durationMs, url: URL.createObjectURL(wav) };
      setTake(t);
      setState("done");
      return t;
    } catch (e) {
      setState(e.name === "AbortError" ? "idle" : "error");
      if (e.name !== "AbortError") setError(e.name === "NotAllowedError" ? "mic_denied" : e.message);
      return null;
    }
  }
  const stop = () => abort.current?.abort();
  const reset = () => { if (take?.url) URL.revokeObjectURL(take.url); setTake(null); setState("idle"); };
  return { state, level, take, error, record, stop, reset };
}
