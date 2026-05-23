import type { CiFinding } from "./domain/types.js";
import type { CommandRunner } from "./ports/command-runner.js";

export interface CiStatusResult {
  /** Tier-1 findings — one per failed check run. */
  findings: CiFinding[];
  /** False if CI status could not be read; feeds the consolidator's confidence rule. */
  available: boolean;
}

/**
 * Read the PR's CI status via `gh pr checks` and turn failed checks into
 * Tier-1 CiFindings. The harness reads CI; it never re-runs tests.
 */
export async function readCiStatus(
  prRef: string,
  runner: CommandRunner,
): Promise<CiStatusResult> {
  const { stdout, exitCode } = await runner.run("gh", [
    "pr",
    "checks",
    prRef,
    "--json",
    "name,state,bucket,link",
  ]);

  if (exitCode !== 0) {
    return { findings: [], available: false };
  }

  let checks: Array<{ name: string; state: string; bucket?: string; link?: string }>;
  try {
    checks = JSON.parse(stdout);
  } catch {
    return { findings: [], available: false };
  }
  if (!Array.isArray(checks)) {
    return { findings: [], available: false };
  }

  const findings: CiFinding[] = checks
    .filter((check) => check.bucket === "fail")
    .map((check) => {
      const finding: CiFinding = { check: check.name, conclusion: check.state };
      if (check.link) finding.detailsUrl = check.link;
      return finding;
    });

  return { findings, available: true };
}
