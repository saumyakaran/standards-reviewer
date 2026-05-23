import type { CiFinding, ConsolidatedReport, ConventionFinding } from "./domain/types.js";

/** A rendered report in both human (markdown) and machine (JSON) forms. */
export interface RenderedReport {
  markdown: string;
  /** The structured equivalent of the markdown — emitted alongside it. */
  json: ConsolidatedReport;
}

/** Render a Tier-1 CI finding citing the check name, its conclusion, and a link if present. */
function renderCiFinding(finding: CiFinding): string {
  const link = finding.detailsUrl ? ` ([details](${finding.detailsUrl}))` : "";
  return `- **${finding.check}** — ${finding.conclusion}${link}`;
}

/** Render a Tier-2 convention finding citing `file:line`, the message and the standard. */
function renderConventionFinding(finding: ConventionFinding): string {
  return `- \`${finding.file}:${finding.line}\` — ${finding.message} _(${finding.standard})_`;
}

/** Render a tier as a heading followed by its findings, or an explicit empty note. */
function renderSection<T>(
  heading: string,
  findings: T[],
  render: (f: T) => string,
  emptyMarker = "_No findings._",
): string[] {
  const body = findings.length > 0 ? findings.map(render) : [emptyMarker];
  return [heading, "", ...body];
}

/**
 * Render a consolidated report as a markdown document and an equivalent
 * structured JSON object: a confidence header, then Tier 1, then Tier 2.
 *
 * In `local` mode CI does not apply; Tier 1 is rendered with an explicit
 * "Not applicable — local mode" note so a reader can tell the absence of
 * findings from the absence of a check.
 */
export function renderReport(report: ConsolidatedReport): RenderedReport {
  const tier1EmptyMarker =
    report.mode === "local" ? "_Not applicable — local mode._" : "_No findings._";

  const markdown = [
    "# Standards Review",
    "",
    `**Confidence:** ${report.confidence}`,
    "",
    ...renderSection(
      "## Tier 1 — Blocking mechanical defects (CI)",
      report.tier1,
      renderCiFinding,
      tier1EmptyMarker,
    ),
    "",
    ...renderSection("## Tier 2 — Convention band", report.tier2, renderConventionFinding),
  ].join("\n");

  return { markdown, json: report };
}
