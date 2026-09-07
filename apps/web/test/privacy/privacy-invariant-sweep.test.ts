
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import {
  renderGonePublicJournalEntryHtml,
  renderNotFoundPublicJournalEntryHtml,
} from "@/lib/public-journal-entry-lifecycle";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { assertNoForbiddenMatchingEvidence } from "@/lib/catalog/matching-evidence-safety";
import { PublicJournalEntryView } from "@/components/public/public-journal-entry";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Database } from "@/db/schema";
import {
  buildInsertAnalyticsEventQuery,
  normalizeAnalyticsEventProperties,
} from "@/server/analytics-events";
import { buildListOperatorErasureRequestsQuery } from "@/server/erasure-request-repository";
import { buildCountJournalEntriesQuery } from "@/server/erasure-dry-run-repository";
import { buildPublicVarietyJsonLd } from "@/server/public-variety-metadata";
import { scopedToUser } from "@/server/request-scope";
import { parseCatalogTypeaheadResponse } from "@/lib/garden/catalog-typeahead-contract";
import { buildJournalEntrySearchDocumentContractFixture } from "@/server/search/documents";

import {
  ALLOWED_SEARCH_DOCUMENT_KEYS,
  JOURNEY,
  hiddenLocationJournalEntryPage,
  markupJournalEntryPage,
  poisonedTypeaheadHit,
  publicJournalEntryPage,
  publicJournalSearchRow,
  publicVarietyPage,
} from "./journey-fixture";
import {
  POISON,
  expectNoForbiddenValues,
  expectNoPoisonSentinels,
  expectPublicPayloadIsClean,
} from "./poison";

class TestPostgresDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });

describe("OVE-40 privacy invariant sweep — search index", () => {
  it("does not index the journey entry while it is still private", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        publicJournalSearchRow({ visibility: "private", public_slug: null }),
      ),
    ).toBeNull();
  });

  it("does not index archived or tombstoned public entries", () => {
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        publicJournalSearchRow({ lifecycle_state: "archived" }),
      ),
    ).toBeNull();
    expect(
      buildJournalEntrySearchDocumentContractFixture(
        publicJournalSearchRow({
          public_gone_at: new Date("2026-06-27T00:00:00.000Z"),
        }),
      ),
    ).toBeNull();
  });

  it("hides a non-expressible coarse region without projecting its precise string", () => {
    const document = buildJournalEntrySearchDocumentContractFixture(
      publicJournalSearchRow({ coarse_region_code: POISON.streetAddress }),
    );

    expect(document).toMatchObject({
      locationVisibility: "hidden",
      qualityClass: "partial",
      qualityReasons: ["coarse_region_unavailable"],
    });
    expect(document).not.toHaveProperty("coarseRegionCode");
    expect(JSON.stringify(document)).not.toContain(POISON.streetAddress);
  });

  it("emits only a bounded public-safe document once published", () => {
    const doc = buildJournalEntrySearchDocumentContractFixture(
      publicJournalSearchRow(),
    );
    expect(doc).not.toBeNull();
    if (!doc) return;

    expectPublicPayloadIsClean("journal search document", doc);
    for (const key of Object.keys(doc)) {
      expect(ALLOWED_SEARCH_DOCUMENT_KEYS).toContain(key);
    }
    expect(doc).toMatchObject({
      publicPath: `/journal/${JOURNEY.publicSlug}`,
      locationVisibility: "region",
      coarseRegionCode: JOURNEY.regionCode,
      noindex: false,
      kind: "journal_entry",
    });
  });
});

describe("OVE-40 privacy invariant sweep — catalog typeahead", () => {
  // The two tests that stood here checked the Meilisearch catalog document:
  // that it carried no private key, and that it refused a gardener's own row.
  // Meilisearch left the pick path with the closeout (OVE-399, ADR-0026 D7)
  // and the document does not exist. The invariant did not leave with it — it
  // moved to the answer the picker actually returns, which the next test reads
  // from the response contract itself.

  it("drops every key the picker row shape does not name, poison included", () => {
    const rows = parseCatalogTypeaheadResponse({
      suggestions: [
        {
          ...poisonedTypeaheadHit(),
          id: JOURNEY.catalogItemId,
          displayName: "Помідор чері",
          kind: "cultivar",
        },
      ],
    });
    expect(rows).toEqual([
      { id: JOURNEY.catalogItemId, displayName: "Помідор чері", kind: "cultivar" },
    ]);
    expectPublicPayloadIsClean("catalog picker row", rows);
  });

  it("rejects a picker row without a canonical identity", () => {
    expect(
      parseCatalogTypeaheadResponse({ suggestions: [poisonedTypeaheadHit()] }),
    ).toEqual([]);
  });
});

