import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * User-authored config from `.standards-reviewer.json` at the consuming repo's
 * root. Both fields are optional: `standards` overrides auto-discovery when set,
 * `thresholds` overrides the classifier defaults piecewise.
 */
export interface StandardsReviewerConfig {
  standards?: string;
  thresholds?: {
    maxFiles?: number;
    maxLinesChanged?: number;
    maxModules?: number;
  };
}

const ALLOWED_TOP_KEYS = new Set(["standards", "thresholds"]);
const ALLOWED_THRESHOLD_KEYS = ["maxFiles", "maxLinesChanged", "maxModules"] as const;

/**
 * Read `.standards-reviewer.json` from `cwd` if present.
 *
 * Returns `null` when the file is absent (the common case in repos that rely
 * purely on auto-discovery). Throws on malformed JSON or unknown keys so a
 * typo'd config is loud rather than silently ignored.
 *
 * The `read` parameter is injected for tests — production uses node:fs.
 */
export async function loadConfig(
  cwd: string,
  read: (path: string) => Promise<string | null> = defaultRead,
): Promise<StandardsReviewerConfig | null> {
  const path = join(cwd, ".standards-reviewer.json");
  const raw = await read(path);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`.standards-reviewer.json is not valid JSON: ${detail}`);
  }
  return validate(parsed);
}

function validate(value: unknown): StandardsReviewerConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(".standards-reviewer.json must be a JSON object");
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      throw new Error(`.standards-reviewer.json: unknown top-level key "${key}"`);
    }
  }

  const out: StandardsReviewerConfig = {};

  if ("standards" in obj) {
    if (typeof obj.standards !== "string" || obj.standards.length === 0) {
      throw new Error('.standards-reviewer.json: "standards" must be a non-empty string');
    }
    out.standards = obj.standards;
  }

  if ("thresholds" in obj) {
    const t = obj.thresholds;
    if (t === null || typeof t !== "object" || Array.isArray(t)) {
      throw new Error('.standards-reviewer.json: "thresholds" must be an object');
    }
    const tObj = t as Record<string, unknown>;
    for (const key of Object.keys(tObj)) {
      if (!(ALLOWED_THRESHOLD_KEYS as readonly string[]).includes(key)) {
        throw new Error(`.standards-reviewer.json: unknown thresholds key "${key}"`);
      }
    }
    const thresholds: NonNullable<StandardsReviewerConfig["thresholds"]> = {};
    for (const key of ALLOWED_THRESHOLD_KEYS) {
      if (key in tObj) {
        const v = tObj[key];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
          throw new Error(
            `.standards-reviewer.json: thresholds.${key} must be a positive integer`,
          );
        }
        thresholds[key] = v;
      }
    }
    out.thresholds = thresholds;
  }

  return out;
}

async function defaultRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
