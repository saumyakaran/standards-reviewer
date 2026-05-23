import { describe, it, expect } from "vitest";
import { parseChunkReviewOutput } from "./parser.js";

describe("parseChunkReviewOutput", () => {
  it("parses a well-formed JSON array of findings", () => {
    const raw = JSON.stringify([
      {
        file: "src/auth/login.ts",
        line: 12,
        standard: "naming/camelCase",
        message: "Use camelCase for local variables.",
        confidence: "HIGH",
      },
    ]);

    const result = parseChunkReviewOutput(raw);

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([
      {
        file: "src/auth/login.ts",
        line: 12,
        standard: "naming/camelCase",
        message: "Use camelCase for local variables.",
        confidence: "HIGH",
      },
    ]);
  });

  it("parses output wrapped in a json code fence", () => {
    const findings = [
      {
        file: "src/billing/invoice.ts",
        line: 7,
        standard: "adr/0003-no-floats-for-money",
        message: "Use integer cents for monetary amounts.",
        confidence: "PARTIAL",
      },
    ];
    const raw = "```json\n" + JSON.stringify(findings) + "\n```";

    const result = parseChunkReviewOutput(raw);

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.standard).toBe("adr/0003-no-floats-for-money");
  });

  it("returns no findings for an empty array", () => {
    const result = parseChunkReviewOutput("[]");

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("degrades gracefully on malformed, non-JSON output", () => {
    const result = parseChunkReviewOutput("I could not find any standards violations.");

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("extracts the last JSON code fence from arbitrary surrounding text", () => {
    const raw = [
      "Let me look at this diff carefully.",
      "",
      "```json",
      "[]",
      "```",
      "",
      "Actually, on a second pass, here are the real findings:",
      "",
      "```json",
      JSON.stringify([
        {
          file: "src/auth/login.ts",
          line: 1,
          standard: "naming/camelCase",
          message: "Use camelCase.",
          confidence: "HIGH",
        },
      ]),
      "```",
      "",
      "Done.",
    ].join("\n");

    const result = parseChunkReviewOutput(raw);

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("src/auth/login.ts");
  });

  it("drops a finding missing a required field and flags the output as degraded", () => {
    const raw = JSON.stringify([
      {
        file: "src/auth/login.ts",
        line: 1,
        standard: "naming/camelCase",
        message: "Valid finding.",
        confidence: "HIGH",
      },
      // Missing `message` — the model produced an incomplete finding.
      { file: "src/auth/session.ts", line: 2, standard: "naming/camelCase", confidence: "LOW" },
    ]);

    const result = parseChunkReviewOutput(raw);

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("src/auth/login.ts");
  });
});
