import { describe, expect, it } from "vitest";

import { scopedToUser } from "@/server/request-scope";
import { resolveFounderInterviewOperatorAccess } from "./founder-interview-access";

describe("founder interview operator access", () => {
  it("requires authentication before interview capture readback", () => {
    expect(resolveFounderInterviewOperatorAccess(null)).toEqual({
      status: "sign_in_required",
    });
  });

  it("denies authenticated users when no operator allowlist exists", () => {
    expect(
      resolveFounderInterviewOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        "",
      ),
    ).toEqual({ status: "denied" });
  });

  it("denies authenticated users outside a configured operator allowlist", () => {
    expect(
      resolveFounderInterviewOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        "00000000-0000-0000-0000-000000000002",
      ),
    ).toEqual({ status: "denied" });
  });

  it("allows authenticated users inside a configured operator allowlist", () => {
    expect(
      resolveFounderInterviewOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
        "00000000-0000-0000-0000-000000000001",
      ),
    ).toEqual({ status: "allowed", mode: "allowlist" });
  });
});
