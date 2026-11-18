import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateResult } from "@/lib/validation/ec8a";

const { cases } = JSON.parse(readFileSync(new URL("../../tests/fixtures/ec8a_validation_cases.json", import.meta.url)));

describe("EC8A validation (shared fixture with the server)", () => {
  for (const c of cases) {
    it(c.name, () => {
      const out = validateResult(c.input);
      expect(out.status).toBe(c.expected_status);
      expect(out.checks.filter((x) => x.status === "fail").map((x) => x.id).sort()).toEqual([...c.expected_failures].sort());
    });
  }
  it("never labels anything as fraud", () => {
    expect(JSON.stringify(validateResult({ total_valid_votes: 1, party_votes: [{ party: "A", votes: 9 }] })).toLowerCase()).not.toContain("fraud");
  });
});
