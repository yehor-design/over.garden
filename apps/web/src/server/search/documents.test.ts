import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildJournalEntrySearchDocumentContractFixture,
  type JournalEntrySearchContractRow,
} from "./documents";

interface PublicJournalSearchContract {
  allowedFields: string[];
  forbiddenFields: string[];
  optionalFields: string[];
  requiredFields: string[];
  runtimeWriter: string;
  searchableAttributes: string[];
  filterableAttributes: string[];
  sortableAttributes: string[];
  typescriptContractFixture: string;
  qualityContract: {
    version: string;
    classes: string[];
    reasonCodes: string[];
    searchReasonCodes: string[];
  };
}

const contract = JSON.parse(
  readFileSync(
    path.resolve(
      process.cwd(),
      "../../contracts/search/public-journal-entry-search-document.json",
    ),
    "utf8",
  ),
) as PublicJournalSearchContract;

function entry(
  visibility: "private" | "public",
  overrides: Partial<JournalEntrySearchContractRow> = {},
): JournalEntrySearchContractRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "First flowers",
    body: "Помідори чері",
    public_slug: "first-flowers-abc123",
    public_gone_at: null,
    published_at: new Date("2026-06-26T12:00:00.000Z"),
    entry_date: new Date("2026-06-25T00:00:00.000Z"),
    entry_scope: "object",
    visibility,
    lifecycle_state: "active",
    location_visibility: "hidden",
    coarse_region_code: null,
    created_at: new Date("2026-06-26T00:00:00.000Z"),
    owner_profile_public_safe: true,
    cover_source: "none",
    cover_public_url: null,
    ...overrides,
  };
}

