import { describe, it, expect } from "vitest";
import { preflight, renderPreflight } from "./preflight.js";
import type { CommandResult, CommandRunner } from "./ports/command-runner.js";

type Script = Partial<CommandResult> & { stdout: string };

function scriptedRunner(byCommand: Record<string, Script>): CommandRunner {
  return {
    async run(command, args) {
      const key = `${command} ${args[0] ?? ""}`.trim();
      const script = byCommand[key] ?? { stdout: "", exitCode: 1 };
      return {
        stdout: script.stdout,
        stderr: script.stderr ?? "",
        exitCode: script.exitCode ?? 0,
      };
    },
  };
}

describe("preflight", () => {
  it("returns ok=true when every check passes (PR mode)", async () => {
    const runner = scriptedRunner({
      "git rev-parse": { stdout: "true\n", exitCode: 0 },
      "gh auth": { stdout: "", exitCode: 0 },
      "docker info": { stdout: "", exitCode: 0 },
    });
    const result = await preflight({
      mode: "pr",
      standardsResolution: { path: "./STANDARDS.md", source: "discovery" },
      runner,
    });
    expect(result.ok).toBe(true);
    expect(result.checks.map((c) => c.name)).toEqual([
      "git repository",
      "standards file",
      "gh CLI auth",
      "Docker daemon",
    ]);
  });

  it("omits the gh check in local (--diff) mode", async () => {
    const runner = scriptedRunner({
      "git rev-parse": { stdout: "true\n", exitCode: 0 },
      "docker info": { stdout: "", exitCode: 0 },
    });
    const result = await preflight({
      mode: "local",
      standardsResolution: { path: "./S.md", source: "discovery" },
      runner,
    });
    expect(result.checks.map((c) => c.name)).toEqual([
      "git repository",
      "standards file",
      "Docker daemon",
    ]);
    expect(result.ok).toBe(true);
  });

  it("flags a failed git-repo check", async () => {
    const runner = scriptedRunner({
      "git rev-parse": { stdout: "", exitCode: 128 },
      "gh auth": { stdout: "", exitCode: 0 },
      "docker info": { stdout: "", exitCode: 0 },
    });
    const result = await preflight({
      mode: "pr",
      standardsResolution: { path: "./S.md", source: "discovery" },
      runner,
    });
    expect(result.ok).toBe(false);
    expect(result.checks[0]).toMatchObject({ name: "git repository", status: "fail" });
  });

  it("flags a missing standards resolution and carries the error message", async () => {
    const runner = scriptedRunner({
      "git rev-parse": { stdout: "true\n", exitCode: 0 },
      "gh auth": { stdout: "", exitCode: 0 },
      "docker info": { stdout: "", exitCode: 0 },
    });
    const result = await preflight({
      mode: "pr",
      standardsResolution: { error: "No standards file found." },
      runner,
    });
    expect(result.ok).toBe(false);
    const standardsCheck = result.checks.find((c) => c.name === "standards file")!;
    expect(standardsCheck.status).toBe("fail");
    expect(standardsCheck.detail).toBe("No standards file found.");
  });

  it("flags a gh auth failure (PR mode only)", async () => {
    const runner = scriptedRunner({
      "git rev-parse": { stdout: "true\n", exitCode: 0 },
      "gh auth": { stdout: "", stderr: "not logged in", exitCode: 1 },
      "docker info": { stdout: "", exitCode: 0 },
    });
    const result = await preflight({
      mode: "pr",
      standardsResolution: { path: "./S.md", source: "discovery" },
      runner,
    });
    expect(result.ok).toBe(false);
    const ghCheck = result.checks.find((c) => c.name === "gh CLI auth")!;
    expect(ghCheck.status).toBe("fail");
    expect(ghCheck.detail).toContain("not logged in");
  });

  it("flags a docker daemon failure", async () => {
    const runner = scriptedRunner({
      "git rev-parse": { stdout: "true\n", exitCode: 0 },
      "gh auth": { stdout: "", exitCode: 0 },
      "docker info": { stdout: "", exitCode: 1 },
    });
    const result = await preflight({
      mode: "pr",
      standardsResolution: { path: "./S.md", source: "discovery" },
      runner,
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "Docker daemon")?.status).toBe("fail");
  });
});

describe("renderPreflight", () => {
  it("renders a checkmark line per ok check with the detail when present", () => {
    const out = renderPreflight({
      ok: true,
      checks: [
        { name: "git repository", status: "ok" },
        {
          name: "standards file",
          status: "ok",
          detail: "./STANDARDS.md (source: discovery)",
        },
      ],
    });
    expect(out).toContain("✓ git repository");
    expect(out).toContain("✓ standards file: ./STANDARDS.md (source: discovery)");
  });

  it("renders a cross with the fix line for failed checks", () => {
    const out = renderPreflight({
      ok: false,
      checks: [
        {
          name: "Docker daemon",
          status: "fail",
          detail: "docker info returned non-zero",
          fix: "start Docker Desktop",
        },
      ],
    });
    expect(out).toContain("✗ Docker daemon: docker info returned non-zero");
    expect(out).toContain("fix: start Docker Desktop");
  });
});
