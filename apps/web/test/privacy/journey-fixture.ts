import { readFileSync } from "node:fs";
import path from "node:path";

import type { PublicJournalEntryPage } from "@/server/journal-repository";
import type { PublicVarietyPage } from "@/server/public-variety-repository";
import { evaluatePublicVarietyIndexState } from "@/server/public-variety-indexing";
import type { CatalogTypeaheadRow } from "@/server/search/catalog-documents";
import type { JournalEntrySearchContractRow } from "@/server/search/documents";

import { POISON } from "./poison";

// One realistic OverGarden journey: a gardener logs a private first entry, then
// publishes it (region-level visibility, one stripped photo derivative), and it
// later surfaces on a public variety page. Public-safe content is intentionally
// readable; everything private/operator-only is a poison token.

export const JOURNEY = {
  entryId: "00000000-0000-4000-8000-0000000000a1",
  plantObjectId: "00000000-0000-4000-8000-0000000000c3",
  mediaId: "00000000-0000-4000-8000-0000000000b2",
  catalogItemId: "00000000-0000-4000-8000-000000000101",
  publicSlug: "first-flowers-0000000000a1",
  catalogPublicSlug: "pomidor-cheri-0000000101",
  catalogCanonicalName: "Помідор чері",
  regionCode: "UA-30",
  regionLabel: "Ukraine - Kyiv City",
  safeTitle: "First flowers on the balcony",
  safeBody:
    "Two cherry tomato trusses opened this morning. The seedlings from the spring sowing are finally fruiting and the bees found them fast.",
  spaceDisplayName: "Balcony",
  plantDisplayName: "Cherry tomato",
  entryDate: new Date("2026-06-25T00:00:00.000Z"),
  publishedAt: new Date("2026-06-26T00:00:00.000Z"),
  derivativePublicUrl:
    "https://media.over.garden/derivatives/first-flowers-0000000000a1.webp",
} as const;

// Public journal entries never carry these columns in their typed read models,
// but a future careless `...row` spread could. Seeding them as runtime-only
// extras turns any such regression into a hard test failure.
function seedPrivateColumns<T>(row: T): T {
  return {
    ...(row as Record<string, unknown>),
    owner_user_id: POISON.ownerUserId,
    client_mutation_id: POISON.clientMutationId,
    quarantine_key: POISON.quarantineKey,
    email: POISON.email,
    ip_address: POISON.ipAddress,
    user_agent: POISON.userAgent,
    coordinates: POISON.preciseCoordinates,
    exif_gps: POISON.exifGps,
  } as T;
}

export function publicJournalSearchRow(
  overrides: Partial<JournalEntrySearchContractRow> = {},
): JournalEntrySearchContractRow {
  return seedPrivateColumns({
    id: JOURNEY.entryId,
    title: JOURNEY.safeTitle,
    body: JOURNEY.safeBody,
    public_slug: JOURNEY.publicSlug,
    public_noindex: true,
    public_gone_at: null,
    published_at: JOURNEY.publishedAt,
    entry_date: JOURNEY.entryDate,
    entry_scope: "object",
    created_at: JOURNEY.publishedAt,
    visibility: "public",
    lifecycle_state: "active",
    location_visibility: "region",
    coarse_region_code: JOURNEY.regionCode,
    owner_profile_public_safe: true,
    cover_source: "none",
    cover_public_url: null,
    ...overrides,
  });
}

export const ALLOWED_SEARCH_DOCUMENT_KEYS: readonly string[] = JSON.parse(
  readFileSync(
    path.resolve(
      process.cwd(),
      "../../contracts/search/public-journal-entry-search-document.json",
    ),
    "utf8",
  ),
).allowedFields;

