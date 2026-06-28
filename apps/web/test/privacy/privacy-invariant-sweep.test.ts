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
  renderGoneJournalEntryHtml,
  renderNotFoundJournalEntryHtml,
  renderPublicJournalEntryHtml,
} from "@/app/journal/[slug]/render";
import type { Database } from "@/db/schema";
import {
  buildInsertAnalyticsEventQuery,
  normalizeAnalyticsEventProperties,
} from "@/server/analytics-events";
import { buildListOperatorErasureRequestsQuery } from "@/server/erasure-request-repository";
import { summarizePublicVarietyHealthRows } from "@/server/pilot-health-repository";
import { buildPilotSmokeReadiness } from "@/server/pilot-smoke-readiness";
import { buildPublicVarietyJsonLd } from "@/server/public-variety-metadata";
import { scopedToUser } from "@/server/request-scope";
import {
  catalogTypeaheadHitToSuggestion,
  toCatalogTypeaheadDocument,
} from "@/server/search/catalog-documents";
import { toJournalEntrySearchDocument } from "@/server/search/documents";

import {
  ALLOWED_CATALOG_DOCUMENT_KEYS,
  ALLOWED_SEARCH_DOCUMENT_KEYS,
  JOURNEY,
  catalogTypeaheadRow,
  hiddenLocationJournalEntryPage,
  markupJournalEntryPage,
  poisonOperatorEnv,
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
      toJournalEntrySearchDocument(
        publicJournalSearchRow({ visibility: "private", public_slug: null }),
      ),
    ).toBeNull();
  });

  it("does not index archived or tombstoned public entries", () => {
    expect(
      toJournalEntrySearchDocument(
        publicJournalSearchRow({ lifecycle_state: "archived" }),
      ),
    ).toBeNull();
    expect(
      toJournalEntrySearchDocument(
        publicJournalSearchRow({
          public_gone_at: new Date("2026-06-27T00:00:00.000Z"),
        }),
      ),
    ).toBeNull();
  });

  it("drops region entries whose coarse code is really a precise string", () => {
    expect(
      toJournalEntrySearchDocument(
        publicJournalSearchRow({ coarse_region_code: POISON.streetAddress }),
      ),
    ).toBeNull();
  });

  it("emits only a bounded public-safe document once published", () => {
    const doc = toJournalEntrySearchDocument(publicJournalSearchRow());
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
      noindex: true,
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
      locale: "uk",
      status: "seeded",
      source: "internal_seed",
    });
    expect(suggestion).not.toBeNull();
    expectPublicPayloadIsClean("catalog suggestion", suggestion);
  });
});

describe("OVE-40 privacy invariant sweep — public journal SSR", () => {
  it("renders region-safe, derivative-only, noindex HTML with no private values", () => {
    const html = renderPublicJournalEntryHtml(publicJournalEntryPage());

    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain(`Region: ${JOURNEY.regionLabel}`);
    expect(html).toContain(JOURNEY.derivativePublicUrl);
    expectNoForbiddenValues("public journal HTML", html);
    expectNoPoisonSentinels("public journal HTML", html);
  });

  it("never prints a location when the gardener kept it hidden", () => {
    const html = renderPublicJournalEntryHtml(hiddenLocationJournalEntryPage());

    expect(html).not.toContain("Region:");
    expectNoForbiddenValues("hidden-location journal HTML", html);
    expectNoPoisonSentinels("hidden-location journal HTML", html);
  });

  it("escapes user markup so titles and bodies cannot inject scripts", () => {
    const html = renderPublicJournalEntryHtml(markupJournalEntryPage());

    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps tombstone and not-found pages noindex and content-free", () => {
    const pages: ReadonlyArray<readonly [string, string]> = [
      ["gone", renderGoneJournalEntryHtml(JOURNEY.publicSlug)],
      ["not-found", renderNotFoundJournalEntryHtml()],
    ];

    for (const [label, html] of pages) {
      expect(html).toContain('name="robots" content="noindex, nofollow"');
      expect(html).not.toContain(JOURNEY.safeBody);
      expectNoForbiddenValues(`${label} journal HTML`, html);
      expectNoPoisonSentinels(`${label} journal HTML`, html);
    }
  });
});

describe("OVE-40 privacy invariant sweep — public variety JSON-LD", () => {
  it("publishes only bounded creative-work metadata", () => {
    const jsonLd = buildPublicVarietyJsonLd(publicVarietyPage());
    expect(jsonLd).not.toBeNull();
    if (!jsonLd) return;

    expectPublicPayloadIsClean("variety JSON-LD", jsonLd);
    expect(jsonLd.hasPart).toHaveLength(1);
    expect(jsonLd.hasPart[0]).toMatchObject({
      headline: JOURNEY.safeTitle,
      datePublished: "2026-06-25",
      url: `https://over.garden/journal/${JOURNEY.publicSlug}`,
    });
    expect(JSON.stringify(jsonLd)).not.toContain(JOURNEY.safeBody);
  });

  it("returns null (noindex) for thin variety pages", () => {
    expect(
      buildPublicVarietyJsonLd(
        publicVarietyPage({ entryCount: 1, aggregateBodyLength: 50 }),
      ),
    ).toBeNull();
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
        sync_status: "online",
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
      sync_status: "online",
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

  it("pilot-health readout exposes only aggregate counts", () => {
    const summary = summarizePublicVarietyHealthRows(
      [
        {
          publicSlug: `POISON-${JOURNEY.catalogPublicSlug}`,
          entryCount: 5,
          aggregateBodyLength: 1200,
        },
      ],
      [{ publicSlug: "POISON-archived-slug", archivedOrGoneEntryCount: 2 }],
    );

    expectPublicPayloadIsClean("pilot health summary", summary);
    expect(summary).toMatchObject({
      promotedIndexableCount: 1,
      thinNoindexCount: 0,
      currentPublicVarietyCount: 1,
    });
    for (const value of Object.values(summary)) {
      if (value && typeof value === "object") continue; // threshold descriptor
      expect(typeof value).toBe("number");
    }
  });

  it("pilot smoke readiness reports classes without echoing secrets", () => {
    const readiness = buildPilotSmokeReadiness({
      env: poisonOperatorEnv(),
      databaseProbe: { reachable: true },
      generatedAt: new Date("2026-06-29T00:00:00.000Z"),
    });

    expectNoForbiddenValues("pilot smoke readiness", readiness);
    expectNoPoisonSentinels("pilot smoke readiness", readiness);
    expect(readiness.overall).toBe("ready");
  });
});
