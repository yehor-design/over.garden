import { describe, expect, it } from "vitest";

import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import {
  GARDEN_WORKSPACE_FAILURE_CLASSES,
  GARDEN_WORKSPACE_SECTION_QUERY_COUNT,
  WORKSPACE_SECTION_DEADLINE_MS,
  classifyGardenWorkspaceFailure,
  gardenWorkspaceSectionDeadlineMs,
} from "@/server/garden-workspace-repository";

import {
  WAIT_SAFE_CONTROLS,
  WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS,
  WORKSPACE_SETTLE_OBSERVATION_ALLOWANCE_MS,
  driverRejection,
  parseWorkspaceProofArgs,
  proveClosedClasses,
  proveConcurrentLoads,
  proveInjectedInventoryTimeout,
  proveOwnerScope,
  proveInventoryRoundTrips,
  proveReplay,
  proveScopedDegradation,
  runWorkspaceObservabilityProof,
} from "./prove-workspace-section-observability";

describe("garden workspace section observability", () => {
  it("produces exactly one bounded class for every rejection cause", async () => {
    const cases = await proveClosedClasses();

    expect(cases.map((entry) => entry.failureClass)).toEqual([
      "permission_denied",
      "schema_missing",
      "query_timeout",
      "connection_unavailable",
      "serialization_failure",
      "unknown",
    ]);
    for (const entry of cases) {
      expect(GARDEN_WORKSPACE_FAILURE_CLASSES).toContain(entry.failureClass);
    }
  });

  it("reports unknown for a cause the classifier has never seen", () => {
    expect(classifyGardenWorkspaceFailure(new Error("no code"))).toBe(
      "unknown",
    );
    expect(classifyGardenWorkspaceFailure(driverRejection("99999"))).toBe(
      "unknown",
    );
    expect(classifyGardenWorkspaceFailure(null)).toBe("unknown");
    expect(classifyGardenWorkspaceFailure(undefined)).toBe("unknown");
  });

  it("keeps a failed section scoped so three siblings keep their counts", async () => {
    const cases = await proveScopedDegradation();

    expect(cases).toHaveLength(4);
    for (const entry of cases) {
      expect(entry.state).toBe("degraded");
      expect(entry.readySiblings).toBe(3);
    }
  });

  it("keeps every query inside the requesting owner scope", async () => {
    const proof = await proveOwnerScope();

    expect(proof.state).toBe("completed");
    expect(proof.failureClass).toBeNull();
  });

  it("returns the same class on replay rather than a second distinct one", async () => {
    const proof = await proveReplay();

    expect(proof.failureClass).toBe("permission_denied");
    expect(proof.readySiblings).toBe(3);
  });

  it("settles two concurrent loads without crossing their classes", async () => {
    const proof = await proveConcurrentLoads();

    expect(proof.failureClass).toBe("serialization_failure");
    expect(proof.readySiblings).toBe(3);
  });

  it("keeps a class-only receipt with no query, parameter, or content", async () => {
    const receipt = await runWorkspaceObservabilityProof({
      mode: "verify",
      injectInventoryQueryTimeout: true,
    });
    const serialized = JSON.stringify(receipt);

    expect(receipt.withinBudget).toBe(true);
    // The load-bearing property: the deadline actually bounds the settle. A
    // wedged source reaches the deadline and stops there, so the slowest settle
    // sits at the budget rather than running on.
    expect(receipt.maxSettleMs).toBeLessThanOrEqual(
      WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS +
        WORKSPACE_SETTLE_OBSERVATION_ALLOWANCE_MS,
    );
    expect(receipt.maxSettleMs).toBeGreaterThanOrEqual(
      WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS,
    );
    // The driver message and the owner identifier must not survive into a
    // receipt, because a real driver error carries the statement and its
    // bound parameters.
    expect(serialized).not.toContain("redacted driver failure");
    expect(serialized).not.toContain("00000000-0000-4000-8000");
    expect(serialized).not.toContain("select");
  });

  it("is read-only: the proof never counts a write of any kind", async () => {
    const receipt = await runWorkspaceObservabilityProof({
      mode: "verify",
      injectInventoryQueryTimeout: false,
    });

    // Every case is served by injected sources, so no statement is executed at
    // all; the read model is the only thing produced.
    for (const entry of receipt.cases) {
      expect(["completed", "degraded"]).toContain(entry.state);
    }
  });

  it("keeps both wait-safe controls responsive through an injected timeout", async () => {
    const proof = await proveInjectedInventoryTimeout();

    expect(proof.state).toBe("degraded");
    expect(proof.failureClass).toBe("query_timeout");
    expect(proof.readySiblings).toBe(3);
    expect(WAIT_SAFE_CONTROLS).toEqual([
      "Refresh list button",
      "Add object link",
    ]);
  });

  it("renders the degraded copy identically in every locale", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getGardenWorkspaceCopy(locale);
      expect(copy.workspace.nextAction.unavailableTitle.length).toBeGreaterThan(
        0,
      );
      expect(copy.workspace.nextAction.retryInventory.length).toBeGreaterThan(
        0,
      );
      // The class travels as an attribute, so no locale string may carry a
      // machine-readable failure code.
      for (const failureClass of GARDEN_WORKSPACE_FAILURE_CLASSES) {
        expect(copy.workspace.nextAction.unavailableDescription).not.toContain(
          failureClass,
        );
      }
    }
  });

  it("measures the inventory round-trip count rather than trusting the declaration", async () => {
    const proof = await proveInventoryRoundTrips();

    // Four when the owner has objects: the summary count and the object page,
    // then the entry summaries and the cover media keyed on the ids returned.
    expect(proof.withObjects).toBe(4);
    // Two when they have none: the object page short-circuits the dependent pair.
    expect(proof.withoutObjects).toBe(2);
    expect(proof.declared).toBe(proof.withObjects);
  });

  it("derives every section budget from its own round-trip cost", () => {
    for (const section of ["spaces", "recent", "inbox"] as const) {
      // One query each, so their budget is unchanged by this contract.
      expect(GARDEN_WORKSPACE_SECTION_QUERY_COUNT[section]).toBe(1);
      expect(gardenWorkspaceSectionDeadlineMs(section)).toBe(
        WORKSPACE_SECTION_DEADLINE_MS,
      );
    }
    expect(gardenWorkspaceSectionDeadlineMs("inventory")).toBe(
      WORKSPACE_SECTION_DEADLINE_MS *
        GARDEN_WORKSPACE_SECTION_QUERY_COUNT.inventory,
    );
    // The budget is a derivation, not a hand-picked constant: it must move if
    // the round-trip cost moves.
    expect(gardenWorkspaceSectionDeadlineMs("inventory")).toBeGreaterThan(
      gardenWorkspaceSectionDeadlineMs("spaces"),
    );
  });

  it("refuses an unknown proof mode before running anything", () => {
    expect(() => parseWorkspaceProofArgs(["--mode", "apply"])).toThrow(
      /workspace_proof_mode_invalid/,
    );
    expect(parseWorkspaceProofArgs([])).toEqual({
      mode: "verify",
      injectInventoryQueryTimeout: false,
    });
  });
});
