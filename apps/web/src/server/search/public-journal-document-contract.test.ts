import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ALLOWED_JOURNAL_DOCUMENT_FIELDS,
  FORBIDDEN_JOURNAL_DOCUMENT_FIELDS,
  OPTIONAL_JOURNAL_DOCUMENT_FIELDS,
  REQUIRED_JOURNAL_DOCUMENT_FIELDS,
  canonicalJournalSearchDocumentPayload,
  corpusFingerprint,
  diffJournalSearchDocumentFields,
  fingerprintJournalSearchDocument,
  isCanonicalIsoTimestamp,
  normalizePublicDerivativeUrl,
  validateObservedJournalSearchDocument,
} from "./public-journal-document-contract";
import type { JournalEntrySearchContractDocument } from "./documents";

const PUBLIC_BASE_URL = "https://media.over.garden/public/";

const CANONICAL: JournalEntrySearchContractDocument = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Перший урожай помідорів",
  body: "Зібрали перші плоди після пересадки у відкритий ґрунт.",
  publicSlug: "pershyi-urozhai-0123456789",
  publicPath: "/journal/pershyi-urozhai-0123456789",
  locationVisibility: "hidden",
  noindex: false,
  entryDate: "2026-06-25T00:00:00.000Z",
  entryScope: "object",
  createdAt: "2026-06-26T10:15:30.000Z",
  kind: "journal_entry",
  coverSource: "automatic_inline",
  coverPublicUrl: `${PUBLIC_BASE_URL}derivative/abc123.webp`,
  qualityClass: "verified",
  qualityReasons: [],
};

function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...(CANONICAL as unknown as Record<string, unknown>), ...overrides };
}

function validate(document: Record<string, unknown>) {
  return validateObservedJournalSearchDocument(document, {
    publicDerivativeBaseUrl: PUBLIC_BASE_URL,
  });
}

describe("field sets stay pinned to the shared contract", () => {
  const contract = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        "../../contracts/search/public-journal-entry-search-document.json",
      ),
      "utf8",
    ),
  ) as {
    allowedFields: string[];
    forbiddenFields: string[];
    optionalFields: string[];
    requiredFields: string[];
  };

  it("mirrors the required, optional, and allowed field sets", () => {
    expect([...REQUIRED_JOURNAL_DOCUMENT_FIELDS].sort()).toEqual(
      [...contract.requiredFields].sort(),
    );
    expect([...OPTIONAL_JOURNAL_DOCUMENT_FIELDS].sort()).toEqual(
      [...contract.optionalFields].sort(),
    );
    expect([...ALLOWED_JOURNAL_DOCUMENT_FIELDS].sort()).toEqual(
      [...contract.allowedFields].sort(),
    );
  });

  it("never allows a field the contract forbids", () => {
    const allowed = new Set<string>(ALLOWED_JOURNAL_DOCUMENT_FIELDS);
    for (const forbidden of contract.forbiddenFields) {
      expect(allowed.has(forbidden)).toBe(false);
    }
  });

  it("names every forbidden field it reports as a privacy class", () => {
    const contractForbidden = new Set(contract.forbiddenFields);
    for (const field of FORBIDDEN_JOURNAL_DOCUMENT_FIELDS) {
      expect(contractForbidden.has(field)).toBe(true);
    }
  });
});

