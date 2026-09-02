import { describe, expect, it } from "vitest";

import {
  assertSafeJournalSearchDocumentId,
  isSafeJournalSearchDocumentId,
} from "./public-journal-document-id";
import {
  assertPublicJournalParityZeroGap,
  derivePublicJournalZeroGap,
  redactParityReportForEvidence,
  PUBLIC_JOURNAL_PARITY_ISSUE,
  PUBLIC_JOURNAL_SEARCH_PARITY_POLICY,
  type PublicJournalParityCounts,
  type PublicJournalParityReport,
} from "./public-journal-parity";

const CONVERGED_COUNTS: PublicJournalParityCounts = {
  expected: 4,
  missing: 0,
  extraneous: 0,
  stale: 0,
  unsafe_schema: 0,
  duplicate: 0,
  invalid_id: 0,
  pending: 0,
  overdue: 0,
  terminal_failure: 0,
  projection_unconverged: 0,
  projection_overdue: 0,
  projection_dead: 0,
  meiliDocumentCount: 4,
  postgresEligibleCount: 4,
};

function report(
  overrides: Partial<PublicJournalParityCounts> = {},
  reportOverrides: Partial<PublicJournalParityReport> = {},
): PublicJournalParityReport {
  const counts = { ...CONVERGED_COUNTS, ...overrides };
  return {
    policyVersion: PUBLIC_JOURNAL_SEARCH_PARITY_POLICY,
    issue: PUBLIC_JOURNAL_PARITY_ISSUE,
    zeroGap: derivePublicJournalZeroGap(counts),
    counts,
    driftFieldClasses: [],
    invalidReasonClasses: [],
    expectedCorpusHash: "a".repeat(64),
    observedCorpusHash: "a".repeat(64),
    evidenceSafety: "counts_classes_and_safe_hashes",
    ...reportOverrides,
  };
}

describe("public journal search document id", () => {
  it("accepts UUID journal ids only", () => {
    expect(
      isSafeJournalSearchDocumentId("00000000-0000-4000-8000-000000000001"),
    ).toBe(true);
    expect(isSafeJournalSearchDocumentId("not-a-uuid")).toBe(false);
    expect(isSafeJournalSearchDocumentId("1")).toBe(false);
    expect(() => assertSafeJournalSearchDocumentId("bad")).toThrow(
      /invalid_journal_search_document_id/,
    );
  });
});

describe("zero-gap derivation (OVE-227)", () => {
  it("is true only when the corpus converged and no job can hide drift", () => {
    expect(derivePublicJournalZeroGap(CONVERGED_COUNTS)).toBe(true);
  });

  it.each([
    "missing",
    "extraneous",
    "stale",
    "unsafe_schema",
    "duplicate",
    "invalid_id",
  ] as const)("fails closed on a non-zero %s class", (parityClass) => {
    expect(
      derivePublicJournalZeroGap({ ...CONVERGED_COUNTS, [parityClass]: 1 }),
    ).toBe(false);
  });

  it("fails closed on overdue indexing work", () => {
    // The v1 regression: an overdue index job could hold back a mutation while
    // the Meili snapshot still looked converged, so the gate reported zeroGap.
    expect(
      derivePublicJournalZeroGap({ ...CONVERGED_COUNTS, overdue: 1 }),
    ).toBe(false);
  });

  it("fails closed on dead-lettered indexing work", () => {
    expect(
      derivePublicJournalZeroGap({
        ...CONVERGED_COUNTS,
        terminal_failure: 1,
      }),
    ).toBe(false);
  });

  it("tolerates in-flight pending work that is not yet overdue", () => {
    expect(
      derivePublicJournalZeroGap({ ...CONVERGED_COUNTS, pending: 3 }),
    ).toBe(true);
    // OVE-242: a projection intent recorded moments ago is in flight, not drift.
    expect(
      derivePublicJournalZeroGap({
        ...CONVERGED_COUNTS,
        projection_unconverged: 2,
      }),
    ).toBe(true);
  });

  it("fails closed on overdue or dead-lettered projection revocation", () => {
    // OVE-242: an archive, erasure, moderation or location-hide whose intent
    // never converged means the previous document may still be searchable.
    expect(
      derivePublicJournalZeroGap({
        ...CONVERGED_COUNTS,
        projection_overdue: 1,
      }),
    ).toBe(false);
    expect(
      derivePublicJournalZeroGap({ ...CONVERGED_COUNTS, projection_dead: 1 }),
    ).toBe(false);
  });
});

describe("public journal search parity gate and evidence", () => {
  it("fails closed on non-zero gap for the OVE-186 closeout gate", () => {
    expect(() =>
      assertPublicJournalParityZeroGap(report({ missing: 1 })),
    ).toThrow(/zero-gap/);
    expect(() =>
      assertPublicJournalParityZeroGap(report({ terminal_failure: 1 })),
    ).toThrow(/zero-gap/);
    expect(() => assertPublicJournalParityZeroGap(report())).not.toThrow();
  });

  it("redacts evidence to counts, class names, and safe hashes only", () => {
    const redacted = redactParityReportForEvidence(
      report(
        { stale: 1 },
        {
          driftFieldClasses: ["title", "coverPublicUrl"],
          invalidReasonClasses: ["invalid_body"],
          expectedCorpusHash: "b".repeat(64),
          observedCorpusHash: "c".repeat(64),
        },
      ),
    );

    expect(redacted.evidenceSafety).toBe("counts_classes_and_safe_hashes");
    // Field/reason classes are names, sorted, and carry no values.
    expect(redacted.driftFieldClasses).toEqual(["coverPublicUrl", "title"]);
    expect(redacted.invalidReasonClasses).toEqual(["invalid_body"]);
    expect(redacted.expectedCorpusHash).toMatch(/^[0-9a-f]{64}$/);

    const serialized = JSON.stringify(redacted);
    for (const forbidden of [
      "ownerUserId",
      "userId",
      "derivativeKey",
      "quarantine",
      "latitude",
      "longitude",
      "@",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // Only known safe top-level keys survive redaction.
    expect(Object.keys(redacted).sort()).toEqual([
      "counts",
      "driftFieldClasses",
      "evidenceSafety",
      "expectedCorpusHash",
      "invalidReasonClasses",
      "issue",
      "observedCorpusHash",
      "policyVersion",
      "zeroGap",
    ]);
  });

  it("pins the superseding policy version", () => {
    expect(PUBLIC_JOURNAL_SEARCH_PARITY_POLICY).toBe(
      "ove242.publicIndexParity.v3",
    );
    expect(PUBLIC_JOURNAL_PARITY_ISSUE).toBe("OVE-227");
  });
});