describe("OVE-163 privacy invariant sweep — matching rollout evidence", () => {
  it("accepts only aggregate-safe rollout evidence", () => {
    expect(() =>
      assertNoForbiddenMatchingEvidence({
        schemaVersion: "ove163.deterministicMatchingRolloutProof.v1",
        environment: "local",
        jobKinds: ["journal_entry_index", "journal_entry_unindex"],
        fullPersistedPairCount: 24,
        leakCheck: "passed",
      }),
    ).not.toThrow();
  });

  it("rejects poisoned private evidence recursively", () => {
    expect(() =>
      assertNoForbiddenMatchingEvidence({
        summary: { email: POISON.email },
      }),
    ).toThrow(/forbidden field/);
  });
});

describe("OVE-40 privacy invariant sweep — public journal SSR", () => {
  it("renders region-safe, derivative-only HTML with no private values", () => {
    const page = publicJournalEntryPage();
    const html = renderPublicJournalEntry(page);

    expect(html).toContain(`Регіон: ${JOURNEY.regionLabel}`);
    expect(html).toContain(JOURNEY.derivativePublicUrl);
    expectNoForbiddenValues("public journal HTML", html);
    expectNoPoisonSentinels("public journal HTML", html);
  });

  it("never prints a location when the gardener kept it hidden", () => {
    const html = renderPublicJournalEntry(hiddenLocationJournalEntryPage());

    expect(html).not.toContain("Region:");
    expectNoForbiddenValues("hidden-location journal HTML", html);
    expectNoPoisonSentinels("hidden-location journal HTML", html);
  });

  it("escapes user markup so titles and bodies cannot inject scripts", () => {
    const html = renderPublicJournalEntry(markupJournalEntryPage());

    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps tombstone and not-found pages noindex and content-free", () => {
    const pages: ReadonlyArray<readonly [string, string]> = [
      ["gone", renderGonePublicJournalEntryHtml("uk")],
      ["not-found", renderNotFoundPublicJournalEntryHtml("uk")],
    ];

    for (const [label, html] of pages) {
      expect(html).toContain('name="robots" content="noindex, nofollow"');
      expect(html).not.toContain(JOURNEY.safeBody);
      expectNoForbiddenValues(`${label} journal HTML`, html);
      expectNoPoisonSentinels(`${label} journal HTML`, html);
    }
  });
});

function renderPublicJournalEntry(
  page: ReturnType<typeof publicJournalEntryPage>,
) {
  return renderToStaticMarkup(
    createElement(PublicJournalEntryView, {
      locale: "uk",
      copy: getPublicJournalEntryCopy("uk"),
      page,
      directoryReturnTo: "/journals",
      ownerControl: null,
    }),
  );
}

describe("OVE-40 privacy invariant sweep — public variety JSON-LD", () => {
  it("publishes only the organism's bounded facts: a Taxon keyed by its permalink, no entry text", () => {
    const jsonLd = buildPublicVarietyJsonLd(publicVarietyPage());
    expect(jsonLd).not.toBeNull();
    if (!jsonLd) return;

    expectPublicPayloadIsClean("variety JSON-LD", jsonLd);
    const graph = jsonLd["@graph"] as Array<Record<string, unknown>>;
    const taxon = graph.find((node) => node["@type"] === "Taxon");
    expect(taxon).toMatchObject({
      "@id": expect.stringContaining(`/id/${JOURNEY.catalogItemId}`),
      name: JOURNEY.catalogCanonicalName,
      taxonRank: "cultivar",
    });
    expect(taxon).not.toHaveProperty("hasPart");
    expect(graph.some((node) => node["@type"] === "BreadcrumbList")).toBe(true);
    const serialized = JSON.stringify(jsonLd);
    expect(serialized).not.toContain(JOURNEY.safeBody);
    expect(serialized).not.toContain(JOURNEY.safeTitle);
  });

  it("returns a graph for thin variety pages: every live page is indexable (ADR-0022, D3)", () => {
    expect(
      buildPublicVarietyJsonLd(
        publicVarietyPage({ entryCount: 1, aggregateBodyLength: 50 }),
      ),
    ).toMatchObject({ "@context": "https://schema.org" });
  });
});

