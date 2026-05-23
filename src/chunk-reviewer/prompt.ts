import type { DiffChunk } from "../domain/types.js";

/** Render one chunk's files and hunks as a unified-diff text block. */
function renderChunk(chunk: DiffChunk): string {
  const sections: string[] = [];
  for (const file of chunk.files) {
    sections.push(`--- ${file.path}`);
    for (const hunk of file.hunks) {
      sections.push(hunk.header);
      sections.push(...hunk.lines);
    }
  }
  return sections.join("\n");
}

/**
 * Assemble the prompt the chunk reviewer hands to the model.
 *
 * The prompt is the tested edge of the chunk reviewer alongside the output
 * parser; the model call itself is not unit-tested. The prompt embeds the
 * consuming project's standards and the chunk verbatim, and pins the
 * expected output shape (a JSON array of findings) so the parser can read it.
 */
export function assemblePrompt(chunk: DiffChunk, standards: string): string {
  return [
    "You are a standards reviewer for a coherent pull request.",
    "",
    "You ONLY flag adherence to the standards below. You do not modify code,",
    "and you do not review correctness, logic bugs, or design.",
    "",
    "## Standards",
    "",
    standards,
    "",
    "## Diff",
    "",
    renderChunk(chunk),
    "",
    "## Output",
    "",
    "Always wrap your final output in a ```json fenced code block — even when",
    "there are no findings. The harness anchors on the fence to recover your",
    "answer from a noisy agent log; a bare answer outside a fence may be lost.",
    "",
    "Emit a JSON array of findings, one per violation. Use this exact shape:",
    "",
    "```json",
    "[",
    '  { "file": "<path>", "line": <number>, "standard": "<id>",',
    '    "message": "<one sentence>", "confidence": "HIGH" | "PARTIAL" | "LOW" }',
    "]",
    "```",
    "",
    "If there are no violations, emit an empty array inside the fence:",
    "",
    "```json",
    "[]",
    "```",
  ].join("\n");
}
