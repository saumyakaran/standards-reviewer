import type { CommandRunner } from "./ports/command-runner.js";

/**
 * Marker embedded in the comment body so the publisher can find and update
 * its own comment on subsequent runs, leaving other PR comments untouched.
 */
const MARKER = "<!-- standards-reviewer -->";

/**
 * Publish the rendered markdown report as a single idempotent PR comment.
 *
 * On the first run there is no marker-carrying comment, so the publisher
 * creates one via `gh pr comment`. On later runs the marker locates the prior
 * comment, which is then updated in place — re-running never duplicates.
 */
interface GhComment {
  body: string;
  url: string;
  author?: { login: string };
}

interface CommentLocator {
  owner: string;
  repo: string;
  id: string;
}

/**
 * A GitHub PR comment URL looks like
 *   https://{host}/{owner}/{repo}/pull/{n}#issuecomment-{id}
 * where `{host}` is github.com on github.com and `github.{enterprise}` on GHE.
 * Pull the locator out so we can address the comment via `gh api` — `gh api`
 * itself uses the auth-configured host, so we only need the path components.
 */
function parseCommentUrl(url: string): CommentLocator | undefined {
  const match = /^https:\/\/[^/]+\/([^/]+)\/([^/]+)\/pull\/\d+#issuecomment-(\d+)$/.exec(url);
  if (!match) return undefined;
  return { owner: match[1]!, repo: match[2]!, id: match[3]! };
}

/**
 * Find a previously-published standards-reviewer comment on this PR, if any.
 *
 * The marker alone is not a safe identity check — a user can quote the bot's
 * report (e.g. via "Quote reply") and their comment body will then contain the
 * marker as a substring. Pairing the marker with `author.login === viewerLogin`
 * means we only overwrite comments that we ourselves created.
 */
async function findExistingComment(
  prRef: string,
  runner: CommandRunner,
  viewerLogin: string,
): Promise<GhComment | undefined> {
  const { stdout, stderr, exitCode } = await runner.run("gh", [
    "pr",
    "view",
    prRef,
    "--json",
    "comments",
  ]);
  if (exitCode !== 0) {
    throw new Error(`gh pr view failed (exit ${exitCode}): ${stderr.trim() || "no stderr"}`);
  }
  let parsed: { comments?: GhComment[] };
  try {
    parsed = JSON.parse(stdout) as { comments?: GhComment[] };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`gh pr view returned non-JSON stdout: ${detail}`);
  }
  return parsed.comments?.find(
    (comment) => comment.author?.login === viewerLogin && comment.body.includes(MARKER),
  );
}

async function fetchViewerLogin(runner: CommandRunner): Promise<string> {
  const { stdout, stderr, exitCode } = await runner.run("gh", [
    "api",
    "user",
    "--jq",
    ".login",
  ]);
  if (exitCode !== 0) {
    throw new Error(`gh api user failed (exit ${exitCode}): ${stderr.trim() || "no stderr"}`);
  }
  const login = stdout.trim();
  if (!login) {
    throw new Error("gh api user returned empty login");
  }
  return login;
}

export async function publishComment(
  prRef: string,
  markdown: string,
  runner: CommandRunner,
): Promise<void> {
  const body = `${markdown}\n\n${MARKER}`;

  const viewerLogin = await fetchViewerLogin(runner);

  const existing = await findExistingComment(prRef, runner, viewerLogin);
  if (existing) {
    const locator = parseCommentUrl(existing.url);
    if (locator) {
      await runner.run("gh", [
        "api",
        "-X",
        "PATCH",
        `repos/${locator.owner}/${locator.repo}/issues/comments/${locator.id}`,
        "-f",
        `body=${body}`,
      ]);
      return;
    }
  }

  await runner.run("gh", ["pr", "comment", prRef, "--body", body]);
}