describe("exact public journal document fingerprint (OVE-227)", () => {
  it("covers every allowed field, so no public value is unhashed", () => {
    // The v1 regression: title/body/slug/path/date/cover URL were outside the
    // fingerprint, so stale content compared equal.
    const payload = canonicalJournalSearchDocumentPayload(CANONICAL);
    for (const field of ALLOWED_JOURNAL_DOCUMENT_FIELDS) {
      expect(payload).toContain(`"${field}"`);
    }
  });

  it.each([
    ["title", { title: "Другий урожай" }],
    ["body", { body: "Змінений текст запису." }],
    ["publicSlug", { publicSlug: "inshyi-slug-0123456789" }],
    ["publicPath", { publicPath: "/journal/inshyi-slug-0123456789" }],
    ["entryDate", { entryDate: "2026-06-24T00:00:00.000Z" }],
    ["createdAt", { createdAt: "2026-06-27T10:15:30.000Z" }],
    ["noindex", { noindex: true }],
    ["entryScope", { entryScope: "space" as const }],
    ["coverSource", { coverSource: "separate" as const }],
    ["qualityClass", { qualityClass: "partial" as const }],
    [
      "qualityReasons",
      { qualityReasons: ["media_projection_unresolved"] as const },
    ],
    [
      "coverPublicUrl",
      { coverPublicUrl: `${PUBLIC_BASE_URL}derivative/stale999.webp` },
    ],
  ])("mutating %s changes the fingerprint", (field, mutation) => {
    const mutated = {
      ...CANONICAL,
      ...mutation,
    } as JournalEntrySearchContractDocument;

    expect(fingerprintJournalSearchDocument(mutated)).not.toBe(
      fingerprintJournalSearchDocument(CANONICAL),
    );
    expect(diffJournalSearchDocumentFields(CANONICAL, mutated)).toContain(
      field,
    );
  });

  it("distinguishes a removed cover from an unchanged one", () => {
    const withoutCover: JournalEntrySearchContractDocument = {
      ...CANONICAL,
      coverSource: "none",
    };
    delete (withoutCover as { coverPublicUrl?: string }).coverPublicUrl;

    expect(fingerprintJournalSearchDocument(withoutCover)).not.toBe(
      fingerprintJournalSearchDocument(CANONICAL),
    );
    expect(diffJournalSearchDocumentFields(CANONICAL, withoutCover)).toEqual([
      "coverPublicUrl",
      "coverSource",
    ]);
  });

  it("is stable and leaks no raw content", () => {
    const fingerprint = fingerprintJournalSearchDocument(CANONICAL);
    expect(fingerprint).toBe(
      fingerprintJournalSearchDocument({ ...CANONICAL }),
    );
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain("помідор");
    expect(fingerprint).not.toContain("pershyi");
  });

  it("hashes a corpus independently of document order", () => {
    expect(corpusFingerprint(["b", "a", "c"])).toBe(
      corpusFingerprint(["a", "b", "c"]),
    );
    expect(corpusFingerprint(["a", "b"])).not.toBe(corpusFingerprint(["a"]));
  });
});

