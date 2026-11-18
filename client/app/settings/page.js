"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Button, Card, Notice, Pill, Toggle } from "@/components/ui";
import { LANGUAGES } from "@/lib/i18n/languages";
import { languageSupport } from "@/components/languages/status";
import { installPack, removePack as removeVoicePack } from "@/lib/nano/voicepack";
import { PACKS, removePack } from "@/lib/nano/packs";

const SIZES = [["md", "A"], ["lg", "A+"], ["xl", "A++"], ["xxl", "A+++"]];

function PackRow({ pack }) {
  const { t, packs, refreshPacks } = useApp();
  const [pct, setPct] = useState(null);
  const [error, setError] = useState(null);
  const installed = packs[pack.id];

  async function download() {
    setError(null);
    setPct(0);
    try {
      const { downloadPack } = await import("@/lib/nano/download");
      await downloadPack(pack, setPct);
    } catch (e) {
      setError(e.message);
    } finally {
      setPct(null);
      refreshPacks();
    }
  }

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{pack.title}</p>
        {pack.builtIn ? <Pill tone="ok">{t("pack.builtIn")}</Pill> : installed ? <Pill tone="ok" icon="check">{t("pack.installed")}</Pill> : <Pill>{pack.sizeMB} MB</Pill>}
      </div>
      <p className="text-sm text-muted">{pack.model} · {t("pack.languages")}: {pack.languages.map((l) => LANGUAGES.find((x) => x.code === l)?.native).join(", ")}</p>
      <p className="text-sm text-muted">{t("pack.license")}: {pack.license}</p>
      <p className="mt-1 text-sm">{pack.note}</p>
      {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
      {!pack.builtIn && (
        <div className="mt-2">
          {pct !== null ? (
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("pack.downloading", { pct })} className="h-3 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          ) : installed ? (
            <Button size="md" variant="secondary" onClick={async () => { await removePack(pack); refreshPacks(); }}>{t("pack.remove")}</Button>
          ) : (
            <Button size="md" variant="secondary" icon="download" onClick={download}>{t("pack.download")} ({pack.sizeMB} MB)</Button>
          )}
        </div>
      )}
    </li>
  );
}

function SupportBadges({ code }) {
  const { t, languageStats } = useApp();
  const s = languageSupport(code, languageStats);
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      <Pill tone={s.ui.pct >= 90 ? "ok" : s.ui.reviewed ? "info" : "muted"}>
        {code === "en" ? t("lang.uiComplete") : s.ui.reviewed ? t("lang.uiPct", { pct: s.ui.pct }) : s.ui.drafts ? t("lang.uiDraft") : t("lang.uiNone")}
      </Pill>
      {s.voice.state === "validated" && <Pill tone="ok" icon="mic">{t("lang.voiceValidated", { pct: Math.round(s.voice.accuracy * 100) })}</Pill>}
      {s.voice.state === "testing" && <Pill tone="warn" icon="mic">{t("lang.voiceTesting")}</Pill>}
    </span>
  );
}

function VoicePackRow() {
  const { t, settings, voicePacks, online } = useApp();
  const lang = settings.language;
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  if (lang === "en") return null;
  const installed = voicePacks[lang];
  async function download() {
    setMsg(null); setBusy(0);
    try { const p = await installPack(lang, setBusy); if (!p) setMsg(t("lang.packEmpty")); } catch (e) { setMsg(e.message); }
    setBusy(null);
  }
  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <p className="font-bold">{t("lang.packTitle")}</p>
      <p className="text-sm text-muted">{installed ? t("lang.packInstalled", { commands: installed.commands, speakers: installed.speakers, prompts: installed.prompts }) : t("lang.packHint")}</p>
      {msg && <p className="mt-1 text-sm text-warn">{msg}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="md" variant="secondary" icon="download" disabled={busy !== null || !online} onClick={download}>
          {busy !== null ? t("pack.downloading", { pct: busy }) : installed ? t("lang.packUpdate") : t("pack.download")}
        </Button>
        {installed && <Button size="md" variant="ghost" onClick={() => removeVoicePack(lang)}>{t("pack.remove")}</Button>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { t, settings, updateSettings, packs } = useApp();
  const [installEvt, setInstallEvt] = useState(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("settings.title")} />

      <Card>
        <fieldset>
          <legend className="mb-2 text-lg font-bold">{t("settings.language")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LANGUAGES.map((l) => (
              <label key={l.code} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 ${settings.language === l.code ? "border-brand bg-brand-soft" : "border-line"}`}>
                <input type="radio" name="lang" value={l.code} checked={settings.language === l.code} onChange={() => updateSettings({ language: l.code })} className="h-5 w-5 accent-[var(--brand)]" />
                <span lang={l.bcp47} className="min-w-0">
                  <span className="font-bold">{l.native}</span>{l.native !== l.name && <span className="text-muted"> · {l.name}</span>}
                  <SupportBadges code={l.code} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-3 text-sm text-muted">{t("lang.explainer")}</p>
        <VoicePackRow />
        <a href="/languages" className="mt-3 inline-block font-semibold text-brand underline">{t("lang.dashboardLink")}</a>
      </Card>

      <Card>
        <fieldset>
          <legend className="mb-2 text-lg font-bold">{t("settings.textSize")}</legend>
          <div className="grid grid-cols-4 gap-2">
            {SIZES.map(([v, label], i) => (
              <button key={v} type="button" aria-pressed={settings.textSize === v} onClick={() => updateSettings({ textSize: v })}
                className={`min-h-14 rounded-xl border-2 font-bold ${settings.textSize === v ? "border-brand bg-brand-soft" : "border-line"}`} style={{ fontSize: `${1 + i * 0.2}rem` }}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <Toggle label={t("settings.contrast")} checked={settings.highContrast} onChange={(v) => updateSettings({ highContrast: v })} />
        <Toggle label={t("settings.reduceMotion")} checked={settings.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
        <div className="py-2">
          <label htmlFor="rate" className="font-semibold">{t("settings.speechRate")}: {settings.speechRate.toFixed(1)}×</label>
          <input id="rate" type="range" min="0.5" max="1.5" step="0.1" value={settings.speechRate}
            onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })} className="mt-2 h-10 w-full accent-[var(--brand)]" />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("voice.packsTitle")}</h2>
        <ul className="mt-3 flex flex-col gap-3">{PACKS.map((p) => <PackRow key={p.id} pack={p} />)}</ul>
        <Toggle label={t("settings.onlineSpeech")} hint={t("settings.onlineSpeechHint")} checked={settings.allowOnlineSpeech} onChange={(v) => updateSettings({ allowOnlineSpeech: v })} />
        {packs["tts-mms-yor"] && <Toggle label={t("settings.mmsVoice")} checked={settings.mmsVoice} onChange={(v) => updateSettings({ mmsVoice: v })} />}
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("settings.install")}</h2>
        {standalone ? <p className="text-muted">{t("settings.installed")}</p>
          : installEvt ? <Button className="mt-2 w-full" icon="download" onClick={async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }}>{t("settings.install")}</Button>
          : ios ? <p className="text-muted">{t("settings.installIos")}</p> : <p className="text-muted">{t("settings.installIos")}</p>}
      </Card>
    </div>
  );
}
