import { readFileSync } from "node:fs";

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
import { assertNoForbiddenDeterministicMatchingEvidence } from "@/lib/catalog/deterministic-matching-rollout-proof";
import { PublicJournalEntryView } from "@/components/public/public-journal-entry";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Database } from "@/db/schema";
import {
  buildInsertAnalyticsEventQuery,
  normalizeAnalyticsEventProperties,
} from "@/server/analytics-events";
import { buildEnqueueCatalogMatchSuggestionsRefreshJobQuery } from "@/server/catalog-repository";
import { buildPendingCatalogMatchSuggestionsQuery } from "@/server/catalog-curation-repository";
import { buildListOperatorErasureRequestsQuery } from "@/server/erasure-request-repository";
import { buildCountJournalEntriesQuery } from "@/server/erasure-dry-run-repository";
import { buildPublicVarietyJsonLd } from "@/server/public-variety-metadata";
import { scopedToUser } from "@/server/request-scope";
import {
  catalogTypeaheadHitToSuggestion,
  toCatalogTypeaheadDocument,
} from "@/server/search/catalog-documents";
import { buildJournalEntrySearchDocumentContractFixture } from "@/server/search/documents";

import {
  ALLOWED_CATALOG_DOCUMENT_KEYS,
  ALLOWED_SEARCH_DOCUMENT_KEYS,
  JOURNEY,
  catalogTypeaheadRow,
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
const schemaSql = readFileSync(
  new URL("../../sql/0001_walking_skeleton.sql", import.meta.url),
  "utf8",
);

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
  it("emits a bounded catalog document with no private keys or values", () => {
    const doc = toCatalogTypeaheadDocument(catalogTypeaheadRow());
    expect(doc).not.toBeNull();
    if (!doc) return;

    expectPublicPayloadIsClean("catalog typeahead document", doc);
    for (const key of Object.keys(doc)) {
      expect(ALLOWED_CATALOG_DOCUMENT_KEYS).toContain(key);
    }
    expect(doc.serveClass).toBe("exact");
  });

  it("never indexes user-created catalog rows", () => {
    expect(
      toCatalogTypeaheadDocument(
        catalogTypeaheadRow({ createdByUserId: POISON.ownerUserId }),
      ),
    ).toBeNull();
  });

  it("rejects search hits that smuggle private keys", () => {
    expect(catalogTypeaheadHitToSuggestion(poisonedTypeaheadHit())).toBeNull();
  });

  it("maps a clean hit to a bounded suggestion", () => {
    const suggestion = catalogTypeaheadHitToSuggestion({
      catalogItemId: JOURNEY.catalogItemId,
      displayName: "Помідор чері",
      canonicalName: "Помідор чері",
      catalogKind: "plant_variety",
      locale: "uk",
      status: "seeded",
      source: "internal_seed",
    });
    expect(suggestion).not.toBeNull();
    expectPublicPayloadIsClean("catalog suggestion", suggestion);
  });
});

describe("OVE-158 privacy invariant sweep — deterministic catalog matching", () => {
  it("queues only the provisional catalog id, never user or content data", () => {
    const compiled = buildEnqueueCatalogMatchSuggestionsRefreshJobQuery(
      testDb,
      "00000000-0000-4000-8000-000000000201",
    ).compile();
    const payload = compiled.parameters[1];

    expect(payload).toEqual({
      kind: "catalog_match_suggestions_refresh",
      sourceCatalogItemId: "00000000-0000-4000-8000-000000000201",
    });
    expectNoForbiddenValues("catalog match queue payload", payload);
    expectNoPoisonSentinels("catalog match queue payload", payload);
  });

  it("keeps operator suggestions on safe catalog identity fields", () => {
    const { sql } = buildPendingCatalogMatchSuggestionsQuery(testDb, [
      "00000000-0000-4000-8000-000000000201",
    ]).compile();

    expect(sql).toContain('from "catalog_match_suggestions"');
    for (const forbidden of [
      "safe_evidence",
      "journal_entries",
      "owner_user_id",
      "created_by_user_id as",
      "email",
      "media_assets",
      "raw_payload",
      "source_record_id",
      "ip_address",
      "user_agent",
      "latitude",
      "longitude",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it("enforces exact queue and evidence shapes at the Postgres boundary", () => {
    const suggestionSchema = schemaSql.slice(
      schemaSql.indexOf("create table if not exists catalog_match_suggestions"),
      schemaSql.indexOf("create table if not exists wishlist_items"),
    );
    const normalizedSuggestionSchema = suggestionSchema.replace(/\s+/g, " ");
    const queueSchema = schemaSql.slice(
      schemaSql.indexOf("create table if not exists job_queue"),
      schemaSql.indexOf("create table if not exists pilot_invite_grants"),
    );

    expect(suggestionSchema).not.toContain("sourceDisplayName");
    expect(suggestionSchema).toContain("ove158.catalogMatchEvidence.v2");
    expect(normalizedSuggestionSchema).toContain(
      `safe_evidence->'schemaVersion' = '"ove158.catalogMatchEvidence.v2"'::jsonb`,
    );
    expect(normalizedSuggestionSchema).toContain(
      "safe_evidence->'reasonCodes' = to_jsonb(reason_codes)",
    );
    expect(normalizedSuggestionSchema).toContain(
      'safe_evidence->\'thresholds\' = \'{"high": 95, "medium": 85, "low": 70}\'::jsonb',
    );
    expect(queueSchema).toContain("job_queue_catalog_match_payload_check");
    expect(queueSchema).toContain("payload - array[");
    expect(queueSchema).toContain("'kind',");
    expect(queueSchema).toContain("'sourceCatalogItemId'");
    expect(queueSchema).toContain(
      "rerun_requested boolean not null default false",
    );
  });
});

describe("OVE-163 privacy invariant sweep — matching rollout evidence", () => {
  it("accepts only aggregate-safe rollout evidence", () => {
    expect(() =>
      assertNoForbiddenDeterministicMatchingEvidence({
        schemaVersion: "ove163.deterministicMatchingRolloutProof.v1",
        environment: "local",
        jobKinds: [
          "catalog_match_suggestions_refresh",
          "catalog_alias_suggestions_refresh",
          "catalog_fuzzy_duplicate_qa_refresh",
          "catalog_typeahead_reindex",
        ],
        fullPersistedPairCount: 24,
        leakCheck: "passed",
      }),
    ).not.toThrow();
  });

  it("rejects poisoned private evidence recursively", () => {
    expect(() =>
      assertNoForbiddenDeterministicMatchingEvidence({
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
  it("publishes only bounded creative-work metadata", () => {
    const jsonLd = buildPublicVarietyJsonLd(publicVarietyPage());
    expect(jsonLd).not.toBeNull();
    if (!jsonLd) return;

    expectPublicPayloadIsClean("variety JSON-LD", jsonLd);
    const graph = jsonLd["@graph"] as Array<Record<string, unknown>>;
    const collection = graph.find((node) => node["@type"] === "CollectionPage");
    expect(collection?.hasPart).toEqual([
      { "@type": "Thing", name: JOURNEY.safeTitle },
    ]);
    expect(JSON.stringify(jsonLd)).not.toContain(JOURNEY.safeBody);
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
