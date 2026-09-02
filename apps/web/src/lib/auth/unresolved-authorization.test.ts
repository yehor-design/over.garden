import { beforeEach, describe, expect, it } from "vitest";

import {
  getUnresolvedAuthorizationServeCounts,
  OVE332_AUTHORIZATION_OWNERS,
  OVE332_CONVERTIBLE_AUTHORIZATION_OWNERS,
  OVE332_UNRESOLVED_CLASSES,
  recordUnresolvedAuthorizationServe,
  resetUnresolvedAuthorizationServeCountsForTests,
  resolveUnresolvedAuthorizationDecision,
} from "./unresolved-authorization";

describe("OVE-332 unresolved authorization contract", () => {
  beforeEach(() => resetUnresolvedAuthorizationServeCountsForTests());

  it("exports the closed five-class and eight-owner contract", () => {
    expect(OVE332_UNRESOLVED_CLASSES).toEqual([
      "session_unresolved",
      "ownership_unresolved",
      "provider_link_unverified",
      "weak_secret",
      "proxy_ambiguous",
    ]);
    expect(OVE332_AUTHORIZATION_OWNERS).toHaveLength(8);
    expect(OVE332_CONVERTIBLE_AUTHORIZATION_OWNERS).toHaveLength(7);
    expect(OVE332_CONVERTIBLE_AUTHORIZATION_OWNERS).not.toContain(
      "responsive_accessibility",
    );
  });

  it("returns a frozen redacted receipt and counts each served decision once", () => {
    const receipt = recordUnresolvedAuthorizationServe(
      "auth_secret",
      "weak_secret",
    );

    expect(receipt).toEqual({
      version: "ove332.unresolvedClass.v1",
      status: "served_unresolved",
      owner: "auth_secret",
      unresolvedClass: "weak_secret",
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(getUnresolvedAuthorizationServeCounts()).toEqual([
      { owner: "auth_secret", unresolvedClass: "weak_secret", count: 1 },
    ]);
    expect(JSON.stringify(receipt)).not.toMatch(
      /cookie|credential|email|exception|identity|location|sessionBinding|token|url/i,
    );
  });

  it("rejects an owner/class mismatch and never counts the preserved owner", () => {
    expect(() =>
      recordUnresolvedAuthorizationServe("auth_secret", "session_unresolved"),
    ).toThrow(/owner class mismatch/i);
    expect(
      resolveUnresolvedAuthorizationDecision({
        owner: "responsive_accessibility",
        resolution: "unresolved",
      }),
    ).toEqual({
      status: "preserved",
      owner: "responsive_accessibility",
    });
    expect(getUnresolvedAuthorizationServeCounts()).toEqual([]);
  });
});
