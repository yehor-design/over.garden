import { describe, expect, it } from "vitest";

import {
  ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES,
  ERASURE_REQUEST_HANDLED_STATUS_OPTIONS,
  ERASURE_REQUEST_INTAKE_VERSION,
  FIRST_PUBLICATION_DISCLOSURE_LINES,
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  formatErasureRequestReference,
  getErasureRequestStatusCopy,
  PILOT_LEGAL_COPY_STATUS,
  PILOT_PUBLIC_RELEASE_BLOCKERS,
} from "./disclosures";

describe("pilot privacy disclosure constants", () => {
  it("keeps first-publication disclosure version explicit and copy bounded", () => {
    expect(FIRST_PUBLICATION_DISCLOSURE_VERSION).toBe("first-publication-v3");
    expect(PILOT_LEGAL_COPY_STATUS).toBe(
      "closed_pilot_reviewed_public_release_blocked",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "not listed for search engines",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "not a secrecy guarantee",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "server-cleaned copies",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "stops showing the journal text",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).not.toContain(
      "410 Gone",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).not.toMatch(
      /\b(noindex|stripped derivatives?)\b/i,
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).not.toMatch(
      /\b(address|coordinates?|latitude|longitude|email|ip_address|user[_ -]?agent)\b/i,
    );
  });

  it("keeps erasure intake version explicit and non-destructive", () => {
    expect(ERASURE_REQUEST_INTAKE_VERSION).toBe("erasure-request-pilot-v2");
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "operator-reviewed",
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "deleted automatically",
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).not.toContain(
      "automatically delete or anonymize",
    );
  });

  it("keeps public release blockers explicit", () => {
    expect(PILOT_PUBLIC_RELEASE_BLOCKERS).toContain(
      "Final reviewed legal policy text.",
    );
    expect(PILOT_PUBLIC_RELEASE_BLOCKERS.join(" ")).toContain(
      "Maintainer-approved irreversible erasure/anonymization procedure.",
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
      "declined",
      "duplicate",
      "needs_identity_verification",
    ]);
    expect(
      formatErasureRequestReference("00000000-0000-4000-8000-00000000abcd"),
    ).toBe("request-0000abcd");
  });
});
