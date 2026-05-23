import type {
  CiFinding,
  Confidence,
  ConsolidatedReport,
  ConventionFinding,
  ReviewMode,
} from "./domain/types.js";

/** Inputs to consolidation: findings from both tiers, plus degradation signals. */
export interface ConsolidateInput {
  /** Whether this review is for a PR (CI applies) or a local diff (no CI). */
  mode: ReviewMode;
  /** Blocking mechanical defects read from CI. Empty in `local` mode. */
  tier1: CiFinding[];
  /** Convention-band findings from the chunk reviewer. */
  tier2: ConventionFinding[];
  /** False if CI status could not be read. Ignored when `mode === 'local'`. */
  ciStatusAvailable: boolean;
  /** False if any chunk's model output failed to parse cleanly. */
  chunkParseOk: boolean;
}

/** Drop items that repeat an earlier item's key. Keeps the first occurrence. */
function deduplicate<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/** Order convention findings by file, then by line within a file. */
function byFileThenLine(a: ConventionFinding, b: ConventionFinding): number {
  return a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file);
}

/** Deduplicate then order one tier's convention findings. */
function normalizeTier2(findings: ConventionFinding[]): ConventionFinding[] {
  return deduplicate(findings, (f) => `${f.file} ${f.line} ${f.standard}`).sort(byFileThenLine);
}

/** Deduplicate then order one tier's CI findings by check name. */
function normalizeTier1(findings: CiFinding[]): CiFinding[] {
  return deduplicate(findings, (f) => f.check).sort((a, b) => a.check.localeCompare(b.check));
}

/**
 * Derive the report's confidence header.
 *
 * In `pr` mode there are two degradation signals: CI was readable and every
 * chunk parsed cleanly. Both intact => HIGH; one missing => PARTIAL; both
 * missing => LOW.
 *
 * In `local` mode CI is not applicable, so confidence rests on the chunk
 * signal alone: parsed => HIGH, failed => LOW.
 */
function deriveConfidence(
  mode: ReviewMode,
  ciStatusAvailable: boolean,
  chunkParseOk: boolean,
): Confidence {
  if (mode === "local") return chunkParseOk ? "HIGH" : "LOW";
  const intactSignals = Number(ciStatusAvailable) + Number(chunkParseOk);
  if (intactSignals === 2) return "HIGH";
  if (intactSignals === 1) return "PARTIAL";
  return "LOW";
}

/**
 * Consolidate per-tier findings into a single report: deduplicated, ordered,
 * and stamped with the review mode and an overall confidence header.
 */
export function consolidateFindings(input: ConsolidateInput): ConsolidatedReport {
  return {
    mode: input.mode,
    confidence: deriveConfidence(input.mode, input.ciStatusAvailable, input.chunkParseOk),
    tier1: normalizeTier1(input.tier1),
    tier2: normalizeTier2(input.tier2),
  };
}
