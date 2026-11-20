"use client";
import { useApp } from "@/hooks/useApp";
import { Notice, Pill } from "@/components/ui";

/**
 * One polling unit, from the wall to the announcement:
 * - how many independent photos of the EC8A sheet ("the wall") were sent and whether they agree;
 * - per party, what the wall says (the figure most photos agree on) vs the officially announced
 *   result (IReV / collation), with the difference.
 * `compare` = GET /api/results/compare/{pu}.
 */
export default function WallVsAnnounced({ compare }) {
  const { t } = useApp();
  if (!compare) return null;
  const off = compare.official;
  const wallTone = compare.status === "submissions_agree" ? "ok" : compare.status === "needs_review" ? "warn" : "muted";
  const parties = off ? Object.entries(off.parties)
    : Object.entries(compare.parties).map(([p, v]) => [p, { wall: v.length === 1 ? v[0] : null, all: v }]);

  return (
    <div className="flex flex-col gap-3" data-compare-status={off?.status || compare.status}>
      <div className="flex flex-wrap gap-2">
        <Pill tone={wallTone}>{t(`track.wall.${compare.status}`, { n: compare.independent_submissions })}</Pill>
        {off && <Pill tone={off.status === "matches" ? "ok" : "danger"} icon={off.status === "matches" ? "check" : "alert"}>{t(`track.official.${off.status}`)}</Pill>}
      </div>

      {compare.independent_submissions === 0 && !off ? (
        <p className="text-muted">{t("track.nothingYet")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left tabular-nums">
            <thead className="bg-surface-2 text-sm">
              <tr><th className="px-3 py-2">{t("verify.party")}</th><th className="px-3 py-2 text-right">{t("track.colWall")}</th>
                {off && <><th className="px-3 py-2 text-right">{t("track.colAnnounced")}</th><th className="px-3 py-2 text-right">{t("track.colDiff")}</th></>}</tr>
            </thead>
            <tbody>
              {parties.map(([p, r]) => {
                const bad = off && r.official != null && r.wall != null && !r.match;
                return (
                  <tr key={p} className={`border-t border-line ${bad ? "bg-danger-soft font-bold" : ""}`}>
                    <td className="px-3 py-2 font-display font-bold">{p}</td>
                    <td className="px-3 py-2 text-right">{r.wall ?? (r.all ? r.all.join(" / ") + " ⚠" : "—")}</td>
                    {off && <>
                      <td className="px-3 py-2 text-right">{r.official ?? "—"}</td>
                      <td className={`px-3 py-2 text-right ${bad ? "text-danger" : "text-muted"}`}>{r.difference ? (r.difference > 0 ? `+${r.difference}` : r.difference) : r.match ? "✓" : "—"}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {off ? (
        <p className="text-sm text-muted">
          {t(`track.source.${off.source}`)} · {t("track.enteredBy", { who: off.entered_by })} · {off.reference}
          {off.source_url && <> · <a className="underline" href={off.source_url} target="_blank" rel="noreferrer">{t("track.openSource")}</a></>}
        </p>
      ) : compare.independent_submissions > 0 && <Notice tone="info">{t("track.noOfficial")}</Notice>}
      {off?.status === "differs" && <Notice tone="warn">{t("track.differsNote")}</Notice>}
    </div>
  );
}
