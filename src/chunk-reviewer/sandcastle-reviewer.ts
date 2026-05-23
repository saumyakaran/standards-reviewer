import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import type { ChunkReviewer } from "../ports/chunk-reviewer.js";
import type { DiffChunk } from "../domain/types.js";
import { assemblePrompt } from "./prompt.js";

export interface SandcastleReviewerOptions {
  /** Claude model id. Defaults to claude-opus-4-7. */
  model?: string;
}

/**
 * Concrete ChunkReviewer using @ai-hero/sandcastle.
 *
 * Runs a Claude agent in a Docker sandbox with a light profile (git checkout
 * only, no dependency install). The agent is prompted by `assemblePrompt` to
 * emit a JSON array of findings; the parser handles noisy agent logs by
 * extracting the last JSON code fence.
 *
 * Not unit-tested per the issue — the model invocation itself is the one
 * non-tested edge of the harness.
 */
export function sandcastleReviewer(options: SandcastleReviewerOptions = {}): ChunkReviewer {
  const model = options.model ?? "claude-opus-4-7";

  return {
    async review(chunk: DiffChunk, standards: string): Promise<string> {
      const prompt = assemblePrompt(chunk, standards);

      const workDir = await mkdtemp(join(tmpdir(), "standards-reviewer-"));
      const promptFile = join(workDir, "prompt.md");
      await writeFile(promptFile, prompt, "utf8");

      const result = await run({
        agent: claudeCode(model),
        sandbox: docker(),
        promptFile,
      });

      if (!result.logFilePath) {
        throw new Error("sandcastle run produced no log file to read the agent's output from");
      }
      // The parser is tolerant of noisy logs — it scans for the last JSON fence.
      return await readFile(result.logFilePath, "utf8");
    },
  };
}
