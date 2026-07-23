import { describe, expect, it } from "vitest";

import {
  MEDIA_DERIVATIVE_REVOKE_KIND,
  MEDIA_QUARANTINE_EXPIRE_KIND,
} from "@/server/job-queue-manifest";

describe("media lifecycle consumer contract", () => {
  it("owns media_derivative_revoke and media_quarantine_expire kinds", () => {
    expect(MEDIA_DERIVATIVE_REVOKE_KIND).toBe("media_derivative_revoke");
    expect(MEDIA_QUARANTINE_EXPIRE_KIND).toBe("media_quarantine_expire");
  });
});
