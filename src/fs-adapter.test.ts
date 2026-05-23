import { describe, it, expect } from "vitest";
import { fsAdapter, DEFAULT_THRESHOLDS } from "./fs-adapter.js";

describe("fsAdapter", () => {
  it("loadStandards returns the content the reader returns", async () => {
    const adapter = fsAdapter({
      standardsPath: "/repo/STANDARDS.md",
      read: async (path) => `content of ${path}`,
    });
    expect(await adapter.loadStandards()).toBe("content of /repo/STANDARDS.md");
  });

  it("exposes the default thresholds when none are supplied", () => {
    const adapter = fsAdapter({ standardsPath: "x", read: async () => "" });
    expect(adapter.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it("merges a partial thresholds override with defaults", () => {
    const adapter = fsAdapter({
      standardsPath: "x",
      thresholds: { maxFiles: 25 },
      read: async () => "",
    });
    expect(adapter.thresholds).toEqual({
      maxFiles: 25,
      maxLinesChanged: DEFAULT_THRESHOLDS.maxLinesChanged,
      maxModules: DEFAULT_THRESHOLDS.maxModules,
    });
  });

  it("propagates errors from the reader", async () => {
    const adapter = fsAdapter({
      standardsPath: "x",
      read: async () => {
        throw new Error("ENOENT");
      },
    });
    await expect(adapter.loadStandards()).rejects.toThrow(/ENOENT/);
  });
});
