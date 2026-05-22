import type { ConsolidatedReport, Finding } from "./domain/types.js";

/** A rendered report in both human (markdown) and machine (JSON) forms. */
export interface RenderedReport {
  markdown: string;
  /** The structured equivalent of the markdown — emitted alongside it. */
  json: ConsolidatedReport;
}

/** Render one finding as a bullet citing `file:line`, the message and the standard. */
function renderFinding(finding: Finding): string {
  return `- \`${finding.file}:${finding.line}\` — ${finding.message} _(${finding.standard})_`;
}

/** Render a tier as a heading followed by its findings, or an explicit empty note. */
function renderSection(heading: string, findings: Finding[]): string[] {
  const body = findings.length > 0 ? findings.map(renderFinding) : ["_No findings._"];
  return [heading, "", ...body];
}

/**
 * Render a consolidated report as a markdown document and an equivalent
 * structured JSON object: a confidence header, then Tier 1, then Tier 2.
 */
export function renderReport(report: ConsolidatedReport): RenderedReport {
  const markdown = [
    "# Standards Review",
    "",
    `**Confidence:** ${report.confidence}`,
    "",
    ...renderSection("## Tier 1 — Blocking mechanical defects (CI)", report.tier1),
    "",
    ...renderSection("## Tier 2 — Convention band", report.tier2),
  ].join("\n");

  return { markdown, json: report };
}
