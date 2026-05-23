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

const BOT_LOGIN = "standards-reviewer-bot";
const VIEWER_LOGIN_SCRIPT: Script = { stdout: `${BOT_LOGIN}\n` };

describe("publishComment", () => {
  it("creates a new PR comment when no existing standards-reviewer comment is found", async () => {
    const { runner, calls } = fakeRunner([
      VIEWER_LOGIN_SCRIPT, // gh api user --jq .login
      { stdout: JSON.stringify({ comments: [] }) }, // gh pr view --json comments,…
      { stdout: "" }, // gh pr comment --body
    ]);

    await publishComment("42", "## Standards Review\n\nA report.", runner);

    expect(calls).toHaveLength(3);
    const publishCall = calls[2];
    expect(publishCall?.command).toBe("gh");
    expect(publishCall?.args).toContain("pr");
    expect(publishCall?.args).toContain("comment");
    expect(publishCall?.args).toContain("42");

    const bodyArg = publishCall?.args.join("\n") ?? "";
    expect(bodyArg).toContain("A report.");
    expect(bodyArg).toContain("<!-- standards-reviewer -->");
  });

  it("updates the existing standards-reviewer comment in place when one is found", async () => {
    const existing = {
      url: "https://github.com/example/repo/pull/42#issuecomment-9876",
      body: "An older report\n\n<!-- standards-reviewer -->",
      author: { login: BOT_LOGIN },
    };
    const { runner, calls } = fakeRunner([
      VIEWER_LOGIN_SCRIPT,
      { stdout: JSON.stringify({ comments: [existing] }) },
      { stdout: "" }, // gh api ... -X PATCH
    ]);

    await publishComment("42", "A fresh report.", runner);

    expect(calls).toHaveLength(3);
    const patchCall = calls[2];
    expect(patchCall?.command).toBe("gh");
    expect(patchCall?.args).toContain("api");
    expect(patchCall?.args).toContain("PATCH");
    expect(
      patchCall?.args.some((arg) => arg.includes("repos/example/repo/issues/comments/9876")),
    ).toBe(true);
    expect(patchCall?.args.join("\n")).toContain("A fresh report.");
  });

  it("ignores PR comments that do not carry the standards-reviewer marker", async () => {
    const otherComment = {
      url: "https://github.com/example/repo/pull/42#issuecomment-1",
      body: "Just a regular PR comment from a reviewer.",
      author: { login: "someone-else" },
    };
    const { runner, calls } = fakeRunner([
      VIEWER_LOGIN_SCRIPT,
      { stdout: JSON.stringify({ comments: [otherComment] }) },
      { stdout: "" },
    ]);

    await publishComment("42", "Hello", runner);

    expect(calls).toHaveLength(3);
    // Falls through to create, not the PATCH path.
    expect(calls[2]?.args).toContain("comment");
    expect(calls[2]?.args).not.toContain("api");
  });

  it("recognises a prior bot comment on GitHub Enterprise hosts (URL host is not github.com)", async () => {
    const existing = {
      url: "https://github.acme.corp/example/repo/pull/42#issuecomment-9876",
      body: "An older report\n\n<!-- standards-reviewer -->",
      author: { login: BOT_LOGIN },
    };
    const { runner, calls } = fakeRunner([
      VIEWER_LOGIN_SCRIPT,
      { stdout: JSON.stringify({ comments: [existing] }) },
      { stdout: "" }, // gh api ... -X PATCH
    ]);

    await publishComment("42", "A fresh report.", runner);

    expect(calls).toHaveLength(3);
    const patchCall = calls[2];
    expect(patchCall?.args).toContain("api");
    expect(patchCall?.args).toContain("PATCH");
    expect(
      patchCall?.args.some((arg) => arg.includes("repos/example/repo/issues/comments/9876")),
    ).toBe(true);
  });

  it("throws an actionable error when `gh pr view` exits non-zero", async () => {
    const { runner } = fakeRunner([
      VIEWER_LOGIN_SCRIPT,
      { stdout: "", exitCode: 1, stderr: "gh: API rate limit exceeded" },
    ]);

    await expect(publishComment("42", "report", runner)).rejects.toThrow(
      /gh pr view.*rate limit/i,
    );
  });

  it("throws an actionable error when `gh pr view` stdout is not valid JSON", async () => {
    const { runner } = fakeRunner([
      VIEWER_LOGIN_SCRIPT,
      { stdout: "unexpected non-json output from gh" },
    ]);

    await expect(publishComment("42", "report", runner)).rejects.toThrow(
      /gh pr view.*JSON/i,
    );
  });

  it("throws an actionable error when `gh api user` exits non-zero", async () => {
    const { runner } = fakeRunner([
      { stdout: "", exitCode: 1, stderr: "gh: not authenticated" },
    ]);

    await expect(publishComment("42", "report", runner)).rejects.toThrow(
      /gh api user.*not authenticated/i,
    );
  });

  it("throws an actionable error when `gh api user` returns an empty login", async () => {
    const { runner } = fakeRunner([{ stdout: "   \n" }]);

    await expect(publishComment("42", "report", runner)).rejects.toThrow(
      /gh api user.*empty/i,
    );
  });

  it("does not overwrite a user comment that quotes the bot's marker (marker substring alone is not enough)", async () => {
    // User clicked "Quote reply" on the bot's report; the quote-prefixed lines
    // make the marker appear as a substring of the user's comment body.
    const userQuoteComment = {
      url: "https://github.com/example/repo/pull/42#issuecomment-200",
      body: "Quoting the bot:\n\n> An older report\n>\n> <!-- standards-reviewer -->\n\nI disagree with item 3.",
      author: { login: "alice" },
    };
    const { runner, calls } = fakeRunner([
      VIEWER_LOGIN_SCRIPT,
      { stdout: JSON.stringify({ comments: [userQuoteComment] }) },
      { stdout: "" },
    ]);

    await publishComment("42", "Fresh report.", runner);

    expect(calls).toHaveLength(3);
    // Must fall through to create (gh pr comment), never PATCH alice's comment.
    expect(calls[2]?.args).toContain("comment");
    expect(calls[2]?.args).not.toContain("api");
    expect(calls[2]?.args).not.toContain("PATCH");
  });
});
