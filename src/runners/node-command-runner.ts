import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";
import type { CommandResult, CommandRunner } from "../ports/command-runner.js";

/**
 * When a child is killed by a signal, `close` fires with code=null and signal
 * set; mapping that to 0 (success) hides real failures from callers. Mirror
 * the POSIX shell convention of `128 + signal_number` so a non-zero exitCode
 * propagates.
 */
function exitCodeFor(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code;
  if (signal !== null) {
    const signo = (osConstants.signals as Record<string, number | undefined>)[signal];
    return 128 + (signo ?? 0);
  }
  return 1; // unknown termination; surface as failure rather than success
}

/**
 * Production CommandRunner: spawns the child process and buffers its output.
 * The only direct test is the close-event shape (signal vs exit code) — the
 * business logic that consumes CommandResult is exercised via fakes.
 */
export const nodeCommandRunner: CommandRunner = {
  run(command, args) {
    return new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code, signal) => {
        resolve({ stdout, stderr, exitCode: exitCodeFor(code, signal) });
      });
    });
  },
};
