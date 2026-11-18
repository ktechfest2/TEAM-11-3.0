"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/hooks/useApp";
import { Notice, Select } from "@/components/ui";
import { ELECTION_IDS, HAS_CONSTITUENCY, constituenciesFor, statesFor } from "@/lib/elections";

/**
 * Election → state → constituency picker driven by INEC's 2027 lists.
 * value: { election, state, constituency }; onChange(nextValue)
 */
export default function ContestPicker({ value, onChange }) {
  const { t } = useApp();
  const [states, setStates] = useState([]);
  const [constituencies, setConstituencies] = useState([]);
  const [error, setError] = useState(null);
  const { election, state, constituency } = value;

  useEffect(() => {
    let live = true;
    statesFor(election).then((s) => live && setStates(s)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [election]);

  useEffect(() => {
    let live = true;
    if (HAS_CONSTITUENCY.has(election) && state) {
      constituenciesFor(election, state).then((c) => live && setConstituencies(c)).catch((e) => live && setError(e.message));
    } else setConstituencies([]);
    return () => { live = false; };
  }, [election, state]);

  return (
    <div className="flex flex-col gap-4">
      <Select label={t("verify.electionType")} value={election}
        onChange={(v) => onChange({ election: v, state: v === "presidential" ? "" : "", constituency: "" })}
        options={ELECTION_IDS.map((e) => ({ value: e, label: t(`election.${e}`) }))} />
      {election !== "presidential" && (
        <Select label={t("elections.state")} value={state} onChange={(v) => onChange({ ...value, state: v, constituency: "" })}
          options={[{ value: "", label: t("elections.chooseState") }, ...states.map((s) => ({ value: s.slug, label: s.name }))]} />
      )}
      {election === "governorship" && <p className="-mt-2 text-sm text-muted">{t("elections.offCycleNote")}</p>}
      {HAS_CONSTITUENCY.has(election) && state && (
        <Select label={t(`elections.constituency.${election}`)} value={constituency} onChange={(v) => onChange({ ...value, constituency: v })}
          options={[{ value: "", label: t("elections.chooseConstituency") }, ...constituencies.map((c) => ({ value: c, label: c }))]} />
      )}
      {error && <Notice tone="warn">{t("elections.dataUnavailable")}</Notice>}
    </div>
  );
}

export function contestComplete({ election, state, constituency }) {
  if (election === "presidential") return true;
  if (!state) return false;
  return !HAS_CONSTITUENCY.has(election) || !!constituency;
}
