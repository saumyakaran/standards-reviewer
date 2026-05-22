import { describe, it, expect } from "vitest";
import { renderReport } from "./renderer.js";
import type { ConsolidatedReport } from "./domain/types.js";

const report: ConsolidatedReport = {
  confidence: "HIGH",
  tier1: [
    {
      tier: 1,
      file: "src/auth/login.ts",
      line: 3,
      standard: "ci/test-failure",
      message: "Unit test 'mints a token' failed.",
      confidence: "HIGH",
    },
  ],
  tier2: [
    {
      tier: 2,
      file: "src/auth/login.ts",
      line: 12,
      standard: "naming/camelCase",
      message: "Use camelCase for local variables.",
      confidence: "PARTIAL",
    },
  ],
};

describe("renderReport", () => {
  it("renders the confidence header, then Tier 1, then Tier 2", () => {
    const { markdown } = renderReport(report);

    const confidenceIndex = markdown.indexOf("Confidence");
    const tier1Index = markdown.indexOf("Tier 1");
    const tier2Index = markdown.indexOf("Tier 2");

    expect(markdown).toContain("HIGH");
    expect(confidenceIndex).toBeGreaterThanOrEqual(0);
    expect(tier1Index).toBeGreaterThan(confidenceIndex);
    expect(tier2Index).toBeGreaterThan(tier1Index);
  });

  it("renders each Tier-2 finding citing file:line and the standard violated", () => {
    const { markdown } = renderReport(report);

    expect(markdown).toContain("src/auth/login.ts:12");
    expect(markdown).toContain("naming/camelCase");
    expect(markdown).toContain("Use camelCase for local variables.");
  });

  it("renders explicit 'no findings' sections for an empty report", () => {
    const empty: ConsolidatedReport = { confidence: "LOW", tier1: [], tier2: [] };

    const { markdown } = renderReport(empty);

    expect(markdown).toContain("LOW");
    expect(markdown).toContain("Tier 1");
    expect(markdown).toContain("Tier 2");
    expect(markdown.match(/_No findings\._/g) ?? []).toHaveLength(2);
  });

  it("emits a structured JSON equivalent alongside the markdown", () => {
    const { json } = renderReport(report);

    expect(json).toEqual(report);
  });

  it("matches the rendered markdown snapshot", () => {
    expect(renderReport(report).markdown).toMatchSnapshot();
  });
});
