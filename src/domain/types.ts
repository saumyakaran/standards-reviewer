/**
 * Domain types for the standards-reviewer harness.
 *
 * Vocabulary follows issue #1: a *coherent* PR flows through the modules as
 * a Diff -> DiffChunk[] -> ConventionFinding[] -> ConsolidatedReport. The
 * reviewer only ever flags; it never modifies code and never blocks a merge.
 *
 * Tier 1 (CI) and Tier 2 (convention band) are distinct kinds of findings —
 * they're surfaced through different channels, carry different evidence, and
 * cite different things in the rendered report — so they have distinct types.
 */

/** Overall report confidence, and per-convention-finding confidence. */
export type Confidence = "HIGH" | "PARTIAL" | "LOW";

/**
 * Where the review came from. In `local` mode there is no PR, so CI is not
 * applicable — the report makes that explicit and confidence is derived from
 * the chunk-reviewer signal alone.
 */
export type ReviewMode = "local" | "pr";

// --- Diff metadata (PR classifier input) ---------------------------------

/** Per-file change counts — the intrinsic signal the classifier reads. */
export interface FileChange {
  path: string;
  linesAdded: number;
  linesRemoved: number;
}

/** Intrinsic diff signals: size, files, modules and coupling all derive from this. */
export interface DiffMetadata {
  files: FileChange[];
}

/** A PR category. For the first slice the classifier only distinguishes `coherent`. */
export type PrCategory = "coherent" | "non-coherent";

/** Classifier tuning knobs — supplied by a consuming project's adapter. */
export interface ClassifierThresholds {
  /** Max number of files a coherent PR may touch. */
  maxFiles: number;
  /** Max total lines (added + removed) a coherent PR may change. */
  maxLinesChanged: number;
  /** Max number of distinct top-level modules a coherent PR may span. */
  maxModules: number;
}

// --- Diff content (diff partitioner input) -------------------------------

export interface DiffHunk {
  /** The hunk header, e.g. "@@ -1,4 +1,6 @@". */
  header: string;
  /** Raw hunk lines, including the leading +/-/space marker. */
  lines: string[];
}

export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
}

/** A full PR diff. */
export interface Diff {
  files: DiffFile[];
}

/** A unit of diff handed to the chunk reviewer. A coherent diff yields one chunk. */
export interface DiffChunk {
  files: DiffFile[];
}

// --- Findings ------------------------------------------------------------

/**
 * Tier-1 finding: a failed CI check. Read from `gh pr checks`; carries
 * check-run level evidence (name, conclusion, link), not a file:line.
 */
export interface CiFinding {
  /** The check run's name, e.g. "build", "unit-tests". */
  check: string;
  /** The check's conclusion, e.g. "failure", "cancelled", "timed_out". */
  conclusion: string;
  /** Link to the check details, when available. */
  detailsUrl?: string;
}

/**
 * Tier-2 finding: a convention-band violation surfaced by the chunk reviewer.
 * Cites the location and the standard or ADR violated.
 */
export interface ConventionFinding {
  file: string;
  line: number;
  /** Identifier of the coding standard or ADR the change violates. */
  standard: string;
  /** Human-readable explanation of the violation. */
  message: string;
  confidence: Confidence;
}

/** Deduplicated, ordered findings plus the overall confidence header. */
export interface ConsolidatedReport {
  mode: ReviewMode;
  confidence: Confidence;
  tier1: CiFinding[];
  tier2: ConventionFinding[];
}
