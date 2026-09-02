import { describe, expect, it } from "vitest";

import {
  ADMIN_MENU_LOCALES,
  ADMIN_MENU_VISIBILITY_RECEIPT_VERSION,
  EXPECTED_ACCOUNT_MODERATION_PATHS,
  EXPECTED_OPERATOR_MENU_LINKS,
  RETIRED_ADMIN_PATH_PROBES,
  createAdminRoleResolutionCheck,
  evaluateAdminMenuContract,
} from "./verify-admin-menu-visibility-runner";

const localeLinkSets = Object.fromEntries(
  ADMIN_MENU_LOCALES.map((locale) => [locale, EXPECTED_OPERATOR_MENU_LINKS]),
);
const retiredRouteStatuses = Object.fromEntries(
  RETIRED_ADMIN_PATH_PROBES.map((path) => [path, 404]),
);

describe("OVE-338 admin-inside-account contract", () => {
  it("accepts the sealed owner with exactly four localized account-menu links", () => {
    const receipt = evaluateAdminMenuContract({
      actorClass: "sealed_owner",
      accessStatus: "allowed",
      links: EXPECTED_OPERATOR_MENU_LINKS,
      localeLinkSets,
      retiredRouteStatuses,
      reachableAccountPaths: EXPECTED_ACCOUNT_MODERATION_PATHS,
      queueReadCount: 1,
      mutationCount: 1,
      durationMs: 40,
      evidence: {},
    });

    expect(receipt).toMatchObject({
      version: ADMIN_MENU_VISIBILITY_RECEIPT_VERSION,
      status: "aligned",
      actorClass: "sealed_owner",
      linkCount: 4,
      localeCount: 3,
      accountPathCount: 3,
      violations: [],
    });
    expect(receipt.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    "guest",
    "ordinary",
    "social_linked",
    "non_sealed",
    "missing",
    "denied",
    "timed_out",
    "cancelled",
  ] as const)(
    "keeps %s actors outside owner links and effects",
    (actorClass) => {
      const receipt = evaluateAdminMenuContract({
        actorClass,
        accessStatus:
          actorClass === "timed_out" || actorClass === "cancelled"
            ? actorClass
            : "denied",
        links: [],
        localeLinkSets: { uk: [], bg: [], ru: [] },
        retiredRouteStatuses,
        reachableAccountPaths: [],
        queueReadCount: 0,
        mutationCount: 0,
        durationMs: actorClass === "timed_out" ? 250 : 1,
        evidence: {},
      });

      expect(receipt.status).toBe(
        actorClass === "timed_out" || actorClass === "cancelled"
          ? actorClass
          : "aligned",
      );
      expect(receipt.linkCount).toBe(0);
      expect(receipt.queueReadCount).toBe(0);
      expect(receipt.mutationCount).toBe(0);
    },
  );

  it("fails the contract when any retired admin representation survives", () => {
    const receipt = evaluateAdminMenuContract({
      actorClass: "guest",
      accessStatus: "denied",
      links: [],
      localeLinkSets: { uk: [], bg: [], ru: [] },
      retiredRouteStatuses: {
        ...retiredRouteStatuses,
        "/admin/communities": 200,
      },
      reachableAccountPaths: [],
      queueReadCount: 0,
      mutationCount: 0,
      durationMs: 1,
      evidence: {},
    });

    expect(receipt.status).toBe("contract_drift");
    expect(receipt.violations).toContain("retired_admin_path_not_404");
  });

  it("rejects identity fields and precise location from aggregate evidence", () => {
    const receipt = evaluateAdminMenuContract({
      actorClass: "guest",
      accessStatus: "denied",
      links: [],
      localeLinkSets: { uk: [], bg: [], ru: [] },
      retiredRouteStatuses,
      reachableAccountPaths: [],
      queueReadCount: 0,
      mutationCount: 0,
      durationMs: 1,
      evidence: {
        userId: "private-actor",
        note: "latitude: 50.4501, longitude: 30.5234",
      },
    });

    expect(receipt.status).toBe("contract_drift");
    expect(receipt.violations).toEqual(
      expect.arrayContaining(["forbidden_evidence_field"]),
    );
  });

  it("is replay- and concurrency-stable for identical aggregate input", () => {
    const input = {
      actorClass: "sealed_owner" as const,
      accessStatus: "allowed" as const,
      links: EXPECTED_OPERATOR_MENU_LINKS,
      localeLinkSets,
      retiredRouteStatuses,
      reachableAccountPaths: EXPECTED_ACCOUNT_MODERATION_PATHS,
      queueReadCount: 1,
      mutationCount: 1,
      durationMs: 20,
      evidence: {},
    };

    const [first, second] = [
      evaluateAdminMenuContract(input),
      evaluateAdminMenuContract(input),
    ];
    expect(first.digest).toBe(second.digest);
    expect(first.status).toBe(second.status);
  });

  it("times out an admin role store without accepting late completion", async () => {
    let release: ((value: "allowed") => void) | undefined;
    const check = createAdminRoleResolutionCheck(
      () =>
        new Promise<"allowed">((resolve) => {
          release = resolve;
        }),
      { timeoutMs: 5 },
    );

    expect(check.getStatus()).toBe("evaluating");
    await expect(check.result).resolves.toEqual({ status: "timed_out" });
    expect(check.getStatus()).toBe("timed_out");
    release?.("allowed");
    await Promise.resolve();
    await expect(check.result).resolves.toEqual({ status: "timed_out" });
    expect(check.controls).toEqual([
      "Retry sign-in button",
      "Continue to garden link",
    ]);
  });

  it("cancels an in-flight role resolution and disposes the late result", async () => {
    let release: ((value: "allowed") => void) | undefined;
    const check = createAdminRoleResolutionCheck(
      () =>
        new Promise<"allowed">((resolve) => {
          release = resolve;
        }),
    );

    expect(check.cancel()).toBe(true);
    await expect(check.result).resolves.toEqual({ status: "cancelled" });
    release?.("allowed");
    await Promise.resolve();
    await expect(check.result).resolves.toEqual({ status: "cancelled" });
    expect(check.cancel()).toBe(false);
  });
});
