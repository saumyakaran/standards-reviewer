/**
 * Port for emitting the rendered report when there is no PR to publish to.
 *
 * Production writes to process.stdout and the real filesystem; tests inject
 * a recording fake so the orchestrator can be exercised without side effects.
 */
export interface ReportWriter {
  writeStdout(text: string): void;
  writeFile(path: string, text: string): Promise<void>;
}
