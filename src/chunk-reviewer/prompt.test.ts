import { describe, it, expect } from "vitest";
import { assemblePrompt } from "./prompt.js";
import type { DiffChunk } from "../domain/types.js";

const chunk: DiffChunk = {
  files: [
    {
      path: "src/auth/login.ts",
      hunks: [
        {
          header: "@@ -1,1 +1,2 @@",
          lines: ["+const Token = mint();", " return Token;"],
        },
      ],
    },
  ],
};

describe("assemblePrompt", () => {
  it("includes the consuming project's standards verbatim", () => {
    const prompt = assemblePrompt(chunk, "Use camelCase for local variables.");

    expect(prompt).toContain("Use camelCase for local variables.");
  });

  it("includes every file path and hunk line from the chunk", () => {
    const prompt = assemblePrompt(chunk, "...");

    expect(prompt).toContain("src/auth/login.ts");
    expect(prompt).toContain("@@ -1,1 +1,2 @@");
    expect(prompt).toContain("+const Token = mint();");
  });

  it("instructs the model to emit a JSON array of findings", () => {
    const prompt = assemblePrompt(chunk, "...");

    expect(prompt.toLowerCase()).toContain("json");
    expect(prompt).toContain("file");
    expect(prompt).toContain("line");
    expect(prompt).toContain("standard");
    expect(prompt).toContain("message");
    expect(prompt).toContain("confidence");
  });
});
