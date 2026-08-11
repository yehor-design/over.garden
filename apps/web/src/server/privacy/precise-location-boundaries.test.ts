/**
 * OVE-234 — every named write, query, and projection boundary must reject or
 * withhold precise-location text, and must keep accepting the benign corpus.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { legacyBodyToJournalDocumentV1 } from "@/lib/garden/journal-document";
import { preciseLocationRejectionMessage } from "@/lib/privacy/precise-location-copy";
import { assertNoPreciseLocationInJournalDocument } from "@/lib/privacy/precise-location-journal-document";
import {
  PreciseLocationTextError,
  sanitizePreciseLocationSearchQuery,
} from "@/lib/privacy/precise-location-text";
import { PUBLIC_LOCALES } from "@/lib/public-localization";
import { normalizeAnalyticsEventProperties } from "@/server/analytics-events";
import { addEngagementComment } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { normalizeOwnerPublicProfileInput } from "@/server/owner-profile-repository";
import { resolveJournalContentForWrite } from "@/server/journal-document-persistence";
import {
  normalizeLineagePendingSourceLabel,
  normalizeLineageSourceReferenceLabel,
} from "@/server/lineage-repository";
import { normalizeLineageQuestionText } from "@/server/lineage-interactions-repository";
import {
  PRECISE_LOCATION_INVENTORY_SQL,
  assertPreciseLocationInventorySqlIsSelectOnly,
  buildPreciseLocationInventoryReport,
  classifyPreciseLocationSurface,
  formatPreciseLocationInventoryReport,
} from "@/server/privacy/precise-location-inventory";
import { buildJournalEntrySearchDocumentContractFixture } from "@/server/search/documents";

const CORPUS = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      "../../contracts/privacy/precise-location-text-corpus.json",
    ),
    "utf8",
  ),
) as {
  rejected: Array<{ id: string; text: string }>;
  accepted: Array<{ id: string; text: string }>;
};

const COORDINATES = "50.45010,30.52340";
const SAFE_TEXT = "Полив грядку зранку, було 12.5 °C.";

function expectNoEcho(error: unknown) {
  expect(error).toBeInstanceOf(PreciseLocationTextError);
  expect((error as Error).message).not.toContain("50.45010");
  expect((error as Error).message).not.toContain("30.52340");
}

describe("journal write boundary", () => {
  it("rejects coordinates in a structured document before persistence", () => {
    try {
      resolveJournalContentForWrite({
        contentDocument: legacyBodyToJournalDocumentV1(
          `Ділянка тут: ${COORDINATES}`,
        ),
        requireStructured: false,
      });
      throw new Error("expected rejection");
    } catch (error) {
      expectNoEcho(error);
    }
  });

  it("rejects coordinates split across inline spans", () => {
    const document = {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: "b1",
          type: "paragraph" as const,
          spans: [
            { text: "50.450" },
            { text: "10,30.52", marks: [{ type: "bold" as const }] },
            { text: "340" },
          ],
        },
      ],
    };

    expect(() => assertNoPreciseLocationInJournalDocument(document)).toThrow(
      PreciseLocationTextError,
    );
  });

  it("rejects coordinates inside a link href", () => {
    const document = {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: "b1",
          type: "paragraph" as const,
          spans: [
            {
              text: "мапа",
              marks: [
                {
                  type: "link" as const,
                  href: "https://www.google.com/maps/@50.45010,30.52340,17z",
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() => assertNoPreciseLocationInJournalDocument(document)).toThrow(
      PreciseLocationTextError,
    );
  });

  it("preserves the canonical document shape for safe content", () => {
    const document = legacyBodyToJournalDocumentV1(SAFE_TEXT);
    const resolved = resolveJournalContentForWrite({
      contentDocument: document,
      requireStructured: false,
    });

    expect(resolved.document).toEqual(document);
    expect(resolved.body).toContain("Полив грядку");
  });

  it.each(CORPUS.accepted.map((sample) => [sample.id, sample.text] as const))(
    "accepts benign journal text %s",
    (_id, text) => {
      expect(() =>
        resolveJournalContentForWrite({
          contentDocument: legacyBodyToJournalDocumentV1(text),
          requireStructured: false,
        }),
      ).not.toThrow();
    },
  );

  it.each(CORPUS.rejected.map((sample) => [sample.id, sample.text] as const))(
    "rejects coordinate journal text %s",
    (_id, text) => {
      expect(() =>
        resolveJournalContentForWrite({
          contentDocument: legacyBodyToJournalDocumentV1(text),
          requireStructured: false,
        }),
      ).toThrow(PreciseLocationTextError);
    },
  );
});

describe("profile write boundary", () => {
  const base = {
    avatarMediaAssetId: null,
    displayName: null,
    bio: null,
    languages: [] as string[],
    locationVisibility: "hidden" as const,
    coarseRegionCode: null,
    profileVisibility: "public" as const,
    relationshipVisibility: "counts" as const,
  };

  it("rejects a coordinate-bearing bio with a typed error code", () => {
    const result = normalizeOwnerPublicProfileInput({
      ...base,
      bio: `Мій сад: ${COORDINATES}`,
    });

    expect(result).toEqual({ ok: false, error: "precise_location" });
  });

  it("accepts a region-level bio", () => {
    const result = normalizeOwnerPublicProfileInput({
      ...base,
      bio: "Київська область, вирощую томати.",
    });

    expect(result.ok).toBe(true);
  });
});

describe("lineage write boundaries", () => {
  it("rejects coordinates in source labels and questions", () => {
    for (const normalize of [
      normalizeLineageSourceReferenceLabel,
      normalizeLineagePendingSourceLabel,
      normalizeLineageQuestionText,
    ]) {
      try {
        normalize(`Від сусіда ${COORDINATES}`);
        throw new Error("expected rejection");
      } catch (error) {
        expectNoEcho(error);
      }
    }
  });

  it("keeps accepting ordinary provenance text", () => {
    expect(
      normalizeLineageSourceReferenceLabel("Насіння від Марії, 2026"),
    ).toBe("Насіння від Марії, 2026");
    expect(normalizeLineageQuestionText("Коли ви збирали насіння?")).toBe(
      "Коли ви збирали насіння?",
    );
  });
});

describe("comment write boundary", () => {
  it("refuses before touching the database executor", async () => {
    const executor = new Proxy(
      {},
      {
        get() {
          throw new Error("executor must not be reached on refusal");
        },
      },
    ) as never;

    await expect(
      addEngagementComment(
        scopedToUser("11111111-1111-4111-8111-111111111111"),
        {
          target: {
            kind: "journal_entry",
            ref: "pershyi-urozhai",
          },
          body: `Гарний сад! ${COORDINATES}`,
          clientMutationId: "22222222-2222-4222-8222-222222222222",
        },
        executor,
      ),
    ).rejects.toThrow(PreciseLocationTextError);
  });
});

describe("public query boundaries", () => {
  it("drops a coordinate-bearing search term instead of reflecting it", () => {
    expect(sanitizePreciseLocationSearchQuery(COORDINATES)).toMatchObject({
      query: "",
      rejected: true,
    });
    expect(sanitizePreciseLocationSearchQuery("томати")).toMatchObject({
      query: "томати",
      rejected: false,
    });
  });

  it("keeps the community search boundary on the same canonical sanitizer", () => {
    const communityQuery = sanitizePreciseLocationSearchQuery(
      `догляд ${COORDINATES}`,
    );
    expect(communityQuery).toMatchObject({
      query: "",
      rejected: true,
    });
    expect(JSON.stringify(communityQuery)).not.toContain(COORDINATES);
  });
});

describe("public search projection", () => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Перший урожай",
    body: "Зібрав перші плоди.",
    public_slug: "pershyi-urozhai",
    public_noindex: false,
    public_gone_at: null,
    published_at: "2026-07-01T00:00:00.000Z",
    entry_date: "2026-07-01T00:00:00.000Z",
    entry_scope: "object" as const,
    created_at: "2026-07-01T00:00:00.000Z",
    visibility: "public" as const,
    lifecycle_state: "active" as const,
    location_visibility: "hidden" as const,
    owner_profile_public_safe: true,
  };

  it("projects a safe row", () => {
    expect(buildJournalEntrySearchDocumentContractFixture(row)).not.toBeNull();
  });

  it.each(["title", "body"] as const)(
    "drops a legacy row whose %s carries coordinates",
    (field) => {
      expect(
        buildJournalEntrySearchDocumentContractFixture({
          ...row,
          [field]: `Ділянка ${COORDINATES}`,
        }),
      ).toBeNull();
    },
  );
});

describe("analytics boundary", () => {
  it("fails closed when a property value carries coordinates", () => {
    expect(() =>
      normalizeAnalyticsEventProperties({
        entry_scope: COORDINATES,
      } as never),
    ).toThrow();
  });
});

describe("localized refusal copy", () => {
  it.each(PUBLIC_LOCALES)(
    "has actionable %s guidance without the value",
    (locale) => {
      for (const surface of [
        "journal_body",
        "comment",
        "profile_bio",
        "lineage_question",
        "queue_payload",
      ] as const) {
        const message = preciseLocationRejectionMessage(surface, locale);
        expect(message.length).toBeGreaterThan(20);
        expect(message).not.toContain("50.45010");
      }
    },
  );

  it("falls back to the default locale for unknown input", () => {
    expect(preciseLocationRejectionMessage("comment", "de")).toBe(
      preciseLocationRejectionMessage("comment", "uk"),
    );
  });
});

describe("read-only inventory", () => {
  it("only issues SELECT statements", () => {
    expect(() => assertPreciseLocationInventorySqlIsSelectOnly()).not.toThrow();
    for (const statement of Object.values(PRECISE_LOCATION_INVENTORY_SQL)) {
      expect(statement.trim().toLowerCase().startsWith("select")).toBe(true);
    }
  });

  it("reports counts and row ids but never the scanned text", () => {
    const surface = classifyPreciseLocationSurface("journal_entry_body", [
      { id: "row-1", value: `Ділянка ${COORDINATES}`, publiclyVisible: true },
      { id: "row-2", value: SAFE_TEXT, publiclyVisible: true },
    ]);
    const report = buildPreciseLocationInventoryReport([surface]);
    const formatted = formatPreciseLocationInventoryReport(report);

    expect(report.totals).toMatchObject({
      scannedRows: 2,
      affectedRows: 1,
      affectedPublicRows: 1,
    });
    expect(report.clean).toBe(false);
    expect(formatted).toContain("row-1");
    expect(formatted).not.toContain("50.45010");
    expect(formatted).not.toContain("Ділянка");
  });
});
