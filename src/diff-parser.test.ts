import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "./diff-parser.js";

describe("parseUnifiedDiff", () => {
  it("parses a unified diff with one file and one hunk", () => {
    const patch = [
      "diff --git a/src/auth/login.ts b/src/auth/login.ts",
      "--- a/src/auth/login.ts",
      "+++ b/src/auth/login.ts",
      "@@ -1,2 +1,3 @@",
      " const existing = 1;",
      "+const added = 2;",
      " const trailing = 3;",
      "",
    ].join("\n");

    const diff = parseUnifiedDiff(patch);

    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]?.path).toBe("src/auth/login.ts");
    expect(diff.files[0]?.hunks).toHaveLength(1);
    expect(diff.files[0]?.hunks[0]?.header).toBe("@@ -1,2 +1,3 @@");
    expect(diff.files[0]?.hunks[0]?.lines).toEqual([
      " const existing = 1;",
      "+const added = 2;",
      " const trailing = 3;",
    ]);
  });
});
