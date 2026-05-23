import { readFile } from "node:fs/promises";
import type { Adapter } from "./adapter.js";
import type { ClassifierThresholds } from "./domain/types.js";

/**
 * Defaults inherited from the original fixtureAdapter (maxFiles=10,
 * maxLinesChanged=400, maxModules=2). Tuned for the "coherent PR" band that
 * the classifier is built around. Consumers override piecewise via
 * `.standards-reviewer.json`'s `thresholds` field.
 */
export const DEFAULT_THRESHOLDS: ClassifierThresholds = {
  maxFiles: 10,
  maxLinesChanged: 400,
  maxModules: 2,
};

export interface FsAdapterOptions {
  standardsPath: string;
  thresholds?: Partial<ClassifierThresholds>;
  /** Injected for tests; production uses node:fs. */
  read?: (path: string) => Promise<string>;
}

/**
 * Adapter that reads a consuming repo's standards file at review time.
 *
 * Replaces the use of `fixtureAdapter` in production wiring. The `Adapter`
 * interface in `adapter.ts` is unchanged; only the wiring site changes.
 */
export function fsAdapter(options: FsAdapterOptions): Adapter {
  const read = options.read ?? ((path) => readFile(path, "utf8"));
  const thresholds: ClassifierThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(options.thresholds ?? {}),
  };
  return {
    thresholds,
    async loadStandards() {
      return await read(options.standardsPath);
    },
  };
}
