import { describe, expect, it } from "vitest";
import { parseEc8aText } from "@/features/verify/parseEc8a";
import { makeReference } from "@/lib/reference";

describe("EC8A OCR text parsing", () => {
  it("extracts labelled figures and party rows", () => {
    const text = `FORM EC8A
1. Number of Voters on the Register 812
2. Number of Accredited Voters 410
4. Number of Unused Ballot Papers 386
5. Number of Spoiled Ballot Papers 4
6. Number of Rejected Ballots 6
7. Total Number of Valid Votes 404
8. Total Number of Used Ballot Papers 414
1 AAA 200 two hundred
2 BBB 150
3 CCC 54`;
    const r = parseEc8aText(text);
    expect(r.figures).toMatchObject({ registered_voters: 812, accredited_voters: 410, unused_ballots: 386, spoiled_ballots: 4, rejected_votes: 6, total_valid_votes: 404, total_used_ballots: 414 });
    expect(r.parties).toEqual([{ party: "AAA", votes: 200 }, { party: "BBB", votes: 150 }, { party: "CCC", votes: 54 }]);
  });
});

describe("reference numbers match the server", () => {
  it("derives the same reference as server/services/references.py", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(await makeReference("evidence", id, "2026-11-18T23:59:00Z")).toBe("AWV-EV-20261118-K7NN3P");
    expect(await makeReference("result", id, "2026-11-18T23:59:00Z")).toBe("AWV-RS-20261118-K7NN3P");
  });
});
