import { describe, it, expect } from "vitest";
import { publishComment } from "./comment-publisher.js";
import type { CommandResult, CommandRunner } from "./ports/command-runner.js";

interface RecordedCall {
  command: string;
  args: readonly string[];
}

type Script = Partial<CommandResult> & { stdout: string };

function fakeRunner(scripts: Script[]): { runner: CommandRunner; calls: RecordedCall[] } {
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

describe("publishComment", () => {
  it("creates a new PR comment when no existing standards-reviewer comment is found", async () => {
    const { runner, calls } = fakeRunner([
      { stdout: JSON.stringify({ comments: [] }) }, // gh pr view --json comments
      { stdout: "" }, // gh pr comment --body
    ]);

    await publishComment("42", "## Standards Review\n\nA report.", runner);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.command).toBe("gh");
    expect(calls[1]?.args).toContain("pr");
    expect(calls[1]?.args).toContain("comment");
    expect(calls[1]?.args).toContain("42");

    const bodyArg = calls[1]?.args.join("\n") ?? "";
    expect(bodyArg).toContain("A report.");
    expect(bodyArg).toContain("<!-- standards-reviewer -->");
  });

  it("updates the existing standards-reviewer comment in place when one is found", async () => {
    const existing = {
      url: "https://github.com/example/repo/pull/42#issuecomment-9876",
      body: "An older report\n\n<!-- standards-reviewer -->",
    };
    const { runner, calls } = fakeRunner([
      { stdout: JSON.stringify({ comments: [existing] }) }, // gh pr view --json comments
      { stdout: "" }, // gh api ... -X PATCH
    ]);

    await publishComment("42", "A fresh report.", runner);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.command).toBe("gh");
    expect(calls[1]?.args).toContain("api");
    expect(calls[1]?.args).toContain("PATCH");
    expect(
      calls[1]?.args.some((arg) => arg.includes("repos/example/repo/issues/comments/9876")),
    ).toBe(true);
    expect(calls[1]?.args.join("\n")).toContain("A fresh report.");
  });

  it("ignores PR comments that do not carry the standards-reviewer marker", async () => {
    const otherComment = {
      url: "https://github.com/example/repo/pull/42#issuecomment-1",
      body: "Just a regular PR comment from a reviewer.",
    };
    const { runner, calls } = fakeRunner([
      { stdout: JSON.stringify({ comments: [otherComment] }) },
      { stdout: "" },
    ]);

    await publishComment("42", "Hello", runner);

    expect(calls).toHaveLength(2);
    // Falls through to create, not the PATCH path.
    expect(calls[1]?.args).toContain("comment");
    expect(calls[1]?.args).not.toContain("api");
  });
});
