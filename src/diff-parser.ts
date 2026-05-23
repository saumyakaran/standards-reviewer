import type { Diff, DiffFile, DiffHunk } from "./domain/types.js";

/**
 * Parse a unified-diff patch (as produced by `gh pr diff` or `git diff`) into
 * the domain Diff type.
 *
 * Handles the common shape — `diff --git`, `+++`/`---` headers, and `@@` hunk
 * headers — well enough for the coherent-PR slice. Renames, mode changes and
 * binary files are out of scope here.
 */
export function parseUnifiedDiff(patch: string): Diff {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | undefined;
  let currentHunk: DiffHunk | undefined;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      // "+++ b/path/to/file" — strip the leading "b/" if present.
      const path = line.slice(4).replace(/^b\//, "");
      currentFile = { path, hunks: [] };
      files.push(currentFile);
      currentHunk = undefined;
    } else if (line.startsWith("@@") && currentFile) {
      currentHunk = { header: line, lines: [] };
      currentFile.hunks.push(currentHunk);
    } else if (currentHunk && (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-"))) {
      // Skip the file-header "---"/"+++" lines themselves; they're matched above.
      if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
      currentHunk.lines.push(line);
    }
  }

  return { files };
}
