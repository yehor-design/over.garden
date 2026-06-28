import { describe, expect, it } from "vitest";

import { scopedToUser } from "@/server/request-scope";
import { resolveErasureRequestOperatorAccess } from "./erasure-request-access";

describe("erasure request operator access", () => {
  it("requires authentication before operator request readback", () => {
    expect(resolveErasureRequestOperatorAccess(null)).toEqual({
      status: "sign_in_required",
    });
  });

  it("denies authenticated users when no operator allowlist exists", () => {
    expect(
      resolveErasureRequestOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        "",
      ),
    ).toEqual({ status: "denied" });
  });

  it("denies authenticated users outside a configured operator allowlist", () => {
    expect(
      resolveErasureRequestOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        "00000000-0000-0000-0000-000000000002",
      ),
    ).toEqual({ status: "denied" });
  });

  it("allows authenticated users inside a configured operator allowlist", () => {
    expect(
      resolveErasureRequestOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        "00000000-0000-0000-0000-000000000001",
      ),
    ).toEqual({ status: "allowed", mode: "allowlist" });
  });
});
