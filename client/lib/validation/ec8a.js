/**
 * EC8A arithmetic checks — mirror of server/services/validation.py.
 * Both are tested against tests/fixtures/ec8a_validation_cases.json.
 * A failed check means "needs human review", never "fraud".
 */
export const NUMERIC_FIELDS = [
  "registered_voters", "accredited_voters", "ballots_issued", "unused_ballots", "spoiled_ballots",
  "rejected_votes", "total_valid_votes", "total_used_ballots", "total_votes_cast",
];

const have = (...v) => v.every((x) => x !== null && x !== undefined);
const check = (id, ok, expected = null, actual = null) => ({
  id, status: ok === null ? "skipped" : ok ? "pass" : "fail", expected, actual,
});
const isCount = (v) => Number.isInteger(v) && v >= 0;

export function validateResult(data) {
  const g = Object.fromEntries(NUMERIC_FIELDS.map((f) => [f, data[f] ?? null]));
  const parties = data.party_votes || [];
  const pv = parties.map((p) => p.votes);
  const checks = [];

  const all = [...Object.values(g).filter((v) => v !== null), ...pv.filter((v) => v !== null && v !== undefined)];
  const bad = all.filter((v) => !isCount(v));
  checks.push(check("non_negative_integers", bad.length === 0, null, bad.length ? bad : null));

  const valid = g.total_valid_votes, rejected = g.rejected_votes, spoiled = g.spoiled_ballots;

  if (parties.length && pv.every(Number.isInteger) && valid !== null) {
    const s = pv.reduce((a, b) => a + b, 0);
    checks.push(check("party_sum_equals_valid", s === valid, valid, s));
  } else checks.push(check("party_sum_equals_valid", null));

  if (have(valid, rejected, g.total_votes_cast))
    checks.push(check("valid_plus_rejected_equals_cast", valid + rejected === g.total_votes_cast, g.total_votes_cast, valid + rejected));
  else checks.push(check("valid_plus_rejected_equals_cast", null));

  if (have(valid, rejected, spoiled, g.total_used_ballots)) {
    const used = valid + rejected + spoiled;
    checks.push(check("used_ballots_breakdown", used === g.total_used_ballots, g.total_used_ballots, used));
  } else checks.push(check("used_ballots_breakdown", null));

  if (have(g.ballots_issued, g.unused_ballots, g.total_used_ballots)) {
    const t = g.total_used_ballots + g.unused_ballots;
    checks.push(check("issued_equals_used_plus_unused", t === g.ballots_issued, g.ballots_issued, t));
  } else checks.push(check("issued_equals_used_plus_unused", null));

  if (have(g.accredited_voters, g.registered_voters))
    checks.push(check("accredited_within_register", g.accredited_voters <= g.registered_voters, g.registered_voters, g.accredited_voters));
  else checks.push(check("accredited_within_register", null));

  if (have(valid, rejected, g.accredited_voters))
    checks.push(check("votes_cast_within_accredited", valid + rejected <= g.accredited_voters, g.accredited_voters, valid + rejected));
  else checks.push(check("votes_cast_within_accredited", null));

  let status = "consistent";
  if (checks.some((c) => c.status === "fail")) status = "needs_review";
  else if (checks.find((c) => c.id === "party_sum_equals_valid").status === "skipped") status = "incomplete";
  return { status, checks };
}
