import { readdir, access } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * Filename pattern: `STANDARDS.md`, `standards.md`, `CODING_STANDARDS.md`,
 * `coding-standards.md`, `coding_standards.md`, `Coding-Standards.md`, …
 * Deliberately strict — won't match `standards-notes.md` or
 * `release-standards.md`. A consumer with an unusual name should use the
 * config field or the --standards flag.
 */
const STANDARDS_PATTERN = /^(coding[-_])?standards\.md$/i;

/**
 * Directories searched, in priority order (first match wins). The empty
 * string means the repo root. Order rationale:
 *   1. ./                — most prominent, consumer-facing convention
 *   2. ./.sandcastle/    — Sandcastle projects keep agent context here
 *   3. ./docs/agents/    — common cross-agent convention
 *   4. ./docs/           — generic docs fallback
 */
const SEARCH_DIRS = ["", ".sandcastle", "docs/agents", "docs"] as const;

export interface ResolveStandardsInput {
  cwd: string;
  /** `--standards` flag value; highest precedence. */
  cliPath?: string;
  /** `"standards"` field from `.standards-reviewer.json`; second highest. */
  configPath?: string;
  /** Injected for tests; returns [] for absent/non-directory paths. */
  listDir?: (path: string) => Promise<string[]>;
  /** Injected for tests; true iff the path exists. */
  exists?: (path: string) => Promise<boolean>;
}

export interface ResolvedStandards {
  /** Path the consumer sees in preflight output. */
  path: string;
  /** Why this path was chosen — fed to preflight rendering. */
  source: "cli" | "config" | "discovery";
}

export async function resolveStandards(
  input: ResolveStandardsInput,
): Promise<ResolvedStandards> {
  const listDir = input.listDir ?? defaultListDir;
  const exists = input.exists ?? defaultExists;

  if (input.cliPath !== undefined) {
    const abs = resolve(input.cwd, input.cliPath);
    if (!(await exists(abs))) {
      throw new Error(`--standards path does not exist: ${input.cliPath}`);
    }
    return { path: input.cliPath, source: "cli" };
  }

  if (input.configPath !== undefined) {
    const abs = resolve(input.cwd, input.configPath);
    if (!(await exists(abs))) {
      throw new Error(
        `standards path from .standards-reviewer.json does not exist: ${input.configPath}`,
      );
    }
    return { path: input.configPath, source: "config" };
  }

  for (const dir of SEARCH_DIRS) {
    const absDir = dir === "" ? input.cwd : join(input.cwd, dir);
    const files = await listDir(absDir);
    const matches = files.filter((name) => STANDARDS_PATTERN.test(name)).sort();
    if (matches.length === 0) continue;
    if (matches.length > 1) {
      const dirLabel = dir === "" ? "./" : `./${dir}/`;
      throw new Error(
        `Found multiple standards files in ${dirLabel}: ${matches.join(", ")} — ` +
          'pass --standards <path> or set "standards" in .standards-reviewer.json to disambiguate.',
      );
    }
    const relPath = dir === "" ? `./${matches[0]}` : `./${dir}/${matches[0]}`;
    return { path: relPath, source: "discovery" };
  }

  throw new Error(buildNotFoundMessage());
}

function buildNotFoundMessage(): string {
  return [
    "No standards file found. Searched (case-insensitive, matching /^(coding[-_])?standards\\.md$/):",
    "  ./",
    "  ./.sandcastle/",
    "  ./docs/agents/",
    "  ./docs/",
    "",
    "Fix: create STANDARDS.md (or CODING_STANDARDS.md / coding-standards.md) in one of those",
    'directories, pass --standards <path>, or set "standards" in .standards-reviewer.json.',
  ].join("\n");
}

async function defaultListDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
}

async function defaultExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
