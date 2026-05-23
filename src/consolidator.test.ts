import { describe, it, expect } from "vitest";
import { consolidateFindings } from "./consolidator.js";
import type { CiFinding, ConventionFinding } from "./domain/types.js";

const tier1: CiFinding = {
  check: "unit-tests",
  conclusion: "failure",
  detailsUrl: "https://github.com/example/repo/actions/runs/1",
};

const tier2: ConventionFinding = {
  file: "src/auth/login.ts",
  line: 12,
  standard: "naming/camelCase",
  message: "Use camelCase for local variables.",
  confidence: "PARTIAL",
};

describe("consolidateFindings", () => {
  it("collects Tier-1 and Tier-2 findings into one report", () => {
    const report = consolidateFindings({
      mode: "pr",
      tier1: [tier1],
      tier2: [tier2],
      ciStatusAvailable: true,
      chunkParseOk: true,
    });

    expect(report.tier1).toEqual([tier1]);
    expect(report.tier2).toEqual([tier2]);
  });

  it("deduplicates Tier-1 findings sharing the same check name", () => {
    const a: CiFinding = { check: "unit-tests", conclusion: "failure" };
    const b: CiFinding = {
      check: "unit-tests",
      conclusion: "failure",
      detailsUrl: "https://github.com/example/repo/actions/runs/2",
    };

    const report = consolidateFindings({
      mode: "pr",
      tier1: [a, b],
      tier2: [],
      ciStatusAvailable: true,
      chunkParseOk: true,
    });

    expect(report.tier1).toEqual([a]);
  });

  it("orders Tier-1 findings by check name", () => {
    const buildCheck: CiFinding = { check: "build", conclusion: "failure" };
    const lintCheck: CiFinding = { check: "lint", conclusion: "failure" };
    const unitCheck: CiFinding = { check: "unit-tests", conclusion: "failure" };

    const report = consolidateFindings({
      mode: "pr",
      tier1: [unitCheck, buildCheck, lintCheck],
      tier2: [],
      ciStatusAvailable: true,
      chunkParseOk: true,
    });

    expect(report.tier1).toEqual([buildCheck, lintCheck, unitCheck]);
  });

  it("deduplicates convention findings sharing the same file, line and standard", () => {
    const duplicate: ConventionFinding = { ...tier2, message: "Same violation, different phrasing." };

    const report = consolidateFindings({
      mode: "pr",
      tier1: [],
      tier2: [tier2, duplicate],
      ciStatusAvailable: true,
      chunkParseOk: true,
    });

    expect(report.tier2).toEqual([tier2]);
  });

  it("orders convention findings within Tier 2 by file then line", () => {
    const base = { standard: "naming/camelCase", message: "m", confidence: "LOW" } as const;
    const aLate: ConventionFinding = { ...base, file: "src/auth/login.ts", line: 30 };
    const aEarly: ConventionFinding = { ...base, file: "src/auth/login.ts", line: 5 };
    const bFile: ConventionFinding = { ...base, file: "src/billing/invoice.ts", line: 1 };

    const report = consolidateFindings({
      mode: "pr",
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
    "derives $expected confidence in PR mode when ciStatusAvailable=$ci and chunkParseOk=$parse",
    ({ ci, parse, expected }) => {
      const report = consolidateFindings({
        mode: "pr",
        tier1: [],
        tier2: [],
        ciStatusAvailable: ci,
        chunkParseOk: parse,
      });

      expect(report.confidence).toBe(expected);
    },
  );

  it.each([
    { ci: false, parse: true, expected: "HIGH" },
    { ci: false, parse: false, expected: "LOW" },
    { ci: true, parse: true, expected: "HIGH" }, // CI signal ignored in local mode
  ])(
    "in local mode ignores the CI signal: ciStatusAvailable=$ci, chunkParseOk=$parse => $expected",
    ({ ci, parse, expected }) => {
      const report = consolidateFindings({
        mode: "local",
        tier1: [],
        tier2: [],
        ciStatusAvailable: ci,
        chunkParseOk: parse,
      });

      expect(report.confidence).toBe(expected);
    },
  );

  it("stamps the report with the review mode", () => {
    const local = consolidateFindings({
      mode: "local",
      tier1: [],
      tier2: [],
      ciStatusAvailable: false,
      chunkParseOk: true,
    });
    const pr = consolidateFindings({
      mode: "pr",
      tier1: [],
      tier2: [],
      ciStatusAvailable: true,
      chunkParseOk: true,
    });

    expect(local.mode).toBe("local");
    expect(pr.mode).toBe("pr");
  });
});
