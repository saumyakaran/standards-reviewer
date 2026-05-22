import { describe, it, expect } from "vitest";
import { consolidateFindings } from "./consolidator.js";
import type { Finding } from "./domain/types.js";

const tier1: Finding = {
  tier: 1,
  file: "src/auth/login.ts",
  line: 3,
  standard: "ci/test-failure",
  message: "Unit test 'mints a token' failed.",
  confidence: "HIGH",
};

const tier2: Finding = {
  tier: 2,
  file: "src/auth/login.ts",
  line: 12,
  standard: "naming/camelCase",
  message: "Use camelCase for local variables.",
  confidence: "PARTIAL",
};

describe("consolidateFindings", () => {
  it("collects Tier-1 and Tier-2 findings into one report", () => {
    const report = consolidateFindings({
      tier1: [tier1],
      tier2: [tier2],
      ciStatusAvailable: true,
      chunkParseOk: true,
    });

    expect(report.tier1).toEqual([tier1]);
    expect(report.tier2).toEqual([tier2]);
  });

  it("deduplicates findings sharing the same file, line and standard", () => {
    const duplicate: Finding = { ...tier2, message: "Same violation, different phrasing." };

    const report = consolidateFindings({
      tier1: [],
      tier2: [tier2, duplicate],
      ciStatusAvailable: true,
      chunkParseOk: true,
    });

    expect(report.tier2).toEqual([tier2]);
  });

  it("orders findings within a tier by file then line", () => {
    const base = { tier: 2, standard: "naming/camelCase", message: "m", confidence: "LOW" } as const;
    const aLate: Finding = { ...base, file: "src/auth/login.ts", line: 30 };
    const aEarly: Finding = { ...base, file: "src/auth/login.ts", line: 5 };
    const bFile: Finding = { ...base, file: "src/billing/invoice.ts", line: 1 };

    const report = consolidateFindings({
      tier1: [],
      tier2: [bFile, aLate, aEarly],
      ciStatusAvailable: true,
      chunkParseOk: true,
    });

    expect(report.tier2).toEqual([aEarly, aLate, bFile]);
  });

  it.each([
    { ci: true, parse: true, expected: "HIGH" },
    { ci: true, parse: false, expected: "PARTIAL" },
    { ci: false, parse: true, expected: "PARTIAL" },
    { ci: false, parse: false, expected: "LOW" },
  ])(
    "derives $expected confidence when ciStatusAvailable=$ci and chunkParseOk=$parse",
    ({ ci, parse, expected }) => {
      const report = consolidateFindings({
        tier1: [],
        tier2: [],
        ciStatusAvailable: ci,
        chunkParseOk: parse,
      });

      expect(report.confidence).toBe(expected);
    },
  );
});
