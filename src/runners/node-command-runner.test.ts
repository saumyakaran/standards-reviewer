import { describe, it, expect } from "vitest";
import { nodeCommandRunner } from "./node-command-runner.js";

describe("nodeCommandRunner", () => {
  it("surfaces a non-zero exitCode when the child is killed by a signal", async () => {
    // Self-terminating child: process.kill on its own pid forces an exit via
    // signal, so the `close` event fires with code=null + signal='SIGTERM'.
    const result = await nodeCommandRunner.run("node", [
      "-e",
      "process.kill(process.pid, 'SIGTERM');",
    ]);

    expect(result.exitCode).not.toBe(0);
  });

  it("returns the child's natural exit code when it exits normally", async () => {
    const ok = await nodeCommandRunner.run("node", ["-e", "process.exit(0);"]);
    expect(ok.exitCode).toBe(0);

    const fail = await nodeCommandRunner.run("node", ["-e", "process.exit(7);"]);
    expect(fail.exitCode).toBe(7);
  });
});
