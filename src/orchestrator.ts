import type {
  CiFinding,
  ConsolidatedReport,
  ConventionFinding,
  Diff,
  DiffMetadata,
  PrCategory,
} from "./domain/types.js";
import { classifyPr } from "./classifier.js";
import { partitionDiff } from "./partitioner.js";
import { parseChunkReviewOutput } from "./chunk-reviewer/parser.js";
import { consolidateFindings } from "./consolidator.js";
import { renderReport, type RenderedReport } from "./renderer.js";
import { readCiStatus } from "./ci-status-reader.js";
import { publishComment } from "./comment-publisher.js";
import type { Adapter } from "./adapter.js";
import type { ChunkReviewer } from "./ports/chunk-reviewer.js";
import type { CommandRunner } from "./ports/command-runner.js";
import type { ReportWriter } from "./ports/report-writer.js";

/** Inputs to the orchestrator — every external collaborator is injected. */
export interface OrchestratorInput {
  diff: Diff;
  /** PR reference (number, URL or branch) — when present, CI is read and the report is published. */
  prRef?: string;
  /** Path for the markdown report in no-PR mode. A sibling `.json` file is also written. */
  outputPath?: string;
  adapter: Adapter;
  reviewer: ChunkReviewer;
  runner: CommandRunner;
  writer: ReportWriter;
}

export interface OrchestratorResult {
  category: PrCategory;
  report: ConsolidatedReport;
  rendered: RenderedReport;
}

/** Derive the classifier's metadata signal from raw diff content. */
function extractMetadata(diff: Diff): DiffMetadata {
  return {
    files: diff.files.map((file) => {
      let linesAdded = 0;
      let linesRemoved = 0;
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          if (line.startsWith("+")) linesAdded++;
          else if (line.startsWith("-")) linesRemoved++;
        }
      }
      return { path: file.path, linesAdded, linesRemoved };
    }),
  };
}

/**
 * Wire the modules into the minimal end-to-end review path.
 *
 * Reads CI for Tier 1, has the chunk reviewer judge each chunk for Tier 2,
 * consolidates and renders the report, then either publishes a single
 * idempotent PR comment or emits to stdout + a file when invoked locally.
 */
export async function reviewCoherentPr(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const { diff, prRef, outputPath, adapter, reviewer, runner, writer } = input;

  const metadata = extractMetadata(diff);
  const category = classifyPr(metadata, adapter.thresholds);

  // Tier 2 — only invoke the model when the PR is coherent.
  const tier2: ConventionFinding[] = [];
  let chunkParseOk = true;
  if (category === "coherent") {
    const standards = await adapter.loadStandards();
    for (const chunk of partitionDiff(diff)) {
      const raw = await reviewer.review(chunk, standards);
      const parsed = parseChunkReviewOutput(raw);
      tier2.push(...parsed.findings);
      if (!parsed.ok) chunkParseOk = false;
    }
  }

  // Tier 1 — from CI only when we have a PR; not available locally.
  let tier1: CiFinding[] = [];
  let ciStatusAvailable = false;
  if (prRef) {
    const ci = await readCiStatus(prRef, runner);
    tier1 = ci.findings;
    ciStatusAvailable = ci.available;
  }

  const report = consolidateFindings({
    mode: prRef ? "pr" : "local",
    tier1,
    tier2,
    ciStatusAvailable,
    chunkParseOk,
  });
  const rendered = renderReport(report);

  if (prRef) {
    await publishComment(prRef, rendered.markdown, runner);
  } else {
    writer.writeStdout(rendered.markdown);
    if (outputPath) {
      const jsonPath = outputPath.replace(/\.md$/, "") + ".json";
      await writer.writeFile(outputPath, rendered.markdown);
      await writer.writeFile(jsonPath, JSON.stringify(rendered.json, null, 2));
    }
  }

  return { category, report, rendered };
}
