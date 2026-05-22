import { describe, it, expect } from "vitest";
import { classifyPr } from "./classifier.js";
import type { ClassifierThresholds, DiffMetadata } from "./domain/types.js";

const thresholds: ClassifierThresholds = {
  maxFiles: 10,
  maxLinesChanged: 400,
  maxModules: 2,
};

describe("classifyPr", () => {
  it("classifies a small, single-module diff as coherent", () => {
    const meta: DiffMetadata = {
      files: [
        { path: "src/auth/login.ts", linesAdded: 12, linesRemoved: 3 },
        { path: "src/auth/session.ts", linesAdded: 8, linesRemoved: 1 },
      ],
    };

    expect(classifyPr(meta, thresholds)).toBe("coherent");
  });

  it("classifies a diff exceeding the line budget as non-coherent", () => {
    const meta: DiffMetadata = {
      files: [{ path: "src/auth/login.ts", linesAdded: 300, linesRemoved: 150 }],
    };

    expect(classifyPr(meta, thresholds)).toBe("non-coherent");
  });

  it("classifies a diff touching too many files as non-coherent", () => {
    const meta: DiffMetadata = {
      files: Array.from({ length: 11 }, (_, i) => ({
        path: `src/auth/file${i}.ts`,
        linesAdded: 1,
        linesRemoved: 0,
      })),
    };

    expect(classifyPr(meta, thresholds)).toBe("non-coherent");
  });

  it("classifies a diff spanning too many modules as non-coherent", () => {
    const meta: DiffMetadata = {
      files: [
        { path: "src/auth/login.ts", linesAdded: 5, linesRemoved: 0 },
        { path: "src/billing/invoice.ts", linesAdded: 5, linesRemoved: 0 },
        { path: "src/notifications/email.ts", linesAdded: 5, linesRemoved: 0 },
      ],
    };

    expect(classifyPr(meta, thresholds)).toBe("non-coherent");
  });

  it("treats a diff exactly at every threshold as coherent (inclusive bounds)", () => {
    // 10 files (= maxFiles), 2 modules (= maxModules), 400 lines (= maxLinesChanged).
    const meta: DiffMetadata = {
      files: Array.from({ length: 10 }, (_, i) => ({
        path: `src/${i < 5 ? "a" : "b"}/file${i}.ts`,
        linesAdded: 40,
        linesRemoved: 0,
      })),
    };

    expect(classifyPr(meta, thresholds)).toBe("coherent");
  });
});
