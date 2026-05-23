import { describe, it, expect } from "vitest";
import { reviewCoherentPr } from "./orchestrator.js";
import { fixtureAdapter } from "./adapter.js";
import type { Diff } from "./domain/types.js";
import type { ChunkReviewer } from "./ports/chunk-reviewer.js";
import type { CommandResult, CommandRunner } from "./ports/command-runner.js";
import type { ReportWriter } from "./ports/report-writer.js";

interface RecordedCall {
  command: string;
  args: readonly string[];
}

type Script = Partial<CommandResult> & { stdout: string };

function scriptedRunner(scripts: Script[]): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;
  const runner: CommandRunner = {
    async run(command, args) {
      calls.push({ command, args });
      const script = scripts[index++] ?? { stdout: "" };
      return {
        stdout: script.stdout,
        stderr: script.stderr ?? "",
        exitCode: script.exitCode ?? 0,
      };
    },
  };
  return { runner, calls };
}

function scriptedReviewer(raw: string): ChunkReviewer {
  return { review: async () => raw };
}

function recordingWriter(): {
  writer: ReportWriter;
  stdout: string[];
  files: { path: string; text: string }[];
} {
  const stdout: string[] = [];
  const files: { path: string; text: string }[] = [];
  const writer: ReportWriter = {
    writeStdout(text) {
      stdout.push(text);
    },
    async writeFile(path, text) {
      files.push({ path, text });
    },
  };
  return { writer, stdout, files };
}

const coherentDiff: Diff = {
  files: [
    {
      path: "src/auth/login.ts",
      hunks: [
        { header: "@@ -1,1 +1,2 @@", lines: ["+const Token = mint();", " return Token;"] },
      ],
    },
  ],
};

describe("reviewCoherentPr", () => {
  it("orchestrates a coherent PR end-to-end and publishes a report citing the finding", async () => {
    const reviewer = scriptedReviewer(
      JSON.stringify([
        {
          file: "src/auth/login.ts",
          line: 1,
          standard: "naming/camelCase",
          message: "Use camelCase for local variables.",
          confidence: "HIGH",
        },
      ]),
    );

    const { runner, calls } = scriptedRunner([
      { stdout: "[]" }, // gh pr checks — no CI findings
      { stdout: "standards-reviewer-bot\n" }, // gh api user --jq .login
      { stdout: JSON.stringify({ comments: [] }) }, // gh pr view --json comments
      { stdout: "" }, // gh pr comment — publish
    ]);

    const { writer } = recordingWriter();

    const result = await reviewCoherentPr({
      diff: coherentDiff,
      prRef: "42",
      adapter: fixtureAdapter,
      reviewer,
      runner,
      writer,
    });

    expect(result.category).toBe("coherent");
    expect(result.report.tier2).toHaveLength(1);
    expect(result.report.tier2[0]?.message).toBe("Use camelCase for local variables.");

    // Last call is the publish — it carries the rendered markdown citing the finding.
    const publishBody = calls[calls.length - 1]?.args.join("\n") ?? "";
    expect(publishBody).toContain("src/auth/login.ts:1");
    expect(publishBody).toContain("Use camelCase for local variables.");
  });

  it("writes the markdown to stdout and to a file when invoked locally without a PR", async () => {
    const reviewer = scriptedReviewer("[]");
    const { runner, calls } = scriptedRunner([]); // no gh calls expected
    const { writer, stdout, files } = recordingWriter();

    await reviewCoherentPr({
      diff: coherentDiff,
      outputPath: "/tmp/review.md",
      adapter: fixtureAdapter,
      reviewer,
      runner,
      writer,
    });

    expect(calls).toHaveLength(0);
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("# Standards Review");
    expect(files.map((f) => f.path)).toEqual(["/tmp/review.md", "/tmp/review.json"]);
    expect(files[1]?.text).toContain('"confidence"');
  });

  it("skips the chunk reviewer for a non-coherent diff but still publishes CI findings", async () => {
    // Exceeds the fixture adapter's maxLinesChanged of 400.
    const bigDiff: Diff = {
      files: [
        {
          path: "src/auth/login.ts",
          hunks: [{ header: "@@ -1,1 +1,500 @@", lines: Array(500).fill("+added") }],
        },
      ],
    };

    let reviewerCalled = false;
    const reviewer: ChunkReviewer = {
      async review() {
        reviewerCalled = true;
        return "[]";
      },
    };

    const { runner, calls } = scriptedRunner([
      {
        stdout: JSON.stringify([
          { name: "build", state: "FAILURE", bucket: "fail" },
        ]),
      },
      { stdout: "standards-reviewer-bot\n" }, // gh api user --jq .login
      { stdout: JSON.stringify({ comments: [] }) },
      { stdout: "" },
    ]);
    const { writer } = recordingWriter();

    const result = await reviewCoherentPr({
      diff: bigDiff,
      prRef: "42",
      adapter: fixtureAdapter,
      reviewer,
      runner,
      writer,
    });

    expect(reviewerCalled).toBe(false);
    expect(result.category).toBe("non-coherent");
    expect(result.report.tier1.map((f) => f.check)).toEqual(["build"]);
    expect(result.report.tier2).toEqual([]);
    expect(calls[calls.length - 1]?.args.join("\n")).toContain("build");
  });

  it("degrades cleanly when the chunk reviewer throws — still reads CI and publishes a report", async () => {
    const reviewer: ChunkReviewer = {
      async review() {
        throw new Error("sandcastle exec failed");
      },
    };
    const { runner, calls } = scriptedRunner([
      {
        stdout: JSON.stringify([{ name: "build", state: "FAILURE", bucket: "fail" }]),
      }, // gh pr checks — CI must still be read despite the reviewer throwing
      { stdout: "standards-reviewer-bot\n" }, // gh api user --jq .login
      { stdout: JSON.stringify({ comments: [] }) }, // gh pr view --json comments
      { stdout: "" }, // gh pr comment — publish
    ]);
    const { writer } = recordingWriter();

    const result = await reviewCoherentPr({
      diff: coherentDiff,
      prRef: "42",
      adapter: fixtureAdapter,
      reviewer,
      runner,
      writer,
    });

    // Tier-1 CI must still surface despite the reviewer throwing.
    expect(result.report.tier1.map((f) => f.check)).toEqual(["build"]);
    expect(result.report.tier2).toEqual([]);
    // Same degradation contract as unparseable chunk output: PARTIAL confidence.
    expect(result.report.confidence).toBe("PARTIAL");
    // The publish call must still happen.
    expect(calls).toHaveLength(4);
    expect(calls[calls.length - 1]?.args.join("\n")).toContain("build");
  });

  it("degrades report confidence when the chunk reviewer's output fails to parse", async () => {
    const reviewer = scriptedReviewer("the model could not produce JSON");
    const { runner } = scriptedRunner([
      { stdout: "[]" }, // gh pr checks — CI readable, no failures
      { stdout: "standards-reviewer-bot\n" }, // gh api user --jq .login
      { stdout: JSON.stringify({ comments: [] }) },
      { stdout: "" },
    ]);
    const { writer } = recordingWriter();

    const result = await reviewCoherentPr({
      diff: coherentDiff,
      prRef: "42",
      adapter: fixtureAdapter,
      reviewer,
      runner,
      writer,
    });

    // CI available but chunk parse failed → PARTIAL per the confidence rule.
    expect(result.report.confidence).toBe("PARTIAL");
    expect(result.report.tier2).toEqual([]);
  });
});
