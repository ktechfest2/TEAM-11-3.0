"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppContext } from "@/hooks/useApp";
import { setContributedMessages, translate } from "@/lib/i18n/messages";
import { languageByCode } from "@/lib/i18n/languages";
import { kvGet, kvSet, onChange } from "@/lib/db";
import { apiBase, checkServer } from "@/services/api";
import { installedPacks } from "@/lib/nano/voicepack";
import { flushOutbox, outboxCounts, startAutoSync } from "@/services/sync";
import { isPackInstalled, PACKS } from "@/lib/nano/packs";

export const DEFAULT_SETTINGS = {
  language: "en", theme: "system", textSize: "lg", highContrast: false, reduceMotion: false,
  speechRate: 1, autoSpeak: false, allowOnlineSpeech: false, mmsVoice: false,
};
const LS_KEY = "awavote.settings";

function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; } catch { return DEFAULT_SETTINGS; }
}

export default function AppProvider({ children }) {
  const router = useRouter();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [online, setOnline] = useState(true);
  const [serverUp, setServerUp] = useState(null);
  const [sync, setSync] = useState({ pending: 0, failed: 0, conflict: 0, lastSyncAt: null });
  const [packs, setPacks] = useState({});
  const [voicePacks, setVoicePacks] = useState({});
  const [i18nVersion, setI18nVersion] = useState(0);
  const [languageStats, setLanguageStats] = useState(null);
  const [speech, setSpeech] = useState({ status: "checking" });
  const engineRef = useRef(null);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // ---- settings ----
  useEffect(() => setSettings(readSettings()), []);
  useEffect(() => {
    const h = document.documentElement;
    h.lang = languageByCode(settings.language)?.bcp47 || settings.language;
    h.dataset.textSize = settings.textSize;
    h.dataset.contrast = settings.highContrast ? "high" : "normal";
    h.dataset.theme = settings.theme || "system";
    const dark = settings.theme === "dark" || (settings.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0c1310" : "#f5f1e8"));
    h.dataset.reduceMotion = String(settings.reduceMotion);
  }, [settings]);

  const updateSettings = useCallback((patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      settingsRef.current = next; // visible to the voice engine immediately, before re-render
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  // Approved native-speaker translations: cached copy first (offline), then refresh from the server.
  useEffect(() => {
    let live = true;
    const lang = settings.language;
    if (lang === "en") return;
    kvGet(`i18n:${lang}`).then((cached) => {
      if (!live) return;
      if (cached) { setContributedMessages(lang, cached.messages); setI18nVersion((v) => v + 1); }
      if (!navigator.onLine) return;
      fetch(`${apiBase()}/api/i18n/${lang}`).then((r) => (r.ok ? r.json() : null)).then(async (fresh) => {
        if (!live || !fresh) return;
        setContributedMessages(lang, fresh.messages);
        await kvSet(`i18n:${lang}`, fresh);
        setI18nVersion((v) => v + 1);
      }).catch(() => {});
    });
    return () => { live = false; };
  }, [settings.language]);

  // Measured per-language support (approved text, recordings, held-out accuracy).
  useEffect(() => {
    kvGet("languageStats").then((c) => c && setLanguageStats(c));
    if (!online) return;
    fetch(`${apiBase()}/api/languages/stats`).then((r) => (r.ok ? r.json() : null)).then((s) => {
      if (s) { setLanguageStats(s); kvSet("languageStats", s); }
    }).catch(() => {});
  }, [online]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((key, vars) => translate(settings.language, key, vars), [settings.language, i18nVersion]);

  // ---- connectivity ----
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    if (!online) { setServerUp(false); return; }
    let live = true;
    const ping = () => checkServer().then((ok) => live && setServerUp(ok));
    ping();
    const id = setInterval(ping, 30_000);
    return () => { live = false; clearInterval(id); };
  }, [online]);

  // ---- sync status + auto sync + service worker ----
  useEffect(() => {
    const refresh = async () => setSync({ ...(await outboxCounts()), lastSyncAt: await kvGet("lastSyncAt") });
    refresh();
    const off = onChange(({ store }) => (store === "outbox" || store === "kv") && refresh());
    const stop = startAutoSync();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW registration failed", e));
    }
    return () => { off(); stop(); };
  }, []);

  // ---- model packs ----
  const refreshPacks = useCallback(async () => {
    const entries = await Promise.all(PACKS.map(async (p) => [p.id, await isPackInstalled(p)]));
    setPacks(Object.fromEntries(entries));
  }, []);
  useEffect(() => { refreshPacks(); }, [refreshPacks]);
  useEffect(() => {
    const load = () => installedPacks().then(setVoicePacks).catch(() => {});
    load();
    return onChange(({ store }) => store === "voicepacks" && load());
  }, []);
  // Automatic speech setup for the current language (no user configuration). Runs when the
  // browser is idle so it never competes with the first paint.
  useEffect(() => {
    let live = true;
    const lang = settings.language;
    const run = () => import("@/lib/nano/speech").then(({ ensureSpeech }) =>
      ensureSpeech(lang, (st) => live && setSpeech(st))).catch(() => live && setSpeech({ status: "unavailable" }));
    const idle = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 1500);
    const onOnline = () => run();
    window.addEventListener("online", onOnline);
    return () => {
      live = false;
      window.cancelIdleCallback ? window.cancelIdleCallback(idle) : clearTimeout(idle);
      window.removeEventListener("online", onOnline);
    };
  }, [settings.language]);

  /** One-tap download on metered connections (the only time users are ever asked). */
  const downloadSpeech = useCallback(async () => {
    const { ensureSpeech } = await import("@/lib/nano/speech");
    return ensureSpeech(settingsRef.current.language, setSpeech, { userConfirmed: true });
  }, []);
  const speechRef = useRef(speech);
  useEffect(() => { speechRef.current = speech; }, [speech]);

  const voicePacksRef = useRef(voicePacks);
  useEffect(() => { voicePacksRef.current = voicePacks; }, [voicePacks]);

  // ---- voice engine (created lazily, released when voice panel closes) ----
  const readPage = useCallback(async () => {
    const tts = await import("@/lib/nano/tts");
    const root = document.querySelector("[data-speak-root]") || document.querySelector("main");
    const text = root?.innerText?.replace(/\s+\n/g, "\n").slice(0, 3000) || "";
    const s = settingsRef.current;
    return tts.speak(text, { lang: s.language, rate: s.speechRate, mmsEnabled: s.mmsVoice });
  }, []);

  const execute = useCallback(async (action) => {
    switch (action.type) {
      case "navigate": router.push(action.path); return true;
      case "go_back": router.back(); return true;
      case "set_language": updateSettings({ language: action.lang }); return true;
      case "read_aloud": await readPage(); return true;
      case "sync_now": {
        const r = await flushOutbox({ force: true });
        return !r.offline;
      }
      default: return false;
    }
  }, [router, updateSettings, readPage]);

  const executeRef = useRef(execute);
  useEffect(() => { executeRef.current = execute; }, [execute]);

  const getEngine = useCallback(async () => {
    if (!engineRef.current) {
      const { NanoEngine } = await import("@/lib/nano/engine");
      engineRef.current = new NanoEngine({
        getSettings: () => ({ ...settingsRef.current, speech: speechRef.current, voicePacks: voicePacksRef.current }),
        execute: (a) => executeRef.current(a),
      });
    }
    return engineRef.current;
  }, []);

  const value = useMemo(() => ({
    settings, updateSettings, t, online, serverUp, sync, packs, refreshPacks, getEngine, readPage, voicePacks, languageStats,
    speech, downloadSpeech,
  }), [settings, updateSettings, t, online, serverUp, sync, packs, refreshPacks, getEngine, readPage, voicePacks, languageStats, speech, downloadSpeech]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
