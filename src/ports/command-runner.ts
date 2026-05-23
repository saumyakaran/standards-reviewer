/**
 * Port for shelling out to external commands. Production wraps `child_process`;
 * tests inject a recording fake so no real process ever runs.
 */

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandRunner {
  run(command: string, args: readonly string[]): Promise<CommandResult>;
}
