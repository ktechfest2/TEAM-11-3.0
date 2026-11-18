"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/useApp";
import PageHeader from "@/components/layout/PageHeader";
import { Card, Notice, Pill, TextInput } from "@/components/ui";
import ContestPicker, { contestComplete } from "@/components/elections/ContestPicker";
import { ballotFor, displayName, getCandidatePhotos, getReference, partyLogo } from "@/lib/elections";
import { normalize } from "@/lib/nano/intent/featurizer";

const initials = (name) => (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("");

/** Candidate face (bundled, offline), or their initials when no verified photo exists. */
function Face({ name, photo, size }) {
  const cls = `shrink-0 rounded-full ${size === "sm" ? "h-9 w-9 text-xs" : "h-16 w-16 text-lg"}`;
  if (photo) return <img src={`/media/candidates/${photo.file}`} alt="" loading="lazy" decoding="async" className={`${cls} bg-surface-2 object-cover ring-2 ring-line`} />;
  return <span aria-hidden="true" className={`${cls} grid place-items-center bg-surface-2 font-display font-bold text-muted`}>{initials(name)}</span>;
}

/** Official party logo from INEC (bundled, offline). */
function PartyLogo({ acronym }) {
  return <img src={partyLogo(acronym)} alt="" width={40} height={40} loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-line" />;
}

/** Licence-required credit for Wikimedia Commons photos. */
function PhotoCredits({ t, photos }) {
  if (!photos.length) return null;
  return (
    <p className="mt-2 text-xs text-muted">
      {t("candidates.photoCredit")}{" "}
      {photos.map((p, i) => (
        <span key={p.file}>{i > 0 && "; "}<a className="underline" href={p.source} target="_blank" rel="noreferrer">{p.credit}</a> ({p.license})</span>
      ))}
    </p>
  );
}

/**
 * Official candidates for every 2027 contest, exactly as published in INEC's final lists.
 * Entries appear in INEC's order (alphabetical by party acronym), never ranked or recommended.
 */
export default function CandidatesPage() {
  const { t } = useApp();
  const [contest, setContest] = useState({ election: "presidential", state: "", constituency: "" });
  const [ballot, setBallot] = useState(undefined);
  const [partyNames, setPartyNames] = useState({});
  const [photos, setPhotos] = useState({});
  const [q, setQ] = useState("");

  useEffect(() => {
    getReference().then((r) => setPartyNames(Object.fromEntries(r.parties.registered.map((p) => [p.acronym, p.name])))).catch(() => {});
    getCandidatePhotos().then(setPhotos);
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

      {contestComplete(contest) && ballot === undefined && (
        <div role="status" aria-label={t("common.loading")} className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}
        </div>
      )}
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
                <Card as="article" className="lift">
                  <div className="flex items-center gap-3">
                    <PartyLogo acronym={e.party} />
                    <div className="min-w-0">
                      <Pill tone="info">{e.party}</Pill>
                      <p className="text-sm text-muted">{partyNames[e.party]}</p>
                    </div>
                  </div>
                  {e.court_order ? (
                    <p className="mt-2 font-semibold">{t("elections.courtOrder")}</p>
                  ) : (
                    <>
                      <div className="mt-3 flex items-center gap-3">
                        <Face name={e.candidate?.name} photo={photos[e.candidate?.name]} />
                        <div className="min-w-0">
                          <p className="font-display text-xl font-bold leading-tight">{displayName(e.candidate?.name)}</p>
                          <p className="text-sm text-muted">
                            {e.candidate?.position}
                            {e.candidate?.age ? ` · ${t("candidates.age", { n: e.candidate.age })}` : ""}
                            {e.candidate?.gender ? ` · ${t(`candidates.gender.${e.candidate.gender}`)}` : ""}
                          </p>
                        </div>
                      </div>
                      {e.running_mate?.name && (
                        <div className="mt-2 flex items-center gap-2">
                          <Face name={e.running_mate.name} photo={photos[e.running_mate.name]} size="sm" />
                          <p>
                            <span className="text-sm text-muted">{e.running_mate.position}: </span>
                            <span className="font-semibold">{displayName(e.running_mate.name)}</span>
                          </p>
                        </div>
                      )}
                      <PhotoCredits t={t} photos={[photos[e.candidate?.name], photos[e.running_mate?.name]].filter(Boolean)} />
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