export function catalogTypeaheadRow(
  overrides: Partial<CatalogTypeaheadRow> = {},
): CatalogTypeaheadRow {
  return seedPrivateColumns({
    id: JOURNEY.catalogItemId,
    canonicalName: JOURNEY.catalogCanonicalName,
    normalizedName: "помідор чері",
    catalogKind: "plant_variety",
    status: "seeded",
    source: "internal_seed",
    createdByUserId: null,
    itemLocale: "uk",
    displayName: "Помідор чері",
    aliasNormalizedName: "помідор чері",
    aliasLocale: "uk",
    isPrimary: true,
    ...overrides,
  });
}

export const ALLOWED_CATALOG_DOCUMENT_KEYS: readonly string[] = [
  "id",
  "catalogItemId",
  "displayName",
  "canonicalName",
  "normalizedName",
  "catalogKind",
  "locale",
  "itemLocale",
  "status",
  "source",
  "isPrimary",
  "rank",
  "kind",
  "serveClass",
];

// A Meilisearch hit that an attacker (or a misconfigured index) stuffed with
// private keys. The suggestion mapper must reject it wholesale.
export function poisonedTypeaheadHit(): Record<string, unknown> {
  return {
    catalogItemId: JOURNEY.catalogItemId,
    displayName: "Помідор чері",
    canonicalName: "Помідор чері",
    catalogKind: "plant_variety",
    locale: "uk",
    status: "seeded",
    source: "internal_seed",
    ownerUserId: POISON.ownerUserId,
    email: POISON.email,
    quarantineKey: POISON.quarantineKey,
  };
}

export function publicJournalEntryPage(): PublicJournalEntryPage {
  return {
    entry: {
      id: JOURNEY.entryId,
      title: JOURNEY.safeTitle,
      body: JOURNEY.safeBody,
      contentDocument: null,
      contentSchemaVersion: null,
      entryDate: JOURNEY.entryDate,
      createdAt: JOURNEY.publishedAt,
      entryScope: "object",
      publicSlug: JOURNEY.publicSlug,
      publicPath: `/journal/${JOURNEY.publicSlug}`,
      publicNoindex: true,
      publishedAt: JOURNEY.publishedAt,
    },
    context: {
      kind: "object",
      space: {
        displayName: JOURNEY.spaceDisplayName,
        locationVisibility: "region",
        coarseRegionCode: JOURNEY.regionCode,
      },
      object: {
        plantObjectId: JOURNEY.plantObjectId,
        displayName: JOURNEY.plantDisplayName,
        objectKind: "plant",
        catalogKind: "plant_variety",
        catalogCanonicalName: JOURNEY.catalogCanonicalName,
        catalogPublicSlug: JOURNEY.catalogPublicSlug,
        publicPath: `/lineage/objects/${JOURNEY.plantObjectId}`,
        varietyText: "Помідор чері",
        varietyState: "selected",
        locationVisibility: "region",
        coarseRegionCode: JOURNEY.regionCode,
      },
    },
    author: null,
    mentionedProfiles: [],
    topics: [],
    relatedEntries: [],
    adjacentEntries: { newer: null, older: null },
    media: [
      seedPrivateColumns({
        id: JOURNEY.mediaId,
        publicUrl: JOURNEY.derivativePublicUrl,
        altText: "Cherry tomato flowers",
        caption: null,
        focalX: 0.5,
        focalY: 0.5,
        intrinsicWidth: 1200,
        intrinsicHeight: 900,
      }),
    ],
  };
}

// Same journey, but the gardener kept location hidden and the object carries a
// raw precise string in the coarse slot. The region label must resolve to null
// (no supported code) and the precise string must never render.
export function hiddenLocationJournalEntryPage(): PublicJournalEntryPage {
  const page = publicJournalEntryPage();
  if (page.context.kind !== "object") return page;
  return {
    ...page,
    context: {
      ...page.context,
      space: {
        ...page.context.space,
        locationVisibility: "hidden",
        coarseRegionCode: POISON.preciseCoordinates,
      },
      object: {
        ...page.context.object,
        locationVisibility: "hidden",
        coarseRegionCode: POISON.streetAddress,
      },
    },
  };
}

