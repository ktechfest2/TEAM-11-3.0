"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/hooks/useApp";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import PageHeader from "@/components/layout/PageHeader";
import { Button, ButtonLink, Card, ConfirmDialog, Icon, Notice, NumberInput, Pill, Select, TextInput } from "@/components/ui";
import SyncPill from "@/components/ui/SyncPill";
import { getEvidenceBlob, listEvidence, listResults, saveResult } from "@/lib/records";
import { NUMERIC_FIELDS, validateResult } from "@/lib/validation/ec8a";
import { parseEc8aText } from "@/features/verify/parseEc8a";
import { formatDateTime } from "@/lib/time";
import { cleanPuCode } from "@/lib/pollingUnit";
import ContestPicker, { contestComplete } from "@/components/elections/ContestPicker";
import { ballotFor, displayName, getReference } from "@/lib/elections";

const STATUS_TONE = { consistent: "ok", needs_review: "warn", incomplete: "muted" };
const emptyForm = () => ({
  contest: { election: "presidential", state: "", constituency: "" }, pollingUnitCode: "",
  figures: Object.fromEntries(NUMERIC_FIELDS.map((f) => [f, ""])),
  parties: [{ party: "", votes: "" }, { party: "", votes: "" }],
});
const toInt = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

function toPayload(form) {
  const figures = Object.fromEntries(NUMERIC_FIELDS.map((f) => [f, toInt(form.figures[f])]));
  const partyVotes = form.parties.filter((p) => p.party.trim() && p.votes !== "").map((p) => ({ party: p.party.trim().toUpperCase(), votes: Number(p.votes) }));
  return { figures, partyVotes };
}

function ChecksPanel({ validation }) {
  const { t } = useApp();
  return (
    <Card aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t("verify.result")}</h2>
        <Pill tone={STATUS_TONE[validation.status]} icon={validation.status === "consistent" ? "check" : "alert"}>{t(`verify.status.${validation.status}`)}</Pill>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {validation.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            <span className={c.status === "pass" ? "text-ok" : c.status === "fail" ? "text-warn" : "text-muted"}>
              <Icon name={c.status === "pass" ? "checkCircle" : c.status === "fail" ? "alert" : "info"} />
            </span>
            <span>
              <span className={c.status === "skipped" ? "text-muted" : "font-semibold"}>{t(`check.${c.id}`)}</span>
              <span className="block text-sm text-muted">
                {c.status === "skipped" ? t("check.skipped") : c.status === "fail" && c.expected !== null ? t("check.expectedActual", { expected: c.expected, actual: c.actual }) : null}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">{t("verify.intro")}</p>
    </Card>
  );
}

