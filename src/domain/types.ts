/**
 * Domain types for the standards-reviewer harness.
 *
 * Vocabulary follows issue #1: a *coherent* PR flows through the modules as
 * a Diff -> DiffChunk[] -> Finding[] -> ConsolidatedReport. The reviewer only
 * ever flags; it never modifies code and never blocks a merge.
 */

/** A PR category. For the first slice the classifier only distinguishes `coherent`. */
export type PrCategory = "coherent" | "non-coherent";

/** Tier 1 = blocking mechanical defects from CI. Tier 2 = the convention band. */
export type Tier = 1 | 2;

/** Overall report confidence, and per-finding confidence. */
export type Confidence = "HIGH" | "PARTIAL" | "LOW";

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

/** A single flagged issue. */
export interface Finding {
  tier: Tier;
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
  confidence: Confidence;
  tier1: Finding[];
  tier2: Finding[];
}