describe("journal entry search documents", () => {
  it("declares the real Python writer and this TS fixture explicitly", () => {
    expect(contract.runtimeWriter).toBe(
      "services/matching/app/search.py:journal_entry_search_document_from_row",
    );
    expect(contract.typescriptContractFixture).toBe(
      "apps/web/src/server/search/documents.ts:buildJournalEntrySearchDocumentContractFixture",
    );
  });

  it("keeps the machine-readable contract internally consistent", () => {
    expect(new Set(contract.allowedFields)).toEqual(
      new Set([...contract.requiredFields, ...contract.optionalFields]),
    );
    expect(contract.requiredFields).toContain("coverSource");
    expect(contract.requiredFields).toContain("qualityClass");
    expect(contract.requiredFields).toContain("qualityReasons");
    expect(contract.requiredFields).not.toContain("coarseRegionCode");
    expect(contract.optionalFields).toEqual([
      "coarseRegionCode",
      "coverPublicUrl",
    ]);
    expect(contract.forbiddenFields).toEqual(
      expect.arrayContaining(["coverMediaAssetId", "mediaAssetId"]),
    );
    expect(contract.searchableAttributes).toEqual([
      "title",
      "body",
      "publicSlug",
    ]);
    expect(contract.filterableAttributes).toEqual([
      "entryScope",
      "kind",
      "locationVisibility",
      "coarseRegionCode",
      "noindex",
      "coverSource",
      "qualityClass",
    ]);
    expect(contract.sortableAttributes).toEqual(["entryDate", "createdAt"]);
    expect(contract.qualityContract).toEqual({
      version: "ove331.qualityClass.v1",
      classes: ["verified", "partial", "unverified"],
      reasonCodes: [
        "coarse_region_unavailable",
        "media_projection_unresolved",
        "analytics_delivery_unavailable",
      ],
      searchReasonCodes: [
        "coarse_region_unavailable",
        "media_projection_unresolved",
      ],
    });
  });

  it("does not index private entries", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(entry("private")),
    ).toBeNull();
  });

  it("does not index public entries until a public slug exists", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", { public_slug: null }),
      ),
    ).toBeNull();
  });

  it("does not index archived public entries", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", { lifecycle_state: "archived" }),
      ),
    ).toBeNull();
  });

  it("does not index unpublished or profile-unsafe entries", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", { published_at: null }),
      ),
    ).toBeNull();
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", { owner_profile_public_safe: false }),
      ),
    ).toBeNull();
  });

  it("does not index public-gone entries", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", {
          public_gone_at: new Date("2026-06-26T12:00:00.000Z"),
        }),
      ),
    ).toBeNull();
  });

  it("does not index entries with unsafe location visibility", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", { location_visibility: "exact" }),
      ),
    ).toBeNull();
  });

  it("does not index entries with unsafe entry scope", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", { entry_scope: "raw-body-tag" }),
      ),
    ).toBeNull();
  });

  it("does not index invalid document ids", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", { id: "not-a-uuid" }),
      ),
    ).toBeNull();
  });

  it("admits a region-visible entry without a supported coarse region as hidden partial", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        entry("public", {
          location_visibility: "region",
          coarse_region_code: "Kyiv apartment address",
        }),
      ),
    ).toMatchObject({
      locationVisibility: "hidden",
      qualityClass: "partial",
      qualityReasons: ["coarse_region_unavailable"],
    });
  });

  it("indexes public entries with a narrow payload including coverSource", () => {
    const document = buildJournalEntrySearchDocumentContractFixture(
      entry("public"),
    );

    expect(document).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      title: "First flowers",
      body: "Помідори чері",
      publicSlug: "first-flowers-abc123",
      publicPath: "/journal/first-flowers-abc123",
      locationVisibility: "hidden",
      noindex: false,
      entryDate: "2026-06-25T00:00:00.000Z",
      entryScope: "object",
      createdAt: "2026-06-26T00:00:00.000Z",
      kind: "journal_entry",
      coverSource: "none",
      qualityClass: "verified",
      qualityReasons: [],
    });
    expect(Object.keys(document ?? {}).sort()).toEqual(
      [...contract.requiredFields].sort(),
    );
    expect(contract.forbiddenFields).toEqual(
      expect.arrayContaining([
        "ownerUserId",
        "owner_user_id",
        "plantObjectId",
        "quarantineKey",
        "originalKey",
        "mediaKey",
        "latitude",
        "longitude",
        "coarse_region_code",
        "requestMetadata",
        "ipAddress",
        "userAgent",
        "referrer",
        "inviteToken",
        "lifecycleState",
        "visibility",
      ]),
    );
    for (const key of contract.forbiddenFields) {
      expect(document).not.toHaveProperty(key);
    }
  });

  it("normalizes calendar dates independently of the proof-process timezone", () => {
    const originalTimezone = process.env.TZ;

    try {
      const databaseTimestamp = new Date("2026-08-12T21:15:00.000Z");
      for (const [timezone, rawIso] of [
        ["Europe/Sofia", "2026-08-12T21:00:00.000Z"],
        ["America/New_York", "2026-08-13T04:00:00.000Z"],
      ] as const) {
        process.env.TZ = timezone;
        const databaseCalendarDate = new Date(2026, 7, 13);
        expect(databaseCalendarDate.toISOString()).toBe(rawIso);

        expect(
          buildJournalEntrySearchDocumentContractFixture(
            entry("public", {
              entry_date: databaseCalendarDate,
              created_at: databaseTimestamp,
            }),
          ),
        ).toMatchObject({
          entryDate: "2026-08-13T00:00:00.000Z",
          createdAt: "2026-08-12T21:15:00.000Z",
        });
      }
      expect(
        buildJournalEntrySearchDocumentContractFixture(
          entry("public", { entry_date: "2026-08-13" }),
        )?.entryDate,
      ).toBe("2026-08-13T00:00:00.000Z");
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("indexes supported coarse region code only when visibility is region", () => {
    const document = buildJournalEntrySearchDocumentContractFixture(
      entry("public", {
        location_visibility: "region",
        coarse_region_code: "UA-30",
      }),
    );

    expect(document).toMatchObject({
      locationVisibility: "region",
      coarseRegionCode: "UA-30",
      coverSource: "none",
      qualityClass: "verified",
      qualityReasons: [],
    });
    expect(Object.keys(document ?? {}).sort()).toEqual(
      [...contract.requiredFields, "coarseRegionCode"].sort(),
    );
  });

  it("indexes bounded cover presentation without media ids", () => {
    const document = buildJournalEntrySearchDocumentContractFixture(
      entry("public", {
        cover_source: "separate",
        cover_public_url: "https://media.over.garden/derivatives/cover.webp",
      }),
    );

    expect(document).toMatchObject({
      coverSource: "separate",
      coverPublicUrl: "https://media.over.garden/derivatives/cover.webp",
      qualityClass: "verified",
      qualityReasons: [],
    });
    expect(document).not.toHaveProperty("mediaAssetId");
    expect(document).not.toHaveProperty("coverMediaAssetId");
  });

  it("admits safe text when an optional cover projection is unusable", () => {
    const document = buildJournalEntrySearchDocumentContractFixture(
      entry("public", {
        cover_source: "separate",
        cover_public_url: "https://media.over.garden/quarantine/original.jpg",
      }),
    );

    expect(document).toMatchObject({
      coverSource: "none",
      qualityClass: "partial",
      qualityReasons: ["media_projection_unresolved"],
    });
    expect(document).not.toHaveProperty("coverPublicUrl");
  });

  it("indexes space-level entries only with bounded scope metadata", () => {
    const document = buildJournalEntrySearchDocumentContractFixture(
      entry("public", {
        entry_scope: "space",
        location_visibility: "hidden",
      }),
    );

    expect(document).toMatchObject({
      entryScope: "space",
      locationVisibility: "hidden",
      coverSource: "none",
    });
    expect(document).not.toHaveProperty("plantObjectId");
    expect(document).not.toHaveProperty("spaceId");
  });
});
