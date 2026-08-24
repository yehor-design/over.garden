import { describe, expect, it } from "vitest";

import {
  MEDIA_DERIVATIVE_REVOKE_KIND,
  MEDIA_STAGING_FINALIZE_KIND,
} from "@/server/job-queue-manifest";

describe("media lifecycle consumer contract", () => {
  it("owns final derivative revoke and atomic staging-finalize kinds", () => {
    expect(MEDIA_DERIVATIVE_REVOKE_KIND).toBe("media_derivative_revoke");
    expect(MEDIA_STAGING_FINALIZE_KIND).toBe("media_staging_finalize");
  });
});
