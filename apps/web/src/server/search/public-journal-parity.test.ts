import { describe, expect, it } from "vitest";

import { fingerprintJournalSearchDocument } from "./public-journal-eligibility";
import {
  assertSafeJournalSearchDocumentId,
  isSafeJournalSearchDocumentId,
} from "./public-journal-document-id";
import {
  assertPublicJournalParityZeroGap,
  type PublicJournalParityReport,
} from "./public-journal-parity";

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

describe("public journal search parity redaction", () => {
  it("fails closed on non-zero gap for Drive2/OVE-186 gate", () => {
    const report: PublicJournalParityReport = {
      policyVersion: "ove196.publicIndexParity.v1",
      issue: "OVE-196",
      zeroGap: false,
      counts: {
        expected: 3,
        missing: 1,
        extraneous: 0,
        stale: 0,
        unsafe_schema: 0,
        duplicate: 0,
        invalid_id: 0,
        pending: 0,
        terminal_failure: 0,
        meiliDocumentCount: 3,
        postgresEligibleCount: 4,
      },
      evidenceSafety: "counts_and_booleans_only",
    };
    expect(() => assertPublicJournalParityZeroGap(report)).toThrow(/zero-gap/);
  });

  it("fingerprints without private content fields", () => {
    const fingerprint = fingerprintJournalSearchDocument({
      id: "00000000-0000-4000-8000-000000000001",
      title: "secret title",
      body: "secret body",
      publicSlug: "secret-slug",
      publicPath: "/journal/secret-slug",
      locationVisibility: "hidden",
      noindex: true,
      entryDate: "2026-06-25T00:00:00.000Z",
      entryScope: "object",
      createdAt: "2026-06-26T00:00:00.000Z",
      kind: "journal_entry",
      coverSource: "none",
    });
    expect(fingerprint).not.toContain("secret title");
    expect(fingerprint).not.toContain("secret body");
    expect(fingerprint).not.toContain("secret-slug");
    expect(fingerprint).toContain("none");
  });
});
