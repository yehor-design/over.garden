import { describe, expect, it } from "vitest";

import {
  ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES,
  ERASURE_REQUEST_INTAKE_VERSION,
  FIRST_PUBLICATION_DISCLOSURE_LINES,
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  PILOT_LEGAL_COPY_STATUS,
} from "./disclosures";

describe("pilot privacy disclosure constants", () => {
  it("keeps first-publication disclosure version explicit and copy bounded", () => {
    expect(FIRST_PUBLICATION_DISCLOSURE_VERSION).toBe(
      "first-publication-v1",
    );
    expect(PILOT_LEGAL_COPY_STATUS).toBe("pilot_placeholder");
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).toContain(
      "noindex",
    );
    expect(FIRST_PUBLICATION_DISCLOSURE_LINES.join(" ")).not.toMatch(
      /\b(address|coordinates?|latitude|longitude|email|ip_address|user[_ -]?agent)\b/i,
    );
  });

  it("keeps erasure intake version explicit and non-destructive", () => {
    expect(ERASURE_REQUEST_INTAKE_VERSION).toBe("erasure-request-pilot-v1");
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "non-destructive",
    );
    expect(ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.join(" ")).toContain(
      "No account",
    );
  });
});
