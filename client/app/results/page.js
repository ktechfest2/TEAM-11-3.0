"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Button, Card, Notice, Select, TextInput } from "@/components/ui";
import WallVsAnnounced from "@/components/results/WallVsAnnounced";
import { apiFetch } from "@/services/api";
import { cleanPuCode } from "@/lib/pollingUnit";
import { getReference } from "@/lib/elections";

/**
 * Track a result from the polling-unit wall to the official announcement. Anyone can check a
 * polling unit; accredited observers can enter the officially published figures (with the IReV
 * link), which AwaVote compares with what independent photos of the wall say.
 */
function TrackInner() {
  const { t, online } = useApp();
  const params = useSearchParams();
  const [pu, setPu] = useState(params.get("pu") || "");
  const [compare, setCompare] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (code) => {
    const c = (code || "").trim();
    if (!c) return;
    setBusy(true); setError(null);
    try { setCompare(await apiFetch(`/api/results/compare/${encodeURIComponent(c)}`)); } catch (e) { setError(e.message); setCompare(null); }
    setBusy(false);
  }, []);
  useEffect(() => { if (params.get("pu")) check(params.get("pu")); }, [params, check]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("track.title")} subtitle={t("track.subtitle")} />
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); check(pu); }} className="flex items-end gap-2">
          <div className="flex-1"><TextInput label={t("verify.pollingUnit")} value={pu} onChange={(v) => setPu(cleanPuCode(v))} maxLength={32} autoCapitalize="characters" /></div>
          <Button type="submit" size="md" disabled={!pu.trim() || !online || busy}>{t("track.check")}</Button>
        </form>
        {!online && <Notice tone="warn" className="mt-3">{t("track.needsInternet")}</Notice>}
        {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
        {compare && <div className="mt-4"><WallVsAnnounced compare={compare} /></div>}
      </Card>
      <ObserverEntry onSaved={(code) => { setPu(code); check(code); }} />
    </div>
  );
}

const SOURCES = ["irev", "collation", "announcement"];

/** Accredited observers: record the officially published result for a polling unit. */
function ObserverEntry({ onSaved }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [parties, setParties] = useState([]);
  const [f, setF] = useState({ key: "", pu: "", election: "presidential", source: "irev", url: "", by: "", votes: {} });
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (open && !parties.length) getReference().then((r) => setParties(r.parties.registered.map((p) => p.acronym))).catch(() => {}); }, [open, parties.length]);

  async function save(e) {
    e.preventDefault();
    setMsg(null);
    const party_votes = Object.entries(f.votes).filter(([, v]) => v !== "").map(([party, v]) => ({ party, votes: Number(v) }));
    try {
      const r = await apiFetch("/api/official-results", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Observer-Key": f.key },
        body: JSON.stringify({ id: crypto.randomUUID(), created_at: new Date().toISOString(), election_type: f.election,
          polling_unit_code: f.pu.trim(), source: f.source, source_url: f.url.trim() || null, entered_by: f.by.trim(), party_votes }),
      });
      setMsg({ tone: "ok", text: t("track.saved", { ref: r.official.reference }) });
      onSaved(f.pu.trim());
    } catch (err) {
      setMsg({ tone: "danger", text: err.status === 401 ? t("track.badKey") : err.message });
    }
  }

  return (
    <Card>
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><span className="block text-lg font-bold">{t("track.observerTitle")}</span><span className="text-sm text-muted">{t("track.observerHint")}</span></span>
        <span aria-hidden="true" className="text-2xl">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <form onSubmit={save} className="mt-4 flex flex-col gap-3">
          <TextInput label={t("track.observerKey")} type="password" value={f.key} onChange={(v) => setF({ ...f, key: v })} autoComplete="off" />
          <TextInput label={t("track.enteredByLabel")} value={f.by} onChange={(v) => setF({ ...f, by: v })} maxLength={120} />
          <TextInput label={t("verify.pollingUnit")} value={f.pu} onChange={(v) => setF({ ...f, pu: cleanPuCode(v) })} maxLength={32} />
          <Select label={t("verify.electionType")} value={f.election} onChange={(v) => setF({ ...f, election: v })}
            options={["presidential", "senate", "house_of_reps", "governorship", "state_assembly"].map((e) => ({ value: e, label: t(`election.${e}`) }))} />
          <Select label={t("track.sourceLabel")} value={f.source} onChange={(v) => setF({ ...f, source: v })}
            options={SOURCES.map((s) => ({ value: s, label: t(`track.source.${s}`) }))} />
          <TextInput label={t("track.urlLabel")} type="url" value={f.url} onChange={(v) => setF({ ...f, url: v })} maxLength={500} />
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-1 font-semibold">{t("track.officialVotes")}</legend>
            {parties.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm font-bold">
                <span className="w-12">{p}</span>
                <input inputMode="numeric" value={f.votes[p] ?? ""} onChange={(e) => setF({ ...f, votes: { ...f.votes, [p]: e.target.value.replace(/[^0-9]/g, "") } })}
                  className="h-11 w-full min-w-0 rounded-xl bg-surface-2/70 px-2 text-right tabular-nums ring-1 ring-inset ring-line" aria-label={`${p} ${t("verify.votes")}`} />
              </label>
            ))}
          </fieldset>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" icon="shield" disabled={!f.key || !f.pu.trim() || f.by.trim().length < 2 || !Object.values(f.votes).some((v) => v !== "")}>{t("track.saveOfficial")}</Button>
        </form>
      )}
    </Card>
  );
}

export default function TrackPage() {
  return <Suspense><TrackInner /></Suspense>;
}
