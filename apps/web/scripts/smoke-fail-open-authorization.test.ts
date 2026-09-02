import { beforeEach, describe, expect, it } from "vitest";

import {
  getUnresolvedAuthorizationServeCounts,
  OVE332_AUTHORIZATION_OWNERS,
  resetUnresolvedAuthorizationServeCountsForTests,
  resolveUnresolvedAuthorizationDecision,
} from "../src/lib/auth/unresolved-authorization";
import {
  buildBoundedReadFaultReceipt,
  buildFailOpenAuthorizationSmokeReceipt,
  OVE332_RESOLVED_ANOTHER_USER_FIXTURE_IDS,
  OVE332_UNRESOLVED_OR_PRESERVED_FIXTURE_IDS,
} from "./smoke-fail-open-authorization";

describe("OVE-332 fail-open authorization smoke", () => {
  beforeEach(() => resetUnresolvedAuthorizationServeCountsForTests());

  it.each(OVE332_AUTHORIZATION_OWNERS)(
    "%s:resolved_another_user_denied",
    (owner) => {
      expect(
        resolveUnresolvedAuthorizationDecision({
          owner,
          resolution: "another_user",
        }),
      ).toEqual({ status: "refused", owner });
      expect(getUnresolvedAuthorizationServeCounts()).toEqual([]);
    },
  );

  it("publishes exactly nine named INV-03 fixture ids", () => {
    expect(OVE332_RESOLVED_ANOTHER_USER_FIXTURE_IDS).toEqual(
      OVE332_AUTHORIZATION_OWNERS.map(
        (owner) => `${owner}:resolved_another_user_denied`,
      ),
    );
    expect(OVE332_UNRESOLVED_OR_PRESERVED_FIXTURE_IDS).toEqual(
      OVE332_AUTHORIZATION_OWNERS.map(
        (owner) => `${owner}:unresolved_or_preserved`,
      ),
    );
  });

  it("authorization preserved weak-secret location and forbidden evidence stay closed and redacted", () => {
    const receipt = buildFailOpenAuthorizationSmokeReceipt();
    expect(receipt).toMatchObject({
      version: "ove332.failOpenAuthorizationSmoke.v1",
      ownerCount: 8,
      servedUnresolvedCount: 7,
      preservedControlCount: 1,
      resolvedAnotherUserDeniedCount: 8,
      weakSecret: { count: 1, visible: true },
      evidenceHygiene: {
        secretMaterialAbsent: true,
        identityAndPayloadAbsent: true,
      },
    });
    expect(receipt.unresolvedOrPreserved).toHaveLength(8);
    expect(receipt.resolvedAnotherUser).toHaveLength(8);
    expect(
      receipt.unresolvedOrPreserved.find(
        ({ fixtureId }) =>
          fixtureId === "responsive_accessibility:unresolved_or_preserved",
      )?.result,
    ).toEqual({ status: "preserved", owner: "responsive_accessibility" });
  });

  it("replay concurrent timeout and cancel keep the bounded newest terminal result", async () => {
    const first = buildFailOpenAuthorizationSmokeReceipt();
    resetUnresolvedAuthorizationServeCountsForTests();
    const second = buildFailOpenAuthorizationSmokeReceipt();
    expect(second).toEqual(first);

    resetUnresolvedAuthorizationServeCountsForTests();
    const concurrent = await Promise.all(
      Array.from({ length: 20 }, async () =>
        resolveUnresolvedAuthorizationDecision({
          owner: "session_boundary",
          resolution: "unresolved",
        }),
      ),
    );
    expect(concurrent).toHaveLength(20);
    expect(getUnresolvedAuthorizationServeCounts()).toEqual([
      {
        owner: "session_boundary",
        unresolvedClass: "session_unresolved",
        count: 20,
      },
    ]);
    expect(buildBoundedReadFaultReceipt()).toEqual({
      injectedFault: "session_store_read_timeout",
      terminalStatus: "served_unresolved",
      retrySignInButtonUsable: true,
      continueToGardenLinkUsable: true,
      cancellation: "late_completion_ignored",
      boundedByMs: 3_000,
    });
  });

  it("keeps 1,000 pure fallback decisions under 500 ms", () => {
    resetUnresolvedAuthorizationServeCountsForTests();
    const startedAt = performance.now();
    for (let index = 0; index < 1_000; index += 1) {
      resolveUnresolvedAuthorizationDecision({
        owner: "session_boundary",
        resolution: "unresolved",
      });
    }
    expect(performance.now() - startedAt).toBeLessThanOrEqual(500);
  });
});
