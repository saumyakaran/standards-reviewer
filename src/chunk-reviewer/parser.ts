import type { Confidence, ConventionFinding } from "../domain/types.js";

const CONFIDENCE_VALUES: readonly string[] = ["HIGH", "PARTIAL", "LOW"];

/** The outcome of parsing one chunk reviewer's raw model output. */
export interface ParseResult {
  /** Tier-2 convention findings recovered from the output. */
  findings: ConventionFinding[];
  /** False if any part of the output was malformed — feeds the confidence header. */
  ok: boolean;
}

/**
 * Validate one raw item into a ConventionFinding, or return null if it is
 * missing or has the wrong type for any required field.
 */
function toFinding(item: unknown): ConventionFinding | null {
  if (typeof item !== "object" || item === null) return null;
  const raw = item as Record<string, unknown>;

  const { file, line, standard, message, confidence } = raw;
  if (typeof file !== "string" || file === "") return null;
  if (typeof line !== "number" || !Number.isFinite(line)) return null;
  if (typeof standard !== "string" || standard === "") return null;
  if (typeof message !== "string" || message === "") return null;
  if (typeof confidence !== "string" || !CONFIDENCE_VALUES.includes(confidence)) return null;

  return { file, line, standard, message, confidence: confidence as Confidence };
}

/**
 * Pull the JSON payload out of the model's raw output.
 *
 * The output can be (a) just JSON, (b) a single ```` ```json ```` fence, or
 * (c) noisy agent-log text containing one or more fences — in which case the
 * LAST fence wins (later thinking supersedes earlier drafts).
 */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenceRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let lastMatch: RegExpExecArray | null = null;
  for (let m = fenceRegex.exec(trimmed); m !== null; m = fenceRegex.exec(trimmed)) {
    lastMatch = m;
  }
  return lastMatch ? lastMatch[1]! : trimmed;
}

/**
 * Parse the chunk reviewer's raw model output into structured Tier-2 findings.
 *
 * The model is asked to emit a JSON array of findings; this is the tested edge
 * of the chunk reviewer. The model call itself is not unit-tested.
 */
export function parseChunkReviewOutput(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { findings: [], ok: false };
  }
  if (!Array.isArray(parsed)) {
    return { findings: [], ok: false };
  }

  const findings: ConventionFinding[] = [];
  let ok = true;
  for (const item of parsed) {
    const finding = toFinding(item);
    if (finding) findings.push(finding);
    else ok = false;
  }
  return { findings, ok };
}
