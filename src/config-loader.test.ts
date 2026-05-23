import { describe, it, expect } from "vitest";
import { loadConfig } from "./config-loader.js";

function fakeReader(files: Record<string, string>): (path: string) => Promise<string | null> {
  return async (path) => (path in files ? files[path]! : null);
}

describe("loadConfig", () => {
  it("returns null when .standards-reviewer.json is absent", async () => {
    const result = await loadConfig("/repo", fakeReader({}));
    expect(result).toBeNull();
  });

  it("parses a valid config with standards + thresholds", async () => {
    const result = await loadConfig(
      "/repo",
      fakeReader({
        "/repo/.standards-reviewer.json": JSON.stringify({
          standards: "./docs/standards.md",
          thresholds: { maxFiles: 5, maxLinesChanged: 200, maxModules: 1 },
        }),
      }),
    );
    expect(result).toEqual({
      standards: "./docs/standards.md",
      thresholds: { maxFiles: 5, maxLinesChanged: 200, maxModules: 1 },
    });
  });

  it("parses a config with only standards", async () => {
    const result = await loadConfig(
      "/repo",
      fakeReader({ "/repo/.standards-reviewer.json": JSON.stringify({ standards: "./S.md" }) }),
    );
    expect(result).toEqual({ standards: "./S.md" });
  });

  it("parses a config with only a partial thresholds override", async () => {
    const result = await loadConfig(
      "/repo",
      fakeReader({
        "/repo/.standards-reviewer.json": JSON.stringify({ thresholds: { maxFiles: 20 } }),
      }),
    );
    expect(result).toEqual({ thresholds: { maxFiles: 20 } });
  });

  it("parses an empty object", async () => {
    const result = await loadConfig(
      "/repo",
      fakeReader({ "/repo/.standards-reviewer.json": "{}" }),
    );
    expect(result).toEqual({});
  });

  it("throws on invalid JSON", async () => {
    await expect(
      loadConfig("/repo", fakeReader({ "/repo/.standards-reviewer.json": "{not json" })),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("throws when the root is not an object", async () => {
    await expect(
      loadConfig("/repo", fakeReader({ "/repo/.standards-reviewer.json": "[]" })),
    ).rejects.toThrow(/must be a JSON object/i);
  });

  it("throws on unknown top-level keys", async () => {
    await expect(
      loadConfig(
        "/repo",
        fakeReader({ "/repo/.standards-reviewer.json": JSON.stringify({ banana: true }) }),
      ),
    ).rejects.toThrow(/unknown top-level key "banana"/);
  });

  it("throws on unknown threshold keys", async () => {
    await expect(
      loadConfig(
        "/repo",
        fakeReader({
          "/repo/.standards-reviewer.json": JSON.stringify({ thresholds: { maxThings: 3 } }),
        }),
      ),
    ).rejects.toThrow(/unknown thresholds key "maxThings"/);
  });

  it("throws on empty standards string", async () => {
    await expect(
      loadConfig(
        "/repo",
        fakeReader({ "/repo/.standards-reviewer.json": JSON.stringify({ standards: "" }) }),
      ),
    ).rejects.toThrow(/non-empty string/);
  });

  it("throws on non-string standards", async () => {
    await expect(
      loadConfig(
        "/repo",
        fakeReader({ "/repo/.standards-reviewer.json": JSON.stringify({ standards: 42 }) }),
      ),
    ).rejects.toThrow(/non-empty string/);
  });

  it("throws on non-positive threshold integers", async () => {
    await expect(
      loadConfig(
        "/repo",
        fakeReader({
          "/repo/.standards-reviewer.json": JSON.stringify({ thresholds: { maxFiles: 0 } }),
        }),
      ),
    ).rejects.toThrow(/positive integer/);
  });

  it("throws on float threshold values", async () => {
    await expect(
      loadConfig(
        "/repo",
        fakeReader({
          "/repo/.standards-reviewer.json": JSON.stringify({ thresholds: { maxFiles: 1.5 } }),
        }),
      ),
    ).rejects.toThrow(/positive integer/);
  });
});
