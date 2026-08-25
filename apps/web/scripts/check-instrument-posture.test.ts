import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACTIVE_INSTRUMENT_COMMANDS,
  ACTIVE_INSTRUMENT_PATHS,
  INSTRUMENT_POSTURE_DEADLINE_MS,
  INSTRUMENT_POSTURE_VERSION,
  InstrumentPostureScanSession,
  OWNED_ELSEWHERE_INSTRUMENT_PATHS,
  PREDECESSOR_RETIRED_COMMANDS,
  PREDECESSOR_RETIRED_PATHS,
  PRESERVED_SCANNER_PATH,
  RETIREMENT_GUARD_PATH,
  evaluateInstrumentPosture,
  formatInstrumentPostureReceipt,
  parseInstrumentPostureArguments,
  runInstrumentPostureCheck,
  type InstrumentPostureSnapshot,
} from "./check-instrument-posture";
import { classifyMediaFocalPresentation } from "./smoke-media-focal-presentation";
import {
  classifyGardenSurface,
  parseGardenerTypeaheadSuggestions,
  requireRenderedDocumentMutationGeneration,
} from "./smoke-catalog-gardener-readback";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

function alignedSnapshot(): InstrumentPostureSnapshot {
  return {
    files: {
      "apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts": [
        'requireExactString(canonicalMatch, "approvedCanonicalServeClass", "exact")',
        '"legacyWorkerCompatibilityPreservesSuggestionOnly"',
        'requireExactString(aliasReview, "approvedAliasServeClass", "generated")',
        '"staleSourceApprovalPreservesCanonicalState"',
        'requireExactString(gardener, "gardenSurface", "operational_home")',
      ].join("\n"),
      "apps/web/scripts/prove-deterministic-matching-rollout.ts": [
        "buildLocalDeterministicMatchingRolloutEvidence",
        'runPackageJsonScript("smoke:catalog-match-approval")',
        'runPackageJsonScript("smoke:catalog-alias-approval")',
      ].join("\n"),
      "apps/web/scripts/smoke-catalog-alias-approval.ts": [
        'approvedAliasServeClass: "generated"',
        "staleSourceApprovalPreservesCanonicalState: true",
      ].join("\n"),
      "apps/web/scripts/smoke-catalog-match-approval.ts": [
        'approvedCanonicalServeClass: "exact"',
        "legacyWorkerCompatibilityPreservesSuggestionOnly: true",
      ].join("\n"),
      "apps/web/scripts/smoke-media-focal-presentation.ts": [
        'invalidFocalServeClass: "clamped"',
        "containServesCenter: true",
      ].join("\n"),
      [RETIREMENT_GUARD_PATH]: PREDECESSOR_RETIRED_PATHS.join("\n"),
      [PRESERVED_SCANNER_PATH]: "preserved task-local contract scanner",
      [OWNED_ELSEWHERE_INSTRUMENT_PATHS[0]]: "localization owner",
      [OWNED_ELSEWHERE_INSTRUMENT_PATHS[1]]: "responsive accessibility owner",
    },
    packageScripts: Object.fromEntries(
      Object.entries(ACTIVE_INSTRUMENT_COMMANDS).map(([command, owner]) => [
        command,
        `tsx ${owner.replace("apps/web/", "")}`,
      ]),
    ),
  };
}