export const MARKUP = {
  title: "Tomatoes <script>alert('xss')</script>",
  body: 'Trellis <img src=x onerror="alert(1)"> & "quoted" \'apostrophe\' note',
} as const;

export function markupJournalEntryPage(): PublicJournalEntryPage {
  const page = publicJournalEntryPage();
  return {
    ...page,
    entry: { ...page.entry, title: MARKUP.title, body: MARKUP.body },
  };
}

export function publicVarietyPage(
  overrides: { entryCount?: number; aggregateBodyLength?: number } = {},
): PublicVarietyPage {
  const entryCount = overrides.entryCount ?? 4;
  const aggregateBodyLength = overrides.aggregateBodyLength ?? 1200;

  return {
    catalog: {
      catalogKind: "plant_variety",
      canonicalName: JOURNEY.catalogCanonicalName,
      publicSlug: JOURNEY.catalogPublicSlug,
      status: "seeded",
      source: "ua_state_register",
      locale: "uk",
    },
    entryCount,
    photoCount: 2,
    aggregateBodyLength,
    indexState: evaluatePublicVarietyIndexState({
      entryCount,
      aggregateBodyLength,
      catalogStatus: "seeded",
      catalogSource: "ua_state_register",
    }),
    seedProof: null,
    sourceCredits: [],
    entries: [
      {
        id: JOURNEY.entryId,
        title: JOURNEY.safeTitle,
        // body / location / variety / media are private to the source entry and
        // must never appear in the bounded JSON-LD; poison proves exclusion.
        body: `${POISON.streetAddress} ${POISON.preciseCoordinates}`,
        entryDate: JOURNEY.entryDate,
        publicPath: `/journal/${JOURNEY.publicSlug}`,
        plantObjectDisplayName: JOURNEY.plantDisplayName,
        varietyText: POISON.email,
        safeLocationLabel: POISON.exifGps,
        media: {
          id: JOURNEY.mediaId,
          derivativeKey: POISON.quarantineKey,
          publicUrl: JOURNEY.derivativePublicUrl,
        },
      },
    ],
  };
}

// An env where every externally supplied secret/operator value is poison. The
// versioned policy also needs an admissible fixture key to reach its public
// health-class path; the readiness readout must never echo either class.
export function poisonOperatorEnv(): Record<string, string> {
  return {
    VERCEL: "1",
    VERCEL_ENV: "production",
    PUBLIC_SITE_URL: "https://over.garden",
    BETTER_AUTH_URL: "https://over.garden",
    BETTER_AUTH_SECRET: POISON.betterAuthSecret,
    BETTER_AUTH_SECRETS: `2:${Buffer.alloc(32, 7).toString("base64url")}`,
    BETTER_AUTH_CURRENT_SECRET_VERSION: "2",
    GOOGLE_CLIENT_ID: POISON.googleClientId,
    GOOGLE_CLIENT_SECRET: POISON.googleClientSecret,
    RESEND_API_KEY: POISON.resendApiKey,
    RESEND_AUTH_FROM: "OverGarden <auth@over.garden>",
    DATABASE_URL: POISON.databaseUrl,
    DIRECT_URL: POISON.databaseUrl,
    CATALOG_CURATOR_USER_IDS: POISON.curatorUserId,
    R2_ENDPOINT: "https://r2.example.com",
    R2_QUARANTINE_BUCKET: "over-garden-quarantine",
    R2_PUBLIC_BUCKET: "over-garden-public",
    R2_PUBLIC_BASE_URL: "https://media.over.garden",
    R2_ACCESS_KEY_ID: POISON.r2AccessKeyId,
    R2_SECRET_ACCESS_KEY: POISON.r2SecretAccessKey,
    MEILISEARCH_HOST: "https://search.over.garden",
    MEILISEARCH_API_KEY: POISON.meilisearchApiKey,
    MATCHING_SERVICE_URL: "https://match.over.garden",
    MATCHING_SERVICE_TOKEN: POISON.matchingServiceToken,
  };
}
