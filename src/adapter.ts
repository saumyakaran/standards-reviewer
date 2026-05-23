import type { ClassifierThresholds } from "./domain/types.js";

/**
 * Contract between the harness and a consuming project.
 *
 * An Adapter says where a project's coding standards live and what counts as
 * a coherent PR there. The harness itself ships a `fixtureAdapter` for its
 * own tests; a consuming repo wires its own (e.g. a file-system adapter).
 *
 * `loadStandards` is async and abstract over the source so adapters can load
 * from disk, a remote URL, or any other place without leaking I/O concerns
 * into the harness core.
 */
export interface Adapter {
  thresholds: ClassifierThresholds;
  /** Return the consuming project's coding standards as a single markdown blob. */
  loadStandards(): Promise<string>;
}

/**
 * Fixture adapter — used by the harness's own tests and as a runnable example
 * when there is no consuming project's adapter to wire in.
 */
export const fixtureAdapter: Adapter = {
  thresholds: {
    maxFiles: 10,
    maxLinesChanged: 400,
    maxModules: 2,
  },
  async loadStandards() {
    return [
      "# Standards (fixture)",
      "",
      "- Use camelCase for local variables and function names.",
      "- Use integer cents for monetary amounts; no floats for money (ADR-0003).",
      "- Public functions live in `src/**`; tests are colocated as `*.test.ts`.",
    ].join("\n");
  },
};
