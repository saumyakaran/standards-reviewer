import { readFile } from "node:fs/promises";
import { reviewCoherentPr } from "./orchestrator.js";
import { fixtureAdapter } from "./adapter.js";
import { nodeCommandRunner } from "./runners/node-command-runner.js";
import { nodeReportWriter } from "./writers/node-report-writer.js";
import { sandcastleReviewer } from "./chunk-reviewer/sandcastle-reviewer.js";
import { parseUnifiedDiff } from "./diff-parser.js";
import { validatePrRef } from "./pr-ref.js";
import type { Diff } from "./domain/types.js";

async function fetchDiffFromGh(prRef: string): Promise<Diff> {
  const { stdout, exitCode, stderr } = await nodeCommandRunner.run("gh", [
    "pr",
    "diff",
    prRef,
  ]);
  if (exitCode !== 0) {
    throw new Error(`gh pr diff failed: ${stderr.trim()}`);
  }
  return parseUnifiedDiff(stdout);
}

async function readLocalDiff(path: string): Promise<Diff> {
  return parseUnifiedDiff(await readFile(path, "utf8"));
}

function usage(): never {
  process.stderr.write(
    [
      "Usage:",
      "  standards-reviewer <pr-ref>           Review a PR; post a single idempotent comment.",
      "  standards-reviewer --diff <patchfile> Local review; write to stdout + ./standards-review.md.",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];
  if (!first) usage();

  let diff: Diff;
  let prRef: string | undefined;
  let outputPath: string | undefined;

  if (first === "--diff") {
    const patchPath = argv[1];
    if (!patchPath) usage();
    diff = await readLocalDiff(patchPath);
    outputPath = "./standards-review.md";
  } else {
    prRef = validatePrRef(first);
    diff = await fetchDiffFromGh(prRef);
  }

  if (diff.files.length === 0) {
    process.stderr.write(
      "Diff contains no file changes; nothing to review.\n" +
        "If you meant to review a PR, check the ref or the patch file.\n",
    );
    process.exit(2);
  }

  await reviewCoherentPr({
    diff,
    ...(prRef !== undefined ? { prRef } : {}),
    ...(outputPath !== undefined ? { outputPath } : {}),
    adapter: fixtureAdapter,
    reviewer: sandcastleReviewer(),
    runner: nodeCommandRunner,
    writer: nodeReportWriter,
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
