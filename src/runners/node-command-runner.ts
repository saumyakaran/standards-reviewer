import { spawn } from "node:child_process";
import type { CommandResult, CommandRunner } from "../ports/command-runner.js";

/**
 * Production CommandRunner: spawns the child process and buffers its output.
 * Not unit-tested — the testable layer uses a fake. Smoke-tested by running
 * the CLI against a real PR.
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
      child.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  },
};
