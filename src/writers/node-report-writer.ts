import { writeFile } from "node:fs/promises";
import type { ReportWriter } from "../ports/report-writer.js";

/**
 * Production ReportWriter: writes to process.stdout and the real filesystem.
 * Not unit-tested — the testable layer uses a recording fake.
 */
export const nodeReportWriter: ReportWriter = {
  writeStdout(text) {
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  },
  async writeFile(path, text) {
    await writeFile(path, text, "utf8");
  },
};
