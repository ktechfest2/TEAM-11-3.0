"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import PageHeader from "@/components/layout/PageHeader";
import { Button, Card, Notice, Pill, Stat, TextInput } from "@/components/ui";
import { apiFetch } from "@/services/api";
import { kvGet, kvSet } from "@/lib/db";
import { listEvidence, listIncidents, listResults } from "@/lib/records";
import { timeAgo } from "@/lib/time";

const STALE_MS = 60 * 60 * 1000;

function Bars({ data, label }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="text-muted">0</p>;
  return (
    <ul className="flex flex-col gap-2">
      {entries.map(([k, v]) => (
        <li key={k}>
          <div className="flex justify-between text-sm"><span>{label(k)}</span><span className="font-bold tabular-nums">{v}</span></div>
          <div className="h-3 rounded-full bg-surface-2" aria-hidden="true"><div className="h-3 rounded-full bg-brand" style={{ width: `${(v / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function toCsv(rows) {
  const cols = ["reference", "source", "polling_unit_code", "election_type", "total_valid_votes", "rejected_votes", "validation_status", "party_votes", "created_at"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export default function DashboardPage() {
  const { t, online, settings } = useApp();
  const [server, setServer] = useState(null); // { data, fetchedAt }
  const [checkedAt, setCheckedAt] = useState(0);
  const [error, setError] = useState(null);
  const [pu, setPu] = useState("");
  const [compare, setCompare] = useState(null);
  const local = useLiveQuery(async () => {
    const [e, i, r] = await Promise.all([listEvidence(), listIncidents(), listResults()]);
    const byCat = {}, byVal = {};
    i.forEach((x) => (byCat[x.category] = (byCat[x.category] || 0) + 1));
    r.forEach((x) => (byVal[x.validation.status] = (byVal[x.validation.status] || 0) + 1));
    return { evidence: e.length, incidents: i.length, results: r.length, byCat, byVal, pus: new Set(r.map((x) => x.pollingUnitCode)).size, rows: r };
  }, ["evidence", "incidents", "results"]);

  const load = useCallback(async () => {
    setCheckedAt(Date.now());
    const cached = await kvGet("dashboardCache");
    if (cached) setServer(cached);
    if (!navigator.onLine) return;
    try {
      const data = await apiFetch("/api/dashboard/summary", { timeoutMs: 10_000 });
      const fresh = { data, fetchedAt: new Date().toISOString() };
      setServer(fresh);
      setError(null);
      await kvSet("dashboardCache", fresh);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load, online]);

  async function runCompare(e) {
    e.preventDefault();
    try { setCompare(await apiFetch(`/api/results/compare/${encodeURIComponent(pu.trim())}`)); } catch (err) { setCompare({ error: err.message }); }
  }

  async function downloadCsv() {
    let rows = (local?.rows || []).map((r) => ({
      reference: r.reference, source: "independent_submission (this device)", polling_unit_code: r.pollingUnitCode, election_type: r.electionType,
      total_valid_votes: r.figures.total_valid_votes, rejected_votes: r.figures.rejected_votes, validation_status: r.validation.status,
      party_votes: r.partyVotes.map((p) => `${p.party}:${p.votes}`).join(" "), created_at: r.createdAt,
    }));
    if (navigator.onLine) {
      try {
        const remote = await apiFetch("/api/results?limit=200");
        const mine = new Set(rows.map((r) => r.reference));
        rows = rows.concat(remote.filter((r) => !mine.has(r.reference)).map((r) => ({
          ...r, validation_status: r.validation.status, party_votes: r.party_votes.map((p) => `${p.party}:${p.votes}`).join(" "),
        })));
      } catch { /* offline: local rows only */ }
    }
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `awavote-independent-submissions-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const d = server?.data;
  const stale = server && (checkedAt - new Date(server.fetchedAt).getTime() > STALE_MS || !online || error);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("dashboard.title")} />
      <Notice tone="warn" title={t("dashboard.independent")}>{t("verify.intro")}</Notice>

      <Card>
        <h2 className="text-lg font-bold">{t("dashboard.official")}</h2>
        <p className="mt-1 text-muted">{t("dashboard.officialNotConnected")}</p>
      </Card>

      {stale && <Notice tone="warn">{t("dashboard.stale", { when: timeAgo(server.fetchedAt, settings.language) })}</Notice>}
      {!d && <Notice tone="info">{t("dashboard.serverOnly")}</Notice>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t("dashboard.results")} value={d?.independent_results.total ?? local?.results ?? "–"} />
        <Stat label={t("dashboard.pollingUnits")} value={d?.independent_results.polling_units ?? local?.pus ?? "–"} />
        <Stat label={t("dashboard.evidence")} value={d?.evidence.total ?? local?.evidence ?? "–"} />
        <Stat label={t("dashboard.incidents")} value={d?.incidents.total ?? local?.incidents ?? "–"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-bold">{t("dashboard.byValidation")}</h2>
          <Bars data={d?.independent_results.by_validation ?? local?.byVal} label={(k) => t(`verify.status.${k}`)} />
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-bold">{t("dashboard.byCategory")}</h2>
          <Bars data={d?.incidents.by_category ?? local?.byCat} label={(k) => t(`report.cat.${k}`)} />
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-bold">{t("dashboard.compare")}</h2>
        <form onSubmit={runCompare} className="mt-2 flex items-end gap-2">
          <div className="flex-1"><TextInput label={t("verify.pollingUnit")} value={pu} onChange={setPu} maxLength={32} /></div>
          <Button type="submit" size="md" disabled={!pu.trim() || !online}>{t("voice.go")}</Button>
        </form>
        {compare?.error && <Notice tone="danger" className="mt-2">{compare.error}</Notice>}
        {compare && !compare.error && (
          <div className="mt-3 flex flex-col gap-2">
            <Pill tone={compare.status === "submissions_agree" ? "ok" : compare.status === "needs_review" ? "warn" : "muted"}>{compare.status.replace(/_/g, " ")} · {compare.independent_submissions}</Pill>
            <ul>{Object.entries(compare.parties).map(([p, v]) => <li key={p} className="tabular-nums">{p}: {v.join(" / ")}{compare.disagreements[p] && " ⚠"}</li>)}</ul>
            <p className="text-sm text-muted">{compare.official_result_note}</p>
          </div>
        )}
      </Card>

      <Button variant="secondary" icon="download" onClick={downloadCsv}>{t("dashboard.download")}</Button>
    </div>
  );
}
