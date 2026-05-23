import { describe, it, expect } from "vitest";
import { parseCli, usageMessage } from "./cli.js";

describe("parseCli", () => {
  it("parses a bare PR ref", () => {
    expect(parseCli(["42"])).toEqual({ kind: "pr", prRef: "42", check: false });
  });

  it("parses a PR ref with --standards", () => {
    expect(parseCli(["42", "--standards", "S.md"])).toEqual({
      kind: "pr",
      prRef: "42",
      standards: "S.md",
      check: false,
    });
  });

  it("parses --standards before the PR ref", () => {
    expect(parseCli(["--standards", "S.md", "42"])).toEqual({
      kind: "pr",
      prRef: "42",
      standards: "S.md",
      check: false,
    });
  });

  it("parses --diff with a patch path", () => {
    expect(parseCli(["--diff", "patch.diff"])).toEqual({
      kind: "diff",
      patchPath: "patch.diff",
      check: false,
    });
  });

  it("parses --diff combined with --standards", () => {
    expect(parseCli(["--diff", "p.diff", "--standards", "S.md"])).toEqual({
      kind: "diff",
      patchPath: "p.diff",
      standards: "S.md",
      check: false,
    });
  });

  it("parses --check alone", () => {
    expect(parseCli(["--check"])).toEqual({ kind: "check-only" });
  });

  it("parses --check with --standards", () => {
    expect(parseCli(["--check", "--standards", "S.md"])).toEqual({
      kind: "check-only",
      standards: "S.md",
    });
  });

  it("parses --check combined with a PR ref (run preflight, then review)", () => {
    expect(parseCli(["42", "--check"])).toEqual({ kind: "pr", prRef: "42", check: true });
  });

  it("returns usage-error on empty argv", () => {
    const result = parseCli([]);
    expect(result.kind).toBe("usage-error");
  });

  it("returns usage-error when --standards has no value", () => {
    expect(parseCli(["42", "--standards"])).toEqual({
      kind: "usage-error",
      message: "--standards requires a path argument",
    });
  });

  it("returns usage-error when --diff has no value", () => {
    expect(parseCli(["--diff"])).toEqual({
      kind: "usage-error",
      message: "--diff requires a path argument",
    });
  });

  it("returns usage-error on an unknown flag", () => {
    expect(parseCli(["42", "--banana"])).toEqual({
      kind: "usage-error",
      message: "unknown flag: --banana",
    });
  });

  it("returns usage-error when both --diff and a PR ref are given", () => {
    expect(parseCli(["42", "--diff", "p.diff"]).kind).toBe("usage-error");
  });

  it("returns usage-error on two positional refs", () => {
    expect(parseCli(["42", "43"]).kind).toBe("usage-error");
  });

  it("usageMessage names all three modes", () => {
    const msg = usageMessage();
    expect(msg).toMatch(/<pr-ref>/);
    expect(msg).toMatch(/--diff/);
    expect(msg).toMatch(/--check/);
    expect(msg).toMatch(/--standards/);
  });
});