describe("check-instrument-posture", () => {
  it("classifies the complete active and predecessor-retired instrument set", () => {
    const receipt = evaluateInstrumentPosture(alignedSnapshot(), {
      durationMs: 17,
    });

    expect(receipt).toMatchObject({
      version: INSTRUMENT_POSTURE_VERSION,
      status: "aligned",
      counts: {
        activePaths: 5,
        predecessorRetiredPaths: 2,
        activeCommands: 8,
        predecessorRetiredCommands: 3,
        retiredPostureAssertions: 0,
        unclassified: 0,
      },
      durationMs: 17,
      violations: [],
    });
    expect(receipt.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assertion: "approvedCanonicalServeClass",
          class: "preserved_control",
          servedClass: "exact",
        }),
        expect.objectContaining({
          assertion: "approvedAliasServeClass",
          class: "preserved_control",
          servedClass: "generated",
        }),
        expect.objectContaining({
          assertion: "invalidFocalServeClass",
          class: "preserved_control",
          servedClass: "clamped",
        }),
      ]),
    );
    expect(receipt.entries.filter((entry) => entry.class === "retired_by_predecessor"))
      .toHaveLength(2);
    expect(receipt.commandMap).toHaveLength(8);
  });

  it("records preserved and owned-elsewhere controls without converting their bytes", () => {
    const snapshot = alignedSnapshot();
    const before = structuredClone(snapshot.files);

    const receipt = evaluateInstrumentPosture(snapshot);

    expect(snapshot.files).toEqual(before);
    expect(receipt.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: PRESERVED_SCANNER_PATH,
          class: "preserved_control",
        }),
        ...OWNED_ELSEWHERE_INSTRUMENT_PATHS.map((ownerPath) =>
          expect.objectContaining({
            path: ownerPath,
            class: "owned_elsewhere",
          }),
        ),
      ]),
    );
  });

  it("fails without mutating input for an unclassified assertion, missing command, or retired artifact reappearance", () => {
    const snapshot = alignedSnapshot();
    snapshot.files[ACTIVE_INSTRUMENT_PATHS[2]] +=
      "\nstaleSourceEligibilityFailsClosed: true";
    delete snapshot.packageScripts[Object.keys(ACTIVE_INSTRUMENT_COMMANDS)[0]];
    snapshot.files[PREDECESSOR_RETIRED_PATHS[0]] = "legacy instrument";
    snapshot.packageScripts[PREDECESSOR_RETIRED_COMMANDS[0]] =
      "tsx scripts/verify-launch-media-quality.ts";
    const before = structuredClone(snapshot);

    const receipt = evaluateInstrumentPosture(snapshot);

    expect(snapshot).toEqual(before);
    expect(receipt.status).toBe("posture_drift");
    expect(receipt.counts.retiredPostureAssertions).toBeGreaterThan(0);
    expect(receipt.counts.unclassified).toBeGreaterThan(0);
    expect(receipt.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "retired_assertion_present",
        "active_command_missing",
        "retired_path_reappeared",
        "retired_command_reappeared",
      ]),
    );
  });

  it("replays to the same semantic vector and emits only redacted aggregate fields", () => {
    const first = evaluateInstrumentPosture(alignedSnapshot(), {
      durationMs: 1,
    });
    const second = evaluateInstrumentPosture(alignedSnapshot(), {
      durationMs: 999,
    });
    const formatted = JSON.parse(formatInstrumentPostureReceipt(first));

    expect(first.semanticDigest).toBe(second.semanticDigest);
    expect(first.entries).toEqual(second.entries);
    expect(formatted).not.toHaveProperty("entries");
    expect(formatted).toMatchObject({
      status: "aligned",
      counts: first.counts,
      semanticDigest: first.semanticDigest,
    });
    expect(JSON.stringify(formatted)).not.toContain("requireExactString");
  });

  it("keeps one concurrent owner and returns scan_already_running to a second start", async () => {
    let releaseRead: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const session = new InstrumentPostureScanSession({
      readSnapshot: async () => {
        await gate;
        return alignedSnapshot();
      },
    });

    const owner = session.start({ deadlineMs: 1_000 });
    expect(session.inspectInstrumentStatusCommand().status).toBe("scanning");
    await expect(session.start({ deadlineMs: 1_000 })).resolves.toMatchObject({
      status: "scan_already_running",
    });
    releaseRead();
    await expect(owner).resolves.toMatchObject({ status: "aligned" });
  });

  it("times out and cancels responsively without admitting a late dependency result", async () => {
    let resolveLate: (snapshot: InstrumentPostureSnapshot) => void = () =>
      undefined;
    const late = new Promise<InstrumentPostureSnapshot>((resolve) => {
      resolveLate = resolve;
    });
    const timeoutSession = new InstrumentPostureScanSession({
      readSnapshot: async () => late,
    });

    await expect(timeoutSession.start({ deadlineMs: 5 })).resolves.toMatchObject({
      status: "timed_out",
      violations: [{ code: "tracked_file_read_timeout" }],
    });
    resolveLate(alignedSnapshot());
    await Promise.resolve();
    expect(timeoutSession.inspectInstrumentStatusCommand().status).toBe(
      "timed_out",
    );

    let releaseCancelled: (snapshot: InstrumentPostureSnapshot) => void = () =>
      undefined;
    const cancelledRead = new Promise<InstrumentPostureSnapshot>((resolve) => {
      releaseCancelled = resolve;
    });
    const cancelSession = new InstrumentPostureScanSession({
      readSnapshot: async () => cancelledRead,
    });
    const running = cancelSession.start({ deadlineMs: 1_000 });
    expect(cancelSession.cancelInstrumentClassificationCommand()).toMatchObject({
      status: "cancelled",
      violations: [{ code: "scan_cancelled" }],
    });
    releaseCancelled(alignedSnapshot());
    await expect(running).resolves.toMatchObject({ status: "cancelled" });
    expect(cancelSession.inspectInstrumentStatusCommand().status).toBe(
      "cancelled",
    );
  });

  it("records a bounded failed receipt when a dependency read crashes", async () => {
    const session = new InstrumentPostureScanSession({
      readSnapshot: async () => {
        throw new Error("fixture read failed with private details");
      },
    });

    await expect(session.start({ deadlineMs: 100 })).resolves.toMatchObject({
      status: "failed",
      violations: [{ code: "tracked_file_read_failed" }],
    });
    expect(JSON.stringify(session.inspectInstrumentStatusCommand())).not.toContain(
      "private details",
    );
  });

  it("parses the CLI proof modes and rejects unknown arguments", () => {
    expect(
      parseInstrumentPostureArguments([
        "--",
        "--prove-determinism",
        "--inject-dependency-timeout",
        "--emit-aggregate-receipt",
      ]),
    ).toEqual({
      proveDeterminism: true,
      injectDependencyTimeout: true,
      emitAggregateReceipt: true,
    });
    expect(() => parseInstrumentPostureArguments(["--unknown"])).toThrow(
      "unknown_argument",
    );
  });

  it("asserts invalid focal input is served at centre with class clamped", () => {
    expect(classifyMediaFocalPresentation()).toMatchObject({
      coverUsesObjectPosition: true,
      containServesCenter: true,
      invalidFocalServesCenter: true,
      invalidFocalServeClass: "clamped",
      coverFitClass: true,
      containFitClass: true,
    });
  });

  it("classifies authenticated garden surfaces in raw and React Flight encodings", () => {
    expect(
      classifyGardenSurface(
        '<main data-garden-workspace="operational-home"></main>',
      ),
    ).toBe("operational_home");
    expect(
      classifyGardenSurface(
        '"data-garden-workspace\\":\\"operational-home\\"',
      ),
    ).toBe("operational_home");
    expect(
      classifyGardenSurface('<main data-garden-workspace="guest"></main>'),
    ).toBe("guest");
    expect(classifyGardenSurface("unrelated html")).toBe("unknown");
  });

  it("admits the shipped served class but rejects unsafe gardener typeahead evidence", () => {
    const safe = {
      id: "16100000-0000-4000-8000-000000000001",
      displayName: "OVE161 Zolotyi tomat",
      canonicalName: "OVE161 Золотий томат",
      catalogKind: "plant_variety",
      locale: "uk",
      status: "confirmed",
      source: "internal_seed",
      serveClass: "generated",
    };
    expect(parseGardenerTypeaheadSuggestions({ suggestions: [safe] })).toEqual([
      safe,
    ]);
    expect(() =>
      parseGardenerTypeaheadSuggestions({
        suggestions: [{ ...safe, serveClass: "refused" }],
      }),
    ).toThrow(/served class/i);
    expect(() =>
      parseGardenerTypeaheadSuggestions({
        suggestions: [{ ...safe, ownerUserId: "private" }],
      }),
    ).toThrow(/non-contract field/i);
  });

  it("extracts only a bounded mutation generation from a rendered owner form", () => {
    expect(requireRenderedDocumentMutationGeneration("signed_generation-123"))
      .toBe("signed_generation-123");
    expect(() => requireRenderedDocumentMutationGeneration(""))
      .toThrow(/rendered mutation generation/i);
    expect(() =>
      requireRenderedDocumentMutationGeneration("unsafe.value"),
    ).toThrow(/rendered mutation generation/i);
  });

  it("checks the checked-in repository within the performance contract", () => {
    const receipt = runInstrumentPostureCheck({
      repositoryRoot: REPOSITORY_ROOT,
    });

    expect(receipt.status).toBe("aligned");
    expect(receipt.durationMs).toBeLessThanOrEqual(
      INSTRUMENT_POSTURE_DEADLINE_MS,
    );
    expect(receipt.counts).toMatchObject({
      activePaths: 5,
      predecessorRetiredPaths: 2,
      activeCommands: 8,
      predecessorRetiredCommands: 3,
      retiredPostureAssertions: 0,
      unclassified: 0,
    });
  });
});
