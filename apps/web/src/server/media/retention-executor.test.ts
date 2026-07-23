import { describe, expect, it } from "vitest";

import { RETENTION_POLICY_VERSION } from "./retention-executor";

describe("retention executor policy", () => {
  it("pins ove195.retention.v1 for dry-run and execute parity", () => {
    expect(RETENTION_POLICY_VERSION).toBe("ove195.retention.v1");
  });
});
