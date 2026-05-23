import { describe, it, expect } from "vitest";
import { readCiStatus } from "./ci-status-reader.js";
import type { CommandResult, CommandRunner } from "./ports/command-runner.js";

interface RecordedCall {
  command: string;
  args: readonly string[];
}

interface Fake {
  runner: CommandRunner;
  calls: RecordedCall[];
}

function fakeRunner(result: Partial<CommandResult> & { stdout: string }): Fake {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = {
    async run(command, args) {
      calls.push({ command, args });
      return {
        stdout: result.stdout,
        stderr: result.stderr ?? "",
        exitCode: result.exitCode ?? 0,
      };
    },
  };
  return { runner, calls };
}

describe("readCiStatus", () => {
  it("invokes `gh pr checks <ref> --json` and parses a failed check into a CiFinding", async () => {
    const { runner, calls } = fakeRunner({
      stdout: JSON.stringify([
        {
          name: "unit-tests",
          state: "FAILURE",
          bucket: "fail",
          link: "https://github.com/example/repo/actions/runs/1",
        },
      ]),
    });

    const result = await readCiStatus("42", runner);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("gh");
    expect(calls[0]?.args).toContain("pr");
    expect(calls[0]?.args).toContain("checks");
    expect(calls[0]?.args).toContain("42");
    expect(calls[0]?.args).toContain("--json");

    expect(result.available).toBe(true);
    expect(result.findings).toEqual([
      {
        check: "unit-tests",
        conclusion: "FAILURE",
        detailsUrl: "https://github.com/example/repo/actions/runs/1",
      },
    ]);
  });

  it("returns only failed checks, ignoring passing and pending ones", async () => {
    const { runner } = fakeRunner({
      stdout: JSON.stringify([
        { name: "unit-tests", state: "FAILURE", bucket: "fail" },
        { name: "lint", state: "SUCCESS", bucket: "pass" },
        { name: "deploy", state: "PENDING", bucket: "pending" },
        { name: "build", state: "FAILURE", bucket: "fail" },
      ]),
    });

    const result = await readCiStatus("42", runner);

    expect(result.available).toBe(true);
    expect(result.findings.map((f) => f.check)).toEqual(["unit-tests", "build"]);
  });

  it("treats a passing CI run as available with no findings", async () => {
    const { runner } = fakeRunner({ stdout: "[]" });

    const result = await readCiStatus("42", runner);

    expect(result).toEqual({ findings: [], available: true });
  });

  it("degrades to available=false when gh exits non-zero", async () => {
    const { runner } = fakeRunner({
      stdout: "",
      exitCode: 1,
      stderr: "gh: not authenticated",
    });

    const result = await readCiStatus("42", runner);

    expect(result).toEqual({ findings: [], available: false });
  });

  it("degrades to available=false when gh stdout is not valid JSON", async () => {
    const { runner } = fakeRunner({ stdout: "not json output" });

    const result = await readCiStatus("42", runner);

    expect(result).toEqual({ findings: [], available: false });
  });
});
