"use client";
/**
 * Contributor workspace tabs. Contributors translate FROM English, so this tooling is in English.
 * Everything submitted is a draft until a different native speaker (reviewer) approves it.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Notice, Pill, TextArea, Toggle } from "@/components/ui";
import { MESSAGES, SOURCE_MESSAGES } from "@/lib/i18n/messages";
import { classifyTemplates } from "@/lib/nano/asr/features";
import { getPack, installPack } from "@/lib/nano/voicepack";
import { uuid } from "@/lib/crypto";
import * as api from "@/services/contrib";
import { useRecorder } from "./useRecorder";

const PROMPT_KEYS = Object.keys(SOURCE_MESSAGES).filter((k) => k.startsWith("voice.") && !["voice.title", "voice.examples", "voice.packsTitle", "voice.youSaid", "voice.typeCommand", "voice.go", "voice.correctHint"].includes(k));
const TARGET_TAKES = 5; // per command, per speaker

function useIntents() {
  const [data, setData] = useState({ intents: [], examples: {} });
  useEffect(() => {
    Promise.all([fetch("/models/nano/intent-v1.json").then((r) => r.json()), fetch("/models/nano/examples.json").then((r) => r.json())])
      .then(([meta, ex]) => setData({ intents: meta.intents.filter((i) => i !== "unknown"), examples: ex }))
      .catch(() => {});
  }, []);
  return data;
}

function Consent({ value, onChange, lang }) {
  return (
    <Toggle checked={value} onChange={onChange} label="I agree to share my voice"
      hint={`My recordings may be stored by AwaVote, played to users as ${lang} voice prompts, used to recognise ${lang} voice commands, and published in AwaVote's open voice packs. I can ask for them to be removed.`} />
  );
}

function Level({ level }) {
  return <div className="h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden="true"><div className="h-full bg-danger" style={{ width: `${Math.round(level * 100)}%` }} /></div>;
}

// ------------------------------------------------------------------ translate
export function TranslateTab({ lang }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("missing");
  const [drafts, setDrafts] = useState({});
  const [msg, setMsg] = useState(null);
  const load = () => api.listTranslations(lang).then((d) => setData(d.keys)).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys = useMemo(() => Object.keys(SOURCE_MESSAGES).filter((k) => {
    const d = data?.[k];
    if (filter === "missing") return !d?.approved && !d?.pending?.length;
    if (filter === "pending") return d?.pending?.length;
    if (filter === "stale") return d?.approved && d.approved.source_text !== SOURCE_MESSAGES[k];
    return d?.approved;
  }), [data, filter]);

  async function submit(key) {
    const text = (drafts[key] ?? "").trim();
    if (!text) return;
    await api.proposeTranslation({ lang, key, text, source_text: SOURCE_MESSAGES[key] });
    setDrafts((d) => ({ ...d, [key]: undefined }));
    setMsg(`Submitted "${key}" for review.`);
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <Notice tone="info">Translate the English text naturally, keeping words in {"{curly braces}"} exactly as they are (they are filled in by the app). Another reviewer must approve each translation before anyone sees it.</Notice>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {["missing", "pending", "stale", "approved"].map((f) => (
          <Button key={f} size="md" variant={filter === f ? "primary" : "secondary"} onClick={() => setFilter(f)}>
            {{ missing: "Not translated", pending: "Waiting for review", stale: "English changed", approved: "Approved" }[f]}
          </Button>
        ))}
      </div>
      {msg && <Notice tone="ok">{msg}</Notice>}
      <p className="text-sm text-muted">{keys.length} items</p>
      {keys.slice(0, 40).map((k) => {
        const d = data?.[k];
        const seed = d?.approved?.text ?? MESSAGES[lang]?.[k] ?? "";
        return (
          <Card key={k} className="flex flex-col gap-2">
            <p className="font-mono text-xs text-muted">{k}</p>
            <p className="font-semibold" lang="en">{SOURCE_MESSAGES[k]}</p>
            {d?.approved && <p className="text-sm">Approved: <span className="font-semibold">{d.approved.text}</span></p>}
            {d?.pending?.map((p) => <p key={p.id} className="text-sm text-muted">Waiting: “{p.text}” — {p.author}</p>)}
            {!d?.approved && MESSAGES[lang]?.[k] && <p className="text-sm text-warn">Pre-filled with an unreviewed developer draft — please correct it.</p>}
            <TextArea label={`Your ${lang} translation`} value={drafts[k] ?? seed} onChange={(v) => setDrafts((x) => ({ ...x, [k]: v }))} rows={2} />
            <Button size="md" onClick={() => submit(k)}>Submit for review</Button>
          </Card>
        );
      })}
      {keys.length > 40 && <p className="text-sm text-muted">Showing the first 40. Submit these to see more.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ record spoken prompts
export function PromptsTab({ lang, published }) {
  const rec = useRecorder();
  const [i, setI] = useState(0);
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState(null);
  const key = PROMPT_KEYS[i];
  const text = published?.[key];

  async function save() {
    try {
      await api.uploadRecording({ id: uuid(), lang, kind: "prompt", key, transcript: text, duration_ms: rec.take.durationMs, consent }, rec.take.wav);
      setMsg(`Saved prompt ${i + 1}. It will be used after review.`);
      rec.reset();
      setI((x) => Math.min(PROMPT_KEYS.length - 1, x + 1));
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Notice tone="info">Read each sentence aloud clearly in a quiet place. These recordings are what AwaVote plays to {lang} speakers, so it never has to use a computer voice for your language.</Notice>
      <Consent value={consent} onChange={setConsent} lang={lang} />
      <p className="text-sm text-muted">Prompt {i + 1} of {PROMPT_KEYS.length}</p>
      <Card>
        <p className="font-mono text-xs text-muted">{key}</p>
        {text ? <p className="text-xl font-semibold" lang={lang}>{text}</p>
          : <Notice tone="warn">This sentence has no approved {lang} translation yet. Translate it first (Translate tab), then record it once approved.</Notice>}
        <p className="mt-1 text-sm text-muted" lang="en">English: {SOURCE_MESSAGES[key]}</p>
      </Card>
      {rec.state === "recording" && <Level level={rec.level} />}
      { }
      {rec.take && <audio controls src={rec.take.url} className="w-full" />}
      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="secondary" disabled={i === 0} onClick={() => { rec.reset(); setI(i - 1); }}>Previous</Button>
        <Button icon={rec.state === "recording" ? "stop" : "mic"} disabled={!text || !consent}
          onClick={rec.state === "recording" ? rec.stop : () => rec.record({ maxMs: 12000 })}>
          {rec.state === "recording" ? "Stop" : rec.take ? "Record again" : "Record"}
        </Button>
        <Button disabled={!rec.take || !consent} onClick={save}>Save</Button>
      </div>
      <Button variant="ghost" onClick={() => { rec.reset(); setI(Math.min(PROMPT_KEYS.length - 1, i + 1)); }}>Skip</Button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {rec.error && <Notice tone="danger">{rec.error === "mic_denied" ? "Microphone permission was refused." : "Recording failed — please try again."}</Notice>}
    </div>
  );
}

// ------------------------------------------------------------------ record commands
export function CommandsTab({ lang }) {
  const { intents, examples } = useIntents();
  const rec = useRecorder();
  const [i, setI] = useState(0);
  const [consent, setConsent] = useState(false);
  const [said, setSaid] = useState("");
  const [counts, setCounts] = useState({});
  const [msg, setMsg] = useState(null);
  const intent = intents[i];
  const enExample = examples.en?.find((e) => e.intent === intent)?.text;
  const localExample = examples[lang]?.find((e) => e.intent === intent)?.text;

  async function save() {
    try {
      await api.uploadRecording({ id: uuid(), lang, kind: "command", key: intent, transcript: said.trim(),
        duration_ms: rec.take.durationMs, consent, features: rec.take.features }, rec.take.wav);
      const n = (counts[intent] || 0) + 1;
      setCounts({ ...counts, [intent]: n });
      setMsg(n >= TARGET_TAKES ? `Done with this command (${n} takes). Moving on.` : `Saved take ${n} of ${TARGET_TAKES}.`);
      rec.reset();
      if (n >= TARGET_TAKES) { setI((x) => (x + 1) % intents.length); setSaid(""); }
    } catch (e) { setMsg(e.message); }
  }

  if (!intent) return <p>Loading…</p>;
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="info">Say each command the way you would naturally say it in {lang}, {TARGET_TAKES} times, varying it slightly. Many different speakers (men, women, young, old, different dialects) make recognition work for everyone.</Notice>
      <Consent value={consent} onChange={setConsent} lang={lang} />
      <p className="text-sm text-muted">Command {i + 1} of {intents.length} · {counts[intent] || 0}/{TARGET_TAKES} takes</p>
      <Card>
        <p className="text-sm text-muted">Meaning</p>
        <p className="text-xl font-bold" lang="en">“{enExample || intent}”</p>
        {localExample && <p className="mt-1 text-sm text-muted">Example (unreviewed): <span lang={lang}>{localExample}</span></p>}
      </Card>
      <TextArea label={`Type what you will say in ${lang}`} value={said} onChange={setSaid} rows={2} />
      {rec.state === "recording" && <Level level={rec.level} />}
      { }
      {rec.take && <audio controls src={rec.take.url} className="w-full" />}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button icon={rec.state === "recording" ? "stop" : "mic"} disabled={!consent || !said.trim()}
          onClick={rec.state === "recording" ? rec.stop : () => rec.record({ maxMs: 5000 })}>
          {rec.state === "recording" ? "Stop" : rec.take ? "Record again" : "Record"}
        </Button>
        <Button disabled={!rec.take || !consent || !said.trim()} onClick={save}>Save take</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => { rec.reset(); setI((i - 1 + intents.length) % intents.length); setSaid(""); }}>Previous command</Button>
        <Button variant="ghost" onClick={() => { rec.reset(); setI((i + 1) % intents.length); setSaid(""); }}>Next command</Button>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {rec.error && <Notice tone="danger">{rec.error === "mic_denied" ? "Microphone permission was refused." : "Recording failed or was too short — please try again."}</Notice>}
    </div>
  );
}

// ------------------------------------------------------------------ accuracy test
export function TestTab({ lang, meId }) {
  const { intents, examples } = useIntents();
  const rec = useRecorder();
  const [pack, setPack] = useState(undefined);
  const [target, setTarget] = useState(null);
  const [log, setLog] = useState([]);
  const [msg, setMsg] = useState(null);

  async function refreshPack() {
    setMsg(null);
    try { await installPack(lang); } catch (e) { setMsg(e.message); }
    setPack((await getPack(lang)) || null);
  }
  useEffect(() => { getPack(lang).then((p) => setPack(p || null)); }, [lang]);
  useEffect(() => { if (intents.length && !target) setTarget(intents[Math.floor(Math.random() * intents.length)]); }, [intents, target]);

  const inPack = pack?.commands?.some((c) => c.speaker === meId);
  async function attempt() {
    const take = await rec.record({ maxMs: 5000 });
    if (!take) return;
    const r = classifyTemplates(take.features, pack.commands);
    const correct = r.intent === target;
    setLog((l) => [{ target, predicted: r.intent, confidence: r.confidence, correct }, ...l]);
    await api.logEvaluation({ lang, recognizer: "templates-v1", pack_version: pack.version, expected: target, predicted: r.intent, confidence: Math.min(1, r.confidence) }).catch(() => {});
    rec.reset();
    setTarget(intents[Math.floor(Math.random() * intents.length)]);
  }
  const acc = log.length ? Math.round((log.filter((x) => x.correct).length / log.length) * 100) : null;

  return (
    <div className="flex flex-col gap-3">
      <Notice tone="info">This measures how well {lang} voice commands work. Results only count towards the published accuracy if your voice is NOT among the recordings — so ask speakers who did not record commands to do this test.</Notice>
      <Button variant="secondary" icon="download" onClick={refreshPack}>Download latest {lang} voice pack</Button>
      {pack === null && <Notice tone="warn">No approved command recordings for {lang} yet.</Notice>}
      {msg && <Notice tone="warn">{msg}</Notice>}
      {inPack && <Notice tone="warn">Your voice is in this pack, so your attempts will not count towards the published accuracy.</Notice>}
      {pack?.commands?.length > 0 && target && (
        <>
          <Card>
            <p className="text-sm text-muted">Say this command in {lang}:</p>
            <p className="text-2xl font-bold" lang="en">“{examples.en?.find((e) => e.intent === target)?.text || target}”</p>
          </Card>
          {rec.state === "recording" && <Level level={rec.level} />}
          <Button icon="mic" onClick={rec.state === "recording" ? rec.stop : attempt}>{rec.state === "recording" ? "Stop" : "Speak"}</Button>
          {acc !== null && <p className="text-lg font-semibold">This session: {acc}% correct ({log.length} attempts)</p>}
          <ul className="flex flex-col gap-1 text-sm">
            {log.slice(0, 10).map((x, n) => (
              <li key={n}><Pill tone={x.correct ? "ok" : "warn"}>{x.correct ? "correct" : "wrong"}</Pill> expected {x.target} → heard {x.predicted ?? "nothing"}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ review
export function ReviewTab({ lang, meId }) {
  const [tr, setTr] = useState(null);
  const [recs, setRecs] = useState([]);
  const [audio, setAudio] = useState({});
  const [msg, setMsg] = useState(null);
  const load = async () => {
    try {
      const d = await api.listTranslations(lang);
      setTr(Object.entries(d.keys).flatMap(([, v]) => v.pending).filter((p) => p.author_id !== meId));
      setRecs((await api.listRecordings(lang, "&status=pending")).filter((r) => r.speaker_id !== meId));
    } catch (e) { setMsg(e.message); }
  };
  useEffect(() => { load(); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(kind, id, approve) {
    try {
      if (kind === "t") await api.reviewTranslation(id, approve); else await api.reviewRecording(id, approve);
      load();
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Notice tone="info">Approve only what is correct, natural and respectful {lang}. You cannot review your own work.</Notice>
      {msg && <Notice tone="danger">{msg}</Notice>}
      <h3 className="text-lg font-bold">Translations ({tr?.length ?? 0})</h3>
      {tr?.map((p) => (
        <Card key={p.id}>
          <p className="font-mono text-xs text-muted">{p.key} · by {p.author}</p>
          <p lang="en" className="text-muted">{p.source_text}</p>
          <p className="text-lg font-semibold" lang={lang}>{p.text}</p>
          {p.source_text !== SOURCE_MESSAGES[p.key] && <p className="text-sm text-warn">The English text has changed since this was written.</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button size="md" onClick={() => decide("t", p.id, true)}>Approve</Button>
            <Button size="md" variant="secondary" onClick={() => decide("t", p.id, false)}>Reject</Button>
          </div>
        </Card>
      ))}
      <h3 className="text-lg font-bold">Recordings ({recs.length})</h3>
      {recs.map((r) => (
        <Card key={r.id}>
          <p className="font-mono text-xs text-muted">{r.kind} · {r.key} · by {r.speaker}</p>
          <p className="font-semibold" lang={lang}>“{r.transcript}”</p>
          {audio[r.id] ? <audio controls src={audio[r.id]} className="mt-2 w-full" />  
            : <Button size="md" variant="secondary" icon="play" className="mt-2" onClick={async () => setAudio({ ...audio, [r.id]: await api.recordingAudioUrl(r.id) })}>Listen</Button>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button size="md" onClick={() => decide("r", r.id, true)}>Approve</Button>
            <Button size="md" variant="secondary" onClick={() => decide("r", r.id, false)}>Reject</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
