import { describe, it, expect } from "vitest";
import { resolveStandards } from "./standards-resolver.js";

function fakeFs(layout: Record<string, string[]>): {
  listDir: (path: string) => Promise<string[]>;
  exists: (path: string) => Promise<boolean>;
} {
  return {
    listDir: async (path) => layout[path] ?? [],
    exists: async (path) => {
      // A file exists if its parent directory lists it.
      const idx = path.lastIndexOf("/");
      if (idx < 0) return false;
      const dir = path.slice(0, idx);
      const name = path.slice(idx + 1);
      return (layout[dir] ?? []).includes(name);
    },
  };
}

describe("resolveStandards", () => {
  it("returns the --standards path when given and the file exists", async () => {
    const fs = fakeFs({ "/repo": ["custom.md"] });
    const result = await resolveStandards({
      cwd: "/repo",
      cliPath: "custom.md",
      ...fs,
    });
    expect(result).toEqual({ path: "custom.md", source: "cli" });
  });

  it("throws when the --standards path does not exist", async () => {
    const fs = fakeFs({ "/repo": [] });
    await expect(
      resolveStandards({ cwd: "/repo", cliPath: "nope.md", ...fs }),
    ).rejects.toThrow(/--standards path does not exist: nope.md/);
  });

  it("uses the config path when no CLI flag is given", async () => {
    const fs = fakeFs({ "/repo/engineering": ["handbook.md"] });
    const result = await resolveStandards({
      cwd: "/repo",
      configPath: "engineering/handbook.md",
      ...fs,
    });
    expect(result).toEqual({ path: "engineering/handbook.md", source: "config" });
  });

  it("throws when the config path does not exist", async () => {
    const fs = fakeFs({});
    await expect(
      resolveStandards({ cwd: "/repo", configPath: "missing.md", ...fs }),
    ).rejects.toThrow(/standards path from \.standards-reviewer\.json does not exist/);
  });

  it("discovers STANDARDS.md at the repo root", async () => {
    const fs = fakeFs({ "/repo": ["STANDARDS.md", "README.md"] });
    const result = await resolveStandards({ cwd: "/repo", ...fs });
    expect(result).toEqual({ path: "./STANDARDS.md", source: "discovery" });
  });

  it("discovers CODING_STANDARDS.md under .sandcastle/", async () => {
    const fs = fakeFs({ "/repo": [], "/repo/.sandcastle": ["CODING_STANDARDS.md"] });
    const result = await resolveStandards({ cwd: "/repo", ...fs });
    expect(result).toEqual({ path: "./.sandcastle/CODING_STANDARDS.md", source: "discovery" });
  });

  it("discovers coding-standards.md under docs/agents/", async () => {
    const fs = fakeFs({
      "/repo": [],
      "/repo/.sandcastle": [],
      "/repo/docs/agents": ["coding-standards.md"],
    });
    const result = await resolveStandards({ cwd: "/repo", ...fs });
    expect(result).toEqual({
      path: "./docs/agents/coding-standards.md",
      source: "discovery",
    });
  });

  it("discovers coding_standards.md under docs/", async () => {
    const fs = fakeFs({ "/repo/docs": ["coding_standards.md"] });
    const result = await resolveStandards({ cwd: "/repo", ...fs });
    expect(result).toEqual({ path: "./docs/coding_standards.md", source: "discovery" });
  });

  it("matches case-insensitively", async () => {
    const fs = fakeFs({ "/repo": ["Standards.md"] });
    const result = await resolveStandards({ cwd: "/repo", ...fs });
    expect(result).toEqual({ path: "./Standards.md", source: "discovery" });
  });

  it("prefers the root over .sandcastle (precedence)", async () => {
    const fs = fakeFs({
      "/repo": ["STANDARDS.md"],
      "/repo/.sandcastle": ["CODING_STANDARDS.md"],
    });
    const result = await resolveStandards({ cwd: "/repo", ...fs });
    expect(result.path).toBe("./STANDARDS.md");
  });

  it("prefers .sandcastle over docs/agents (precedence)", async () => {
    const fs = fakeFs({
      "/repo": [],
      "/repo/.sandcastle": ["STANDARDS.md"],
      "/repo/docs/agents": ["STANDARDS.md"],
    });
    const result = await resolveStandards({ cwd: "/repo", ...fs });
    expect(result.path).toBe("./.sandcastle/STANDARDS.md");
  });

  it("throws when a single directory contains more than one match", async () => {
    const fs = fakeFs({
      "/repo/.sandcastle": ["STANDARDS.md", "CODING_STANDARDS.md"],
    });
    await expect(
      resolveStandards({ cwd: "/repo", ...fs }),
    ).rejects.toThrow(/Found multiple standards files in \.\/\.sandcastle\/.*CODING_STANDARDS\.md, STANDARDS\.md/);
  });

  it("ignores files that don't match the regex (e.g. standards-notes.md)", async () => {
    const fs = fakeFs({ "/repo": ["standards-notes.md", "release-standards-2024.md"] });
    await expect(resolveStandards({ cwd: "/repo", ...fs })).rejects.toThrow(/No standards file found/);
  });

  it("throws a helpful 'not found' message listing all searched directories", async () => {
    const fs = fakeFs({});
    await expect(resolveStandards({ cwd: "/repo", ...fs })).rejects.toThrow(/Searched.*\.\/.*\.\/\.sandcastle\/.*\.\/docs\/agents\/.*\.\/docs\//s);
  });

  it("CLI path takes precedence over config path", async () => {
    const fs = fakeFs({ "/repo": ["from-cli.md", "from-config.md"] });
    const result = await resolveStandards({
      cwd: "/repo",
      cliPath: "from-cli.md",
      configPath: "from-config.md",
      ...fs,
    });
    expect(result.source).toBe("cli");
    expect(result.path).toBe("from-cli.md");
  });
});
