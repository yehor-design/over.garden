import { describe, expect, it } from "vitest";

import { scopedToUser } from "@/server/request-scope";
import { resolvePilotHealthOperatorAccess } from "./pilot-health-access";

describe("pilot health operator access", () => {
  it("requires sign-in before the health readout is visible", () => {
    expect(resolvePilotHealthOperatorAccess(null)).toEqual({
      status: "sign_in_required",
    });
  });

  it("denies authenticated users while the allowlist is empty", () => {
    const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

    expect(resolvePilotHealthOperatorAccess(scope, "")).toEqual({
      status: "denied",
    });
  });

  it("denies authenticated users who are outside a configured allowlist", () => {
    const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

    expect(
      resolvePilotHealthOperatorAccess(
        scope,
        "00000000-0000-0000-0000-000000000002",
      ),
    ).toEqual({ status: "denied" });
  });

  it("allows authenticated users inside a configured allowlist", () => {
    const scope = scopedToUser("00000000-0000-0000-0000-000000000001");

    expect(
      resolvePilotHealthOperatorAccess(
        scope,
        "00000000-0000-0000-0000-000000000001",
      ),
    ).toEqual({ status: "allowed", mode: "allowlist" });
  });
});
