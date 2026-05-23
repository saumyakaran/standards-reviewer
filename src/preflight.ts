import type { CommandRunner } from "./ports/command-runner.js";

export interface PreflightCheck {
  name: string;
  status: "ok" | "fail";
  detail?: string;
  fix?: string;
}

export interface PreflightResult {
  ok: boolean;
  checks: PreflightCheck[];
}

/**
 * Result the resolver hands to preflight: either a resolved path with its
 * provenance, or the human-readable error string the resolver threw. Keeping
 * the error in-band lets preflight render every failed check uniformly
 * instead of crashing mid-run on standards resolution.
 */
export type StandardsResolution =
  | { path: string; source: "cli" | "config" | "discovery" }
  | { error: string };

export interface PreflightInput {
  /** "pr" mode requires gh + auth; "local" (--diff) only needs docker + git. */
  mode: "pr" | "local";
  standardsResolution: StandardsResolution;
  runner: CommandRunner;
}

export async function preflight(input: PreflightInput): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  checks.push(await checkGitRepo(input.runner));
  checks.push(checkStandards(input.standardsResolution));
  if (input.mode === "pr") {
    checks.push(await checkGhAuth(input.runner));
  }
  checks.push(await checkDocker(input.runner));
  return { ok: checks.every((c) => c.status === "ok"), checks };
}

async function checkGitRepo(runner: CommandRunner): Promise<PreflightCheck> {
  const r = await runner.run("git", ["rev-parse", "--is-inside-work-tree"]);
  if (r.exitCode === 0 && r.stdout.trim() === "true") {
    return { name: "git repository", status: "ok" };
  }
  return {
    name: "git repository",
    status: "fail",
    detail: "current directory is not inside a git work tree",
    fix: "run from inside a git repository",
  };
}

function checkStandards(res: StandardsResolution): PreflightCheck {
  if ("error" in res) {
    return { name: "standards file", status: "fail", detail: res.error };
  }
  return {
    name: "standards file",
    status: "ok",
    detail: `${res.path} (source: ${res.source})`,
  };
}

async function checkGhAuth(runner: CommandRunner): Promise<PreflightCheck> {
  const r = await runner.run("gh", ["auth", "status"]);
  if (r.exitCode === 0) return { name: "gh CLI auth", status: "ok" };
  return {
    name: "gh CLI auth",
    status: "fail",
    detail: r.stderr.trim() || r.stdout.trim() || "gh auth status failed",
    fix: "install gh (https://cli.github.com) and run `gh auth login`",
  };
}

async function checkDocker(runner: CommandRunner): Promise<PreflightCheck> {
  const r = await runner.run("docker", ["info"]);
  if (r.exitCode === 0) return { name: "Docker daemon", status: "ok" };
  return {
    name: "Docker daemon",
    status: "fail",
    detail: "docker info returned non-zero — daemon may be down or docker not installed",
    fix: "install Docker Desktop or start the docker daemon",
  };
}

export function renderPreflight(result: PreflightResult): string {
  const lines = ["standards-reviewer preflight:"];
  for (const check of result.checks) {
    const icon = check.status === "ok" ? "✓" : "✗";
    lines.push(`  ${icon} ${check.name}${check.detail !== undefined ? `: ${check.detail}` : ""}`);
    if (check.status === "fail" && check.fix !== undefined) {
      lines.push(`      fix: ${check.fix}`);
    }
  }
  return lines.join("\n");
}
