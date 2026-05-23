/**
 * Tagged union of every well-formed argv shape, plus a usage-error variant.
 * `standards` is omitted (rather than set to `undefined`) when absent — this
 * matches the codebase's `exactOptionalPropertyTypes: true` convention.
 */
export type ParsedCli =
  | { kind: "pr"; prRef: string; standards?: string; check: boolean }
  | { kind: "diff"; patchPath: string; standards?: string; check: boolean }
  | { kind: "check-only"; standards?: string }
  | { kind: "usage-error"; message: string };

type Mode = { kind: "pr"; prRef: string } | { kind: "diff"; patchPath: string };

export function parseCli(argv: readonly string[]): ParsedCli {
  let standards: string | undefined;
  let check = false;
  let mode: Mode | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--standards") {
      const next = argv[++i];
      if (next === undefined) {
        return { kind: "usage-error", message: "--standards requires a path argument" };
      }
      standards = next;
    } else if (arg === "--diff") {
      const next = argv[++i];
      if (next === undefined) {
        return { kind: "usage-error", message: "--diff requires a path argument" };
      }
      if (mode !== undefined) {
        return {
          kind: "usage-error",
          message: "specify either --diff or a PR ref, not both",
        };
      }
      mode = { kind: "diff", patchPath: next };
    } else if (arg === "--check") {
      check = true;
    } else if (arg.startsWith("--")) {
      return { kind: "usage-error", message: `unknown flag: ${arg}` };
    } else {
      if (mode !== undefined) {
        return {
          kind: "usage-error",
          message: "specify either --diff or a PR ref, not both",
        };
      }
      mode = { kind: "pr", prRef: arg };
    }
  }

  if (mode === undefined) {
    if (check) {
      return standards !== undefined
        ? { kind: "check-only", standards }
        : { kind: "check-only" };
    }
    return { kind: "usage-error", message: usageMessage() };
  }

  if (mode.kind === "pr") {
    return standards !== undefined
      ? { kind: "pr", prRef: mode.prRef, standards, check }
      : { kind: "pr", prRef: mode.prRef, check };
  }
  return standards !== undefined
    ? { kind: "diff", patchPath: mode.patchPath, standards, check }
    : { kind: "diff", patchPath: mode.patchPath, check };
}

export function usageMessage(): string {
  return [
    "Usage:",
    "  standards-reviewer <pr-ref>          Review a PR; post one idempotent comment.",
    "  standards-reviewer --diff <patch>    Local review; write stdout + ./standards-review.md.",
    "  standards-reviewer --check           Run preflight only; exit non-zero on failure.",
    "",
    "Options:",
    "  --standards <path>   Path to the standards file (overrides auto-discovery).",
    "",
    "Discovery order when --standards is not set:",
    '  1. "standards" field in ./.standards-reviewer.json',
    "  2. ./<STANDARDS|CODING_STANDARDS|coding-standards|coding_standards>.md (any casing)",
    "  3. Same regex under ./.sandcastle/, ./docs/agents/, then ./docs/",
  ].join("\n");
}
