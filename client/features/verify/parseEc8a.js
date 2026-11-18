/**
 * Heuristic extraction of EC8A figures from OCR text. Output is only ever a SUGGESTION that
 * the user must check against the sheet. Handwritten digits are frequently misread.
 */
const FIELD_PATTERNS = [
  ["registered_voters", /regist/i],
  ["accredited_voters", /accredit/i],
  ["ballots_issued", /issued/i],
  ["unused_ballots", /unused/i],
  ["spoiled_ballots", /spoil/i],
  ["rejected_votes", /reject/i],
  ["total_valid_votes", /valid\s*votes?/i],
  ["total_used_ballots", /(^|[^n])used\s*ballot/i],
  ["total_votes_cast", /votes?\s*cast/i],
];

const NOT_PARTIES = new Set(["EC", "INEC", "PU", "LGA", "RA", "NO", "TOTAL", "FORM", "STATE", "WARD", "CODE", "VOTES", "THE", "OF", "AND"]);

function firstCount(s) {
  const m = s.replace(/^\s*\(?\d{1,2}[.)]\s+/, "").match(/(?:^|[^\d])(\d{1,5})(?!\d)/);
  return m ? Number(m[1]) : null;
}

export function parseEc8aText(text) {
  const figures = {};
  const parties = [];
  const seenParties = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let matchedField = false;
    for (const [field, re] of FIELD_PATTERNS) {
      if (figures[field] !== undefined || !re.test(line)) continue;
      if (field === "total_valid_votes" && /invalid/i.test(line)) continue;
      const after = line.slice(line.search(re));
      const n = firstCount(after);
      if (n !== null) { figures[field] = n; matchedField = true; break; }
    }
    if (matchedField) continue;
    const pm = line.match(/^\s*(?:\d{1,2}[.)]?\s+)?([A-Z]{2,6})\b[^0-9]*?(\d{1,5})(?!\d)/);
    if (pm && !NOT_PARTIES.has(pm[1]) && !seenParties.has(pm[1])) {
      seenParties.add(pm[1]);
      parties.push({ party: pm[1], votes: Number(pm[2]) });
    }
  }
  return { figures, parties, filledCount: Object.keys(figures).length + parties.length };
}