describe("observed document validation (OVE-227)", () => {
  it("accepts the canonical document without consulting expected values", () => {
    const result = validate(raw());
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.document).toEqual(CANONICAL);
  });

  it("keeps a document whose text carries coordinates (ADR-0022, D1)", () => {
    const result = validate(
      raw({
        title: "Сад на 50.4501, 30.5234",
        body: "Ділянка на 50.4501234, 30.5234123 біля дороги.",
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it.each([
    ["invalid_id", { id: "not-a-uuid" }],
    ["invalid_kind", { kind: "plant_object" }],
    ["invalid_title", { title: "   " }],
    ["invalid_body", { body: 42 }],
    ["invalid_public_slug", { publicSlug: "../../etc/passwd" }],
    ["invalid_public_path", { publicPath: "/journal/other-slug" }],
    ["invalid_location_visibility", { locationVisibility: "exact" }],
    ["invalid_noindex", { noindex: "false" }],
    ["invalid_entry_date", { entryDate: "2026-06-25" }],
    ["invalid_created_at", { createdAt: 1780000000000 }],
    ["invalid_entry_scope", { entryScope: "garden" }],
    ["invalid_cover_source", { coverSource: "hero" }],
    ["invalid_quality_class", { qualityClass: "trusted" }],
    ["invalid_quality_reasons", { qualityReasons: ["unknown_reason"] }],
  ])("rejects %s", (reason, override) => {
    const result = validate(raw(override));
    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    expect(result.reasons).toContain(reason);
  });

  it("rejects a forbidden key as a privacy class, not a generic unknown", () => {
    const result = validate(raw({ ownerUserId: "u-1" }));
    expect(result.reasons).toContain("forbidden_field");
    expect(result.fields).toContain("ownerUserId");
  });

  it("rejects an unknown key", () => {
    const result = validate(raw({ someNewField: "x" }));
    expect(result.reasons).toContain("unknown_field");
  });

  it("rejects a missing required key", () => {
    const document = raw();
    delete document.title;
    const result = validate(document);
    expect(result.reasons).toContain("missing_field");
    expect(result.fields).toContain("title");
  });

  it("requires a valid region code exactly when location is region-visible", () => {
    expect(
      validate(raw({ locationVisibility: "region", coarseRegionCode: "UA-32" }))
        .ok,
    ).toBe(true);
    expect(validate(raw({ locationVisibility: "region" })).reasons).toContain(
      "invalid_coarse_region_code",
    );
    expect(
      validate(raw({ locationVisibility: "region", coarseRegionCode: "XX-99" }))
        .reasons,
    ).toContain("invalid_coarse_region_code");
    // A hidden-location document must not carry a region at all.
    expect(validate(raw({ coarseRegionCode: "UA-32" })).reasons).toContain(
      "invalid_coarse_region_code",
    );
  });

  it("requires verified documents to have no reasons and degraded documents to have reasons", () => {
    expect(
      validate(
        raw({
          qualityClass: "verified",
          qualityReasons: ["media_projection_unresolved"],
        }),
      ).reasons,
    ).toContain("invalid_quality_reasons");
    expect(
      validate(raw({ qualityClass: "partial", qualityReasons: [] })).reasons,
    ).toContain("invalid_quality_reasons");
    expect(
      validate(
        raw({
          qualityClass: "partial",
          qualityReasons: ["media_projection_unresolved"],
        }),
      ).ok,
    ).toBe(true);
  });

  it("never returns a raw value in reasons or fields", () => {
    const result = validate(
      raw({ title: "секретний заголовок", publicSlug: "bad slug!" }),
    );
    const serialized =
      JSON.stringify(result.reasons) + JSON.stringify(result.fields);
    expect(serialized).not.toContain("секретний");
    expect(serialized).not.toContain("bad slug");
  });

  describe("cover derivative URL domain and lifecycle", () => {
    it.each([
      ["a foreign origin", `https://evil.example.com/derivative/abc123.webp`],
      ["a quarantine key", `${PUBLIC_BASE_URL}quarantine/abc123.webp`],
      ["a signed query string", `${PUBLIC_BASE_URL}d/a.webp?sig=1`],
      ["a fragment", `${PUBLIC_BASE_URL}d/a.webp#x`],
      ["a relative path", "/public/derivative/abc123.webp"],
      ["credentials", "https://user:pw@media.over.garden/public/d/a.webp"],
      ["the bare base URL", PUBLIC_BASE_URL],
      ["a wrong path prefix", "https://media.over.garden/private/d/a.webp"],
    ])("rejects %s", (_label, coverPublicUrl) => {
      expect(validate(raw({ coverPublicUrl })).reasons).toContain(
        "invalid_cover_public_url",
      );
    });

    it("requires a URL when a cover is declared and forbids one when it is not", () => {
      const withoutUrl = raw();
      delete withoutUrl.coverPublicUrl;
      expect(validate(withoutUrl).reasons).toContain(
        "invalid_cover_public_url",
      );

      expect(validate(raw({ coverSource: "none" })).reasons).toContain(
        "invalid_cover_public_url",
      );

      const noCover = raw({ coverSource: "none" });
      delete noCover.coverPublicUrl;
      expect(validate(noCover).ok).toBe(true);
    });

    it("skips the origin fence only when no base URL is configured", () => {
      expect(
        normalizePublicDerivativeUrl("https://elsewhere.test/a.webp", null),
      ).toBe("https://elsewhere.test/a.webp");
      expect(
        normalizePublicDerivativeUrl(
          "https://elsewhere.test/a.webp",
          PUBLIC_BASE_URL,
        ),
      ).toBeNull();
    });
  });

  it("accepts only canonical millisecond-UTC timestamps", () => {
    expect(isCanonicalIsoTimestamp("2026-06-25T00:00:00.000Z")).toBe(true);
    expect(isCanonicalIsoTimestamp("2026-06-25T00:00:00Z")).toBe(false);
    expect(isCanonicalIsoTimestamp("2026-06-25T03:00:00.000+03:00")).toBe(
      false,
    );
    expect(isCanonicalIsoTimestamp("2026-02-30T00:00:00.000Z")).toBe(false);
    expect(isCanonicalIsoTimestamp(1780000000000)).toBe(false);
  });
});
