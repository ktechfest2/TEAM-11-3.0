"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Card, Notice, Pill, TextInput } from "@/components/ui";
import ContestPicker, { contestComplete } from "@/components/elections/ContestPicker";
import { ballotFor, displayName, getReference } from "@/lib/elections";
import { normalize } from "@/lib/nano/intent/featurizer";

/**
 * Official candidates for every 2027 contest, exactly as published in INEC's final lists.
 * Entries appear in INEC's order (alphabetical by party acronym), never ranked or recommended.
 */
export default function CandidatesPage() {
  const { t } = useApp();
  const [contest, setContest] = useState({ election: "presidential", state: "", constituency: "" });
  const [ballot, setBallot] = useState(undefined);
  const [partyNames, setPartyNames] = useState({});
  const [q, setQ] = useState("");

  useEffect(() => {
    getReference().then((r) => setPartyNames(Object.fromEntries(r.parties.registered.map((p) => [p.acronym, p.name])))).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    setBallot(undefined);
    if (contestComplete(contest)) ballotFor(contest.election, contest.state, contest.constituency).then((b) => live && setBallot(b)).catch(() => live && setBallot(null));
    return () => { live = false; };
  }, [contest]);

  const entries = useMemo(() => {
    const nq = normalize(q);
    return (ballot?.entries || []).filter((e) => !nq || normalize(`${e.party} ${partyNames[e.party] || ""} ${e.candidate?.name || ""} ${e.running_mate?.name || ""}`).includes(nq));
  }, [ballot, q, partyNames]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("candidates.title")} subtitle={t("candidates.subtitle")} />
      <Card><ContestPicker value={contest} onChange={setContest} /></Card>
      <Notice tone="info">{t("candidates.neutral")}</Notice>

      {contestComplete(contest) && ballot === undefined && <p role="status">{t("common.loading")}</p>}
      {ballot === null && <Notice tone="warn">{t("elections.dataUnavailable")}</Notice>}
      {ballot && (
        <>
          <TextInput label={t("candidates.search")} type="search" value={q} onChange={setQ} />
          <p className="text-sm text-muted">
            {t("candidates.count", { n: ballot.entries.length })} ·{" "}
            <a className="underline" href={ballot.source.url} target="_blank" rel="noreferrer">{t("elections.inecSource")}</a>
          </p>
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li key={`${e.party}-${e.sn}`}>
                <Card as="article">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="info">{e.party}</Pill>
                    <span className="text-sm text-muted">{partyNames[e.party]}</span>
                  </div>
                  {e.court_order ? (
                    <p className="mt-2 font-semibold">{t("elections.courtOrder")}</p>
                  ) : (
                    <>
                      <p className="mt-2 text-xl font-bold">{displayName(e.candidate?.name)}</p>
                      <p className="text-sm text-muted">
                        {e.candidate?.position}
                        {e.candidate?.age ? ` · ${t("candidates.age", { n: e.candidate.age })}` : ""}
                        {e.candidate?.gender ? ` · ${t(`candidates.gender.${e.candidate.gender}`)}` : ""}
                      </p>
                      {e.running_mate?.name && (
                        <p className="mt-1">
                          <span className="text-sm text-muted">{e.running_mate.position}: </span>
                          <span className="font-semibold">{displayName(e.running_mate.name)}</span>
                        </p>
                      )}
                      {e.candidate?.remarks && <p className="mt-1 text-sm text-warn">{t("candidates.inecRemark")}: {e.candidate.remarks}</p>}
                    </>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