function VerifyInner() {
  const { t } = useApp();
  const params = useSearchParams();
  const evidenceList = useLiveQuery(listEvidence, ["evidence"]);
  const submissions = useLiveQuery(listResults, ["results"]);
  const [evidenceId, setEvidenceId] = useState(params.get("evidence") || "");
  const [photoUrl, setPhotoUrl] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [ocr, setOcr] = useState({ state: "idle", pct: 0, filled: new Set(), count: 0, error: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const [parties, setParties] = useState([]); // INEC register: [{acronym, name}]
  const [ballot, setBallot] = useState(null); // official ballot for the chosen contest
  const [ballotState, setBallotState] = useState("idle"); // idle | loading | ready | error

  useEffect(() => { getReference().then((r) => setParties(r.parties.registered)).catch(() => {}); }, []);

  // Load INEC's official ballot for the chosen contest and pre-fill one row per party on it.
  useEffect(() => {
    let live = true;
    if (!contestComplete(form.contest)) { setBallot(null); setBallotState("idle"); return; }
    setBallotState("loading");
    ballotFor(form.contest.election, form.contest.state, form.contest.constituency)
      .then((b) => {
        if (!live) return;
        setBallot(b);
        setBallotState(b ? "ready" : "error");
        if (b) setForm((f) => (f.parties.some((p) => p.votes !== "") ? f : { ...f, parties: b.entries.map((e) => ({ party: e.party, votes: "" })) }));
      })
      .catch(() => live && setBallotState("error"));
    return () => { live = false; };
  }, [form.contest]);

  const candidateFor = (acronym) => ballot?.entries.find((e) => e.party === acronym);

  const evidence = evidenceList?.find((e) => e.id === evidenceId) || null;

  useEffect(() => {
    let url;
    if (evidence) {
      getEvidenceBlob(evidence, evidence.processed ? "processed" : "original").then((b) => setPhotoUrl((url = URL.createObjectURL(b))));
      if (evidence.pollingUnitCode) setForm((f) => (f.pollingUnitCode ? f : { ...f, pollingUnitCode: evidence.pollingUnitCode }));
    } else setPhotoUrl(null);
    return () => url && URL.revokeObjectURL(url);
  }, [evidence]);

  const payload = useMemo(() => toPayload(form), [form]);
  const validation = useMemo(() => validateResult({ ...payload.figures, party_votes: payload.partyVotes }), [payload]);

  async function runOcr() {
    setOcr({ state: "running", pct: 0, filled: new Set(), count: 0, error: null });
    try {
      const { recognise } = await import("@/features/verify/ocr");
      const blob = await getEvidenceBlob(evidence, evidence.processed ? "processed" : "original");
      const text = await recognise(blob, (pct) => setOcr((o) => ({ ...o, pct })));
      const parsed = parseEc8aText(text);
      const filled = new Set();
      setForm((f) => {
        const figures = { ...f.figures };
        for (const [k, v] of Object.entries(parsed.figures)) if (figures[k] === "") { figures[k] = String(v); filled.add(k); }
        // Only INEC-registered acronyms are accepted from OCR (misreads are dropped, not guessed).
        const registered = new Set(parties.map((x) => x.acronym));
        const ocrVotes = new Map(parsed.parties.filter((p) => registered.has(p.party)).map((p) => [p.party, String(p.votes)]));
        let rows = f.parties;
        if (rows.length && rows.some((p) => p.party)) {
          // Ballot rows already present: fill empty vote boxes for parties OCR recognised.
          rows = rows.map((p, i) => {
            if (p.votes === "" && ocrVotes.has(p.party)) { filled.add(`party-${i}`); return { ...p, votes: ocrVotes.get(p.party) }; }
            return p;
          });
        } else if (ocrVotes.size) {
          rows = [...ocrVotes].map(([party, votes], i) => { filled.add(`party-${i}`); return { party, votes }; });
        }
        return { ...f, figures, parties: rows };
      });
      setOcr({ state: "done", pct: 100, filled, count: parsed.filledCount, error: null });
    } catch (e) {
      setOcr({ state: "error", pct: 0, filled: new Set(), count: 0, error: e.message });
    }
  }

  async function submit() {
    setConfirmOpen(false);
    const rec = await saveResult({
      electionType: form.contest.election, state: form.contest.state || null, constituency: form.contest.constituency || null,
      pollingUnitCode: form.pollingUnitCode.trim(), figures: payload.figures,
      partyVotes: payload.partyVotes, evidenceId: evidence?.id || null,
      extractionMethod: ocr.state === "done" ? "ocr_assisted" : "manual", validation,
    });
    setSaved(rec);
    setForm(emptyForm());
    setOcr({ state: "idle", pct: 0, filled: new Set(), count: 0, error: null });
    window.scrollTo({ top: 0 });
  }

  const setFig = (k, v) => setForm((f) => ({ ...f, figures: { ...f.figures, [k]: v } }));
  const setParty = (i, patch) => setForm((f) => ({ ...f, parties: f.parties.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const canSave = form.pollingUnitCode.trim() && payload.partyVotes.length > 0 && contestComplete(form.contest);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("verify.title")} subtitle={t("verify.disclaimer")} />
      {saved && <Notice tone="ok" title={t("verify.saved")}>{saved.reference} — {t(`verify.status.${saved.validation.status}`)}</Notice>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("verify.attach")}</h2>
        {evidenceList?.length ? (
          <Select label={t("verify.attach")} value={evidenceId} onChange={setEvidenceId}
            options={[{ value: "", label: t("verify.noPhoto") }, ...evidenceList.map((e) => ({ value: e.id, label: `${e.reference}${e.pollingUnitCode ? ` · ${e.pollingUnitCode}` : ""}` }))]} />
        ) : (
          <ButtonLink href="/countcam" icon="camera" variant="secondary">{t("nav.countcam")}</ButtonLink>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photoUrl && <img src={photoUrl} alt={t("evidence.processed")} className="max-h-[60vh] w-full rounded-lg object-contain bg-surface-2" />}
        {evidence && (
          <>
            <Button variant="secondary" icon="file" onClick={runOcr} disabled={ocr.state === "running"}>
              {ocr.state === "running" ? t("verify.ocrRunning", { pct: ocr.pct }) : t("verify.runOcr")}
            </Button>
            <Notice tone="info">{t("verify.ocrNote")}</Notice>
            {ocr.state === "done" && <Notice tone="warn">{t("verify.ocrFilled", { n: ocr.count })}</Notice>}
            {ocr.error && <Notice tone="danger">{ocr.error}</Notice>}
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <ContestPicker value={form.contest} onChange={(contest) => setForm((f) => ({ ...f, contest, parties: f.parties.some((p) => p.votes !== "") ? f.parties : [] }))} />
        <TextInput label={t("verify.pollingUnit")} value={form.pollingUnitCode} onChange={(v) => setForm({ ...form, pollingUnitCode: cleanPuCode(v) })} maxLength={32} autoCapitalize="characters" />
        <div className="grid gap-4 sm:grid-cols-2">
          {NUMERIC_FIELDS.map((f) => (
            <NumberInput key={f} label={t(`field.${f}`)} value={form.figures[f]} onChange={(v) => setFig(f, v)} highlight={ocr.filled.has(f)} />
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("verify.parties")}</h2>
        {ballotState === "ready" && ballot && (
          <p className="text-sm text-muted">
            {t("elections.ballotLoaded", { n: ballot.entries.length })}{" "}
            <a className="underline" href={ballot.source.url} target="_blank" rel="noreferrer">{t("elections.inecSource")}</a>
          </p>
        )}
        {ballotState === "error" && <Notice tone="warn">{t("elections.dataUnavailable")}</Notice>}
        {form.parties.map((p, i) => {
          const cand = candidateFor(p.party);
          return (
          <fieldset key={i} className="grid min-w-0 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-end gap-2">
            <legend className="sr-only">{t("verify.party")} {i + 1}</legend>
            <div className="min-w-0">
              <Select label={t("verify.party")} value={p.party} onChange={(v) => setParty(i, { party: v })}
                options={[{ value: "", label: "—" }, ...parties.map((x) => ({ value: x.acronym, label: `${x.acronym} — ${x.name}` }))]} />
              {cand && <p className="mt-1 truncate text-sm text-muted" title={cand.candidate?.name}>{cand.court_order ? t("elections.courtOrder") : displayName(cand.candidate?.name)}</p>}
            </div>
            <NumberInput label={t("verify.votes")} value={p.votes} onChange={(v) => setParty(i, { votes: v })} highlight={ocr.filled.has(`party-${i}`)} />
            <button type="button" onClick={() => setForm((f) => ({ ...f, parties: f.parties.filter((_, j) => j !== i) }))}
              className="grid min-h-12 min-w-12 place-items-center rounded-xl border-2 border-line" aria-label={`${t("verify.removeParty")} ${p.party || i + 1}`}>
              <Icon name="x" />
            </button>
          </fieldset>
          );
        })}
        <Button variant="secondary" icon="plus" onClick={() => setForm((f) => ({ ...f, parties: [...f.parties, { party: "", votes: "" }] }))}>{t("verify.addParty")}</Button>
      </Card>

      <ChecksPanel validation={validation} />

      <Button icon="shield" onClick={() => setConfirmOpen(true)} disabled={!canSave}>{t("verify.submit")}</Button>
      <ConfirmDialog open={confirmOpen} title={t("verify.submit")} confirmLabel={t("common.confirm")} cancelLabel={t("common.cancel")}
        onConfirm={submit} onCancel={() => setConfirmOpen(false)}>
        <p>{t("verify.confirmSubmit")}</p>
        <p className="mt-2 font-semibold">{t(`verify.status.${validation.status}`)}</p>
      </ConfirmDialog>

      {submissions?.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">{t("verify.mySubmissions")}</h2>
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-2xl border border-line bg-surface p-3">
                <p className="font-bold">{s.reference}</p>
                <p className="text-sm text-muted">{s.pollingUnitCode} · {t(`election.${s.electionType}`)}{s.constituency ? ` · ${s.constituency}` : ""} · {formatDateTime(s.createdAt)}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Pill tone={STATUS_TONE[s.validation.status]}>{t(`verify.status.${s.validation.status}`)}</Pill>
                  <SyncPill status={s.syncStatus} />
                  {s.evidenceId && <Link className="text-sm font-semibold text-brand underline" href={`/evidence?id=${s.evidenceId}`}>{t("nav.evidence")}</Link>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return <Suspense><VerifyInner /></Suspense>;
}
