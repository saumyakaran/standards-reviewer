/**
 * Validate a PR reference before it crosses the boundary into argv for `gh`.
 *
 * gh accepts a PR number, a PR URL, or a branch ref. None of these legitimate
 * shapes begin with `-`, contain whitespace, or contain control characters,
 * so a value that does is either a user mistake or an attempt to inject a
 * flag into the command we're about to spawn. We refuse early with a clear
 * message rather than passing the value through.
 */
export function validatePrRef(input: string): string {
  if (input.length === 0) {
    throw new Error("prRef is empty — expected a PR number, URL, or branch ref");
  }
  if (input.startsWith("-")) {
    throw new Error(
      `prRef "${input}" starts with a dash — refusing to pass it to gh as a flag`,
    );
  }
  if (/\s/.test(input)) {
    throw new Error(`prRef "${input}" contains whitespace — expected a single token`);
  }
  // Control characters not already caught by \s above: NUL..BS, SO..US, DEL.
  if (/[\x00-\x08\x0e-\x1f\x7f]/.test(input)) {
    throw new Error(`prRef contains a control character — refusing to pass it to gh`);
  }
  return input;
}
