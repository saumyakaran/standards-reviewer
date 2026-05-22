import { describe, it, expect } from "vitest";
import { partitionDiff } from "./partitioner.js";
import type { Diff } from "./domain/types.js";

const coherentDiff: Diff = {
  files: [
    {
      path: "src/auth/login.ts",
      hunks: [{ header: "@@ -1,3 +1,5 @@", lines: ["+const token = mint();", " return token;"] }],
    },
    {
      path: "src/auth/session.ts",
      hunks: [{ header: "@@ -10,2 +10,3 @@", lines: ["+import { mint } from './login';"] }],
    },
  ],
};

describe("partitionDiff", () => {
  it("partitions a coherent diff into a single chunk", () => {
    expect(partitionDiff(coherentDiff)).toHaveLength(1);
  });

  it("preserves every file and hunk in the single chunk", () => {
    const [chunk] = partitionDiff(coherentDiff);
    expect(chunk?.files).toEqual(coherentDiff.files);
  });

  it("yields a single empty chunk for an empty diff", () => {
    expect(partitionDiff({ files: [] })).toEqual([{ files: [] }]);
  });
});
