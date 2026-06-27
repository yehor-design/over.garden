import { describe, expect, it } from "vitest";

import { scopedToUser } from "@/server/request-scope";
import { resolveErasureRequestOperatorAccess } from "./erasure-request-access";

describe("erasure request operator access", () => {
  it("requires authentication before operator request readback", () => {
    expect(resolveErasureRequestOperatorAccess(null)).toEqual({
      status: "sign_in_required",
    });
  });

  it("reuses the temporary authenticated-user operator gate when no allowlist exists", () => {
    expect(
      resolveErasureRequestOperatorAccess(
        scopedToUser("00000000-0000-0000-0000-000000000001"),
      ),
    ).toEqual({ status: "allowed", mode: "authenticated_user" });
  });
});
