import type { ClassifierThresholds, DiffMetadata, PrCategory } from "./domain/types.js";

/** A file's module is the directory it lives in — the unit of coupling. */
function moduleOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/**
 * Classify a PR from intrinsic diff signals.
 *
 * For the first slice this only recognises the *coherent* category: a bounded,
 * concentrated change. Anything outside the adapter's thresholds is
 * `non-coherent` — the other categories are later slices.
 */
export function classifyPr(
  meta: DiffMetadata,
  thresholds: ClassifierThresholds,
): PrCategory {
  if (meta.files.length > thresholds.maxFiles) return "non-coherent";

  const linesChanged = meta.files.reduce(
    (sum, file) => sum + file.linesAdded + file.linesRemoved,
    0,
  );
  if (linesChanged > thresholds.maxLinesChanged) return "non-coherent";

  const modules = new Set(meta.files.map((file) => moduleOf(file.path)));
  if (modules.size > thresholds.maxModules) return "non-coherent";

  return "coherent";
}
