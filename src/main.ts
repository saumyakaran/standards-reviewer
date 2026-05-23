#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { reviewCoherentPr } from "./orchestrator.js";
import { fsAdapter } from "./fs-adapter.js";
import { nodeCommandRunner } from "./runners/node-command-runner.js";
import { nodeReportWriter } from "./writers/node-report-writer.js";
import { sandcastleReviewer } from "./chunk-reviewer/sandcastle-reviewer.js";
import { parseUnifiedDiff } from "./diff-parser.js";
import { validatePrRef } from "./pr-ref.js";
import { parseCli, usageMessage } from "./cli.js";
import { loadConfig } from "./config-loader.js";
import { resolveStandards } from "./standards-resolver.js";
import { preflight, renderPreflight, type StandardsResolution } from "./preflight.js";
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

async function main(): Promise<void> {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.kind === "usage-error") {
    process.stderr.write(`${parsed.message}\n\n${usageMessage()}\n`);
    process.exit(2);
  }

  const cwd = process.cwd();
  const mode: "pr" | "local" = parsed.kind === "pr" ? "pr" : "local";

  // Config errors are configuration mistakes, not preflight failures —
  // surface them on stderr with the same exit code as a usage error.
  let config: Awaited<ReturnType<typeof loadConfig>> = null;
  try {
    config = await loadConfig(cwd);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  // Resolve standards before preflight so the preflight block can name the
  // file (or, on failure, surface the discovery error).
  let standardsResolution: StandardsResolution;
  try {
    standardsResolution = await resolveStandards({
      cwd,
      ...(parsed.standards !== undefined ? { cliPath: parsed.standards } : {}),
      ...(config?.standards !== undefined ? { configPath: config.standards } : {}),
    });
  } catch (err) {
    standardsResolution = { error: err instanceof Error ? err.message : String(err) };
  }

  const preflightResult = await preflight({
    mode,
    standardsResolution,
    runner: nodeCommandRunner,
  });
  process.stdout.write(`${renderPreflight(preflightResult)}\n`);

  if (parsed.kind === "check-only") {
    process.exit(preflightResult.ok ? 0 : 1);
  }
  if (!preflightResult.ok) {
    process.stderr.write("\nPreflight failed. Fix the issues above and retry.\n");
    process.exit(1);
  }
  // Defensive — preflight already reports this as failed when present.
  if ("error" in standardsResolution) process.exit(1);

  let diff: Diff;
  let prRef: string | undefined;
  let outputPath: string | undefined;
  if (parsed.kind === "pr") {
    prRef = validatePrRef(parsed.prRef);
    diff = await fetchDiffFromGh(prRef);
  } else {
    diff = await readLocalDiff(parsed.patchPath);
    outputPath = "./standards-review.md";
  }

  if (diff.files.length === 0) {
    process.stderr.write("Diff contains no file changes; nothing to review.\n");
    process.exit(2);
  }

  await reviewCoherentPr({
    diff,
    ...(prRef !== undefined ? { prRef } : {}),
    ...(outputPath !== undefined ? { outputPath } : {}),
    adapter: fsAdapter({
      standardsPath: standardsResolution.path,
      ...(config?.thresholds !== undefined ? { thresholds: config.thresholds } : {}),
    }),
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
