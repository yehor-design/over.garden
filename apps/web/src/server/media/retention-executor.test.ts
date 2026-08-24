import { describe, expect, it } from "vitest";

import { RETENTION_POLICY_VERSION } from "./retention-executor";

describe("retention executor policy", () => {
  it("pins the final-only retention version for dry-run and execute parity", () => {
    expect(RETENTION_POLICY_VERSION).toBe("ove349.retention.v2");
  });
});
