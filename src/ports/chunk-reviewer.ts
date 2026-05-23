import type { DiffChunk } from "../domain/types.js";

/**
 * Port for invoking the chunk-review model on one diff chunk.
 *
 * Production wraps `@ai-hero/sandcastle` to run a Claude agent in a light
 * sandbox; tests inject a scripted fake so no real model is called. The
 * model invocation itself is the only non-unit-tested edge of the harness.
 */
export interface ChunkReviewer {
  /**
   * Review one chunk against the consuming project's standards and return
   * the model's raw output. The chunk-reviewer parser is responsible for
   * extracting structured findings from that string.
   */
  review(chunk: DiffChunk, standards: string): Promise<string>;
}
