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
}

interface CommentLocator {
  owner: string;
  repo: string;
  id: string;
}

/**
 * A GitHub PR comment URL looks like
 *   https://github.com/{owner}/{repo}/pull/{n}#issuecomment-{id}
 * Pull the locator out so we can address the comment via `gh api`.
 */
function parseCommentUrl(url: string): CommentLocator | undefined {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+#issuecomment-(\d+)$/.exec(url);
  if (!match) return undefined;
  return { owner: match[1]!, repo: match[2]!, id: match[3]! };
}

/** Find a previously-published standards-reviewer comment on this PR, if any. */
async function findExistingComment(
  prRef: string,
  runner: CommandRunner,
): Promise<GhComment | undefined> {
  const { stdout } = await runner.run("gh", ["pr", "view", prRef, "--json", "comments"]);
  const parsed = JSON.parse(stdout) as { comments?: GhComment[] };
  return parsed.comments?.find((comment) => comment.body.includes(MARKER));
}

export async function publishComment(
  prRef: string,
  markdown: string,
  runner: CommandRunner,
): Promise<void> {
  const body = `${markdown}\n\n${MARKER}`;

  const existing = await findExistingComment(prRef, runner);
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