describe("OVE-40 privacy invariant sweep — analytics", () => {
  it("throws on raw content, precise location, media, or PII property keys", () => {
    expect(() =>
      normalizeAnalyticsEventProperties({ title: JOURNEY.safeTitle } as never),
    ).toThrow(/Forbidden analytics event property/);
    expect(() =>
      normalizeAnalyticsEventProperties({ body: JOURNEY.safeBody } as never),
    ).toThrow(/Forbidden analytics event property/);
    expect(() =>
      normalizeAnalyticsEventProperties({
        coordinates: POISON.preciseCoordinates,
      } as never),
    ).toThrow(/Forbidden analytics event property/);
    expect(() =>
      normalizeAnalyticsEventProperties({ email: POISON.email } as never),
    ).toThrow(/Forbidden analytics event property/);
    expect(() =>
      normalizeAnalyticsEventProperties({ exif_gps: POISON.exifGps } as never),
    ).toThrow(/Forbidden analytics event property/);
  });

  it("stores only bounded enum/boolean properties for a logged entry", () => {
    // Even with a poison identity, the analytics *properties* bag stays bounded.
    // Owner/session ids are pseudonymous server-side columns (not a public
    // surface), so we scan only the normalized properties parameter.
    const scope = scopedToUser(POISON.ownerUserId, POISON.sessionId);
    const compiled = buildInsertAnalyticsEventQuery(testDb, scope, {
      eventName: "entry_logged",
      properties: {
        entry_scope: "object",
        has_photo: true,
        is_backdated: true,
        location_visibility_level: "region",
        activation_source: "public_variety",
        source_surface_kind: "variety",
        variety_state: "selected",
      },
      journalEntryId: JOURNEY.entryId,
      plantObjectId: "00000000-0000-4000-8000-0000000000c3",
    }).compile();

    const properties = compiled.parameters[3];
    expect(properties).toEqual({
      entry_scope: "object",
      has_photo: true,
      is_backdated: true,
      location_visibility_level: "region",
      activation_source: "public_variety",
      source_surface_kind: "variety",
      variety_state: "selected",
    });
    expectNoForbiddenValues("analytics properties", properties);
    expectNoPoisonSentinels("analytics properties", properties);
    expect(JSON.stringify(properties)).not.toContain(JOURNEY.safeBody);
  });
});

describe("OVE-40 privacy invariant sweep — operator readbacks", () => {
  it("erasure operator list selects only safe request columns", () => {
    const { sql } = buildListOperatorErasureRequestsQuery(testDb, 25).compile();

    expect(sql).toContain('from "erasure_requests"');
    expect(sql).toContain('"requester_user_id" as "requesterUserId"');
    expect(sql).toContain('"handled_status" as "handledStatus"');

    for (const forbidden of [
      "journal_entries",
      "media_assets",
      "quarantine_key",
      "derivative_key",
      "handled_by_user_id",
      "email",
      "ip_address",
      "user_agent",
      "coordinates",
      "latitude",
      "longitude",
      "session_id",
      "password",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it("erasure dry-run counts journal rows without selecting deleted content", () => {
    const { sql } = buildCountJournalEntriesQuery(testDb, POISON.ownerUserId, {
      visibility: "public",
      lifecycleState: "deleted_retention",
    }).compile();

    expect(sql).toContain('"journal_entries"');
    expect(sql).toContain('"owner_user_id" = $1');
    expect(sql).toMatch(/count\(\*\)/i);

    for (const forbidden of [
      "title",
      "body",
      "public_slug",
      "quarantine_key",
      "derivative_key",
      "email",
      "ip_address",
      "user_agent",
      "coordinates",
      "latitude",
      "longitude",
      "session_id",
      "password",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});
