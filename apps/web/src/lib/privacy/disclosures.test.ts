import { describe, expect, it } from "vitest";

import {
  ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES,
  ERASURE_REQUEST_HANDLED_STATUS_OPTIONS,
  ERASURE_REQUEST_INTAKE_VERSION,
  FIRST_PUBLICATION_DISCLOSURE_LINES,
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  MVP_LEGAL_COPY_BOUNDARIES,
  MVP_LEGAL_COPY_REVIEW_NOTE,
  MVP_LEGAL_COPY_STATUS,
  MVP_OPERATOR_EVIDENCE_FORBIDDEN_FIELDS,
  MVP_RETENTION_RULES,
  formatErasureRequestReference,
  getErasureRequestStatusCopy,
  SUPPORT_EMAIL,
} from "./disclosures";

describe("MVP privacy disclosure constants", () => {
  it("keeps first-publication disclosure version explicit and copy bounded", () => {
    expect(FIRST_PUBLICATION_DISCLOSURE_VERSION).toBe("first-publication-v4");
    expect(MVP_LEGAL_COPY_STATUS).toBe(
      "founder_approved_mvp_lawyer_review_deferred",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "thin or unsafe user-generated surfaces stay out of sitemaps",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "7 failed-processing days",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "server-cleaned copies",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "queued for public search removal",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      SUPPORT_EMAIL,
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).not.toContain(
      "410 Gone",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).not.toMatch(
      /\b(noindex|stripped derivatives?)\b/i,
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).not.toMatch(
      /\b(address|coordinates?|latitude|longitude|ip_address|user[_ -]?agent)\b/i,
    );
  });

  it("keeps erasure intake version explicit, non-automatic, and support-visible", () => {
    expect(ERASURE_REQUEST_INTAKE_VERSION).toBe("erasure-request-mvp-v1");
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "operator-reviewed",
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "deleted automatically",
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "request-specific approval",
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "deletes or anonymizes current-schema account",
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "removal best-effort only",
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      SUPPORT_EMAIL,
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).not.toContain(
      "automatically delete or anonymize",
    );
  });

  it("keeps MVP review boundaries and retention rules explicit", () => {
    expect(MVP_LEGAL_COPY_REVIEW_NOTE).toContain("not final lawyer-approved");
    expect(MVP_LEGAL_COPY_BOUNDARIES.join(" ")).toContain(
      "Lawyer review is deferred",
    );
    expect(MVP_RETENTION_RULES.map((rule) => rule.title)).toEqual([
      "Original photo uploads",
      "Public photo derivatives",
      "Operator audit logs",
      "Erasure handling evidence",
      "Analytics events",
    ]);
    expect(MVP_RETENTION_RULES.map((rule) => rule.summary).join(" ")).toContain(
      "13 months",
    );
    expect(MVP_RETENTION_RULES.map((rule) => rule.summary).join(" ")).toContain(
      "Microsoft Clarity session insights",
    );
    expect(MVP_RETENTION_RULES.map((rule) => rule.summary).join(" ")).toContain(
      "1 year",
    );
    expect(MVP_OPERATOR_EVIDENCE_FORBIDDEN_FIELDS).toContain(
      "private journal text",
    );
  });

  it("describes erasure request status without raw internal ids", () => {
    expect(
      getErasureRequestStatusCopy("reviewing", null).description,
    ).toContain("operator");
    expect(
      getErasureRequestStatusCopy("handled", "needs_identity_verification")
        .handled?.label,
    ).toBe("Needs identity verification");
    expect(
      ERASURE_REQUEST_HANDLED_STATUS_OPTIONS.map((option) => option.value),
    ).toEqual([
      "completed",
      "cleanup_pending",
      "declined",
      "duplicate",
      "needs_identity_verification",
    ]);
    expect(
      formatErasureRequestReference("00000000-0000-4000-8000-00000000abcd"),
    ).toBe("request-0000abcd");
  });

  it("does not regress to placeholder or public-release-blocked legal copy", () => {
    const allCopy = [
      MVP_LEGAL_COPY_STATUS,
      MVP_LEGAL_COPY_REVIEW_NOTE,
      ...MVP_LEGAL_COPY_BOUNDARIES,
      ...FIRST_PUBLICATION_DISCLOSURE_LINES,
      ...ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES,
      ...MVP_RETENTION_RULES.flatMap((rule) => [
        rule.title,
        rule.summary,
        rule.developerBoundary,
      ]),
    ].join(" ");

    expect(allCopy).not.toMatch(/placeholder/i);
    expect(allCopy).not.toContain("public release remains blocked");
    expect(allCopy).not.toContain("closed_pilot_reviewed_public_release_blocked");
  });
});
