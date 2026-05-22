import type { Diff, DiffChunk } from "./domain/types.js";

/**
 * Partition a diff into reviewable chunks.
 *
 * A *coherent* diff is, by definition, one bounded and concentrated change, so
 * it partitions into a single chunk carrying the whole diff. Splitting larger
 * or scattered diffs is a later slice.
 */
export function partitionDiff(diff: Diff): DiffChunk[] {
  return [{ files: diff.files }];
}
