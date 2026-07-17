import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SMOKE_FILES = ["smoke-admin-role.ts", "smoke-canonical-launch.ts"];

describe("admin owner smoke identity contract", () => {
  it.each(SMOKE_FILES)(
    "%s proves the verified password credential instead of provider name alone",
    (filename) => {
      const source = readFileSync(
        path.join(process.cwd(), "scripts", filename),
        "utf8",
      );

      expect(source).toContain("buildVerifiedOwnerAccountEvidence");
      expect(source).toContain('.select("emailVerified")');
      expect(source).toContain('.select(["providerId", "password"])');
    },
  );
});
