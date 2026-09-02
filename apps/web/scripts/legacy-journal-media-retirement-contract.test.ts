import { describe, expect, it } from "vitest";

import {
  APPROVED_RETIREMENT_EVIDENCE_DIGEST,
  parseRetirementOperatorArgs,
  stableEvidenceDigest,
  toRetirementGateSnapshot,
  validateZeroState,
  type LegacyProductionReport,
} from "./legacy-journal-media-retirement-contract";

function approvedReportFixture(): LegacyProductionReport {
  return {
    version: "ove349.productionPreflight.v2",
    environment: "production",
    selectOnly: true,
    databaseIdentity: "digitalocean_overgarden_production",
    schemaDigest: "a".repeat(64),
    drafts: { total: 0, synthetic: 0, genuine: 0, ambiguous: 0 },
    privateEntries: {
      total: 203,
      synthetic: 154,
      genuine: 43,
      ambiguous: 6,
    },
    privateEntryGroups: [],
    media: {
      total: 51,
      atomic_final_rows: 0,
      legacy_quarantine_rows: 0,
      visual_fixture_rows: 0,
      nonfinal_or_claimed_rows: 0,
      inflight_or_retryable_rows: 0,
      quality_receipt_rows: 0,
      attached_nonfinal_rows: 0,
    },
    mediaGroups: [
      { referenceClass: "private_entry", rows: 29 },
      { referenceClass: "public_entry", rows: 14 },
      { referenceClass: "unattached", rows: 8 },
    ],
    publicDerivativeStates: {
      privateEntryPresent: 25,
      privateEntryAbsent: 4,
      publicEntryPresent: 14,
      publicEntryAbsent: 0,
      unattachedPresent: 2,
      unattachedAbsent: 0,
      providerErrors: 0,
    },
    jobs: {
      unfinished_legacy_jobs: 0,
      unfinished_staging_finalize_jobs: 0,
      unfinished_preserved_revoke_jobs: 0,
    },
    visibility: { public_rows: 10, private_rows: 203, unexpected_rows: 0 },
    legacyQuarantineBucket: {
      identity: "overgarden-quarantine",
      objectCount: 0,
      totalBytes: 0,
      ageBands: { newerThanDay: 0, oneToSevenDays: 0, olderThanSevenDays: 0 },
    },
  };
}

describe("OVE-349 production retirement contract", () => {
  it("parses read-only mode without a destructive confirmation", () => {
    expect(
      parseRetirementOperatorArgs([
        "--mode",
        "preflight",
        "--env-file",
        "/tmp/prod.env",
      ]),
    ).toEqual({ mode: "preflight", envFile: "/tmp/prod.env" });
  });

  it("requires the exact approved digest, observation receipt, and confirmation for cleanup", () => {
    expect(() => parseRetirementOperatorArgs(["--mode", "cleanup"])).toThrow(
      /approved digest/i,
    );
    expect(
      parseRetirementOperatorArgs([
        "--mode",
        "cleanup",
        "--approved-digest",
        APPROVED_RETIREMENT_EVIDENCE_DIGEST,
        "--observation-receipt",
        "b".repeat(64),
        "--confirm-production",
        "delete-approved-ove349-test-residue",
      ]),
    ).toMatchObject({ mode: "cleanup", observationReceipt: "b".repeat(64) });
  });

  it("maps only redacted aggregate evidence into the destructive gate", () => {
    const gate = toRetirementGateSnapshot(
      approvedReportFixture(),
      APPROVED_RETIREMENT_EVIDENCE_DIGEST,
    );
    expect(gate).toMatchObject({
      privateEntries: 203,
      privateAttachedMedia: 29,
      unattachedMedia: 8,
      candidatePresentObjects: 27,
      candidateAbsentObjects: 10,
      publicEntries: 10,
      publicMedia: 14,
      publicPresentObjects: 14,
      outsideApprovedScope: 0,
    });
    expect(JSON.stringify(gate)).not.toMatch(/derivatives\/|@|journal body/i);
  });

  it("produces an order-independent evidence digest", () => {
    expect(stableEvidenceDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableEvidenceDigest({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("admits migration only at zero legacy state with public data intact", () => {
    const zero = {
      drafts: 0,
      privateEntries: 0,
      unattachedMedia: 0,
      nonFinalMedia: 0,
      unfinishedEffects: 0,
      publicEntries: 10,
      publicMedia: 14,
      publicObjectsPresent: 14,
      publicObjectsMissing: 0,
      providerErrors: 0,
    };
    expect(validateZeroState(zero)).toEqual({ ok: true });
    expect(validateZeroState({ ...zero, privateEntries: 1 })).toMatchObject({
      ok: false,
    });
  });
});
