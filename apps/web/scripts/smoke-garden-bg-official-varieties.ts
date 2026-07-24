import { randomUUID } from "node:crypto";
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import {
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE,
} from "../src/lib/catalog/eu-official-journal-common-catalogue";
import {
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_ATTRIBUTION,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_CAVEAT,
} from "../src/lib/catalog/catalog-source-attribution";
import { FOUNDER_REHEARSAL_COHORT } from "../src/lib/garden/pilot-invite";
import { DEFAULT_PILOT_SEGMENT } from "../src/lib/pilot/segments";

loadEnv({ path: ".env.local", override: false });

const DEFAULT_BASE_URL = "http://localhost:3000";
const TEST_PASSWORD = `ove-85-${randomUUID()}-${Date.now()}`;
const LEGACY_BG_PRODUCT_SOURCE = "eu_common_catalogue_bg";
const SADOVO_QUERY = "Садово 1";
const IASAS_BLOCKED_QUERIES = ["Куртовска капия", "Kurtovska kapia"] as const;
const FORBIDDEN_EVIDENCE_MARKERS = [
  "rawPayload",
  "raw_payload",
  "sourceOnlyFields",
  "source_only_fields",
  "sourceRecordId",
  "source_record_id",
  "sourceRecordKey",
  "source_record_key",
  "allowedProjection",
  "allowed_projection",
  "ownerUserId",
  "owner_user_id",
  "journalBody",
  "journalTitle",
  "quarantineKey",
  "derivativeKey",
  "coordinates",
  "latitude",
  "longitude",
  "gps",
  "exif",
  "email",
  "cookie",
  "token",
  "secret",
] as const;

type CatalogKind = "plant_variety" | "species" | "breed";

interface CatalogSuggestion {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  locale: string;
  status: "seeded" | "confirmed";
  source: string;
}

interface TypeaheadResponse {
  suggestions?: CatalogSuggestion[];
}

interface EntryResponse {
  plantObject: {
    objectKind: "plant" | "animal";
    catalogItemId: string | null;
    varietyText: string | null;
    varietyState: string;
  };
  readbackUrl: string;
}

interface BgOjSmokeTarget {
  catalogItemId: string;
  canonicalName: string;
  displayName: string;
  source: string;
  isBulgariaRelevant: boolean;
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  addFromResponse(response: Response) {
    for (const cookie of getSetCookieHeaders(response.headers)) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const db = createDb();

  try {
    const bgTarget = await findBgOjSmokeTarget(db);
    const projectedBgRows = await countProjectedBgOjRows(db);
    const blockedOjProjectionLeaks = await countBlockedOjProjectionLeaks(db);
    if (blockedOjProjectionLeaks > 0) {
      throw new Error("Blocked OJ parser rows reached product catalog items.");
    }

    const jar = new CookieJar();
    const email = `ove85-smoke-${Date.now()}-${randomUUID()}@example.test`;
    await authRequest(baseUrl, jar, "/api/auth/sign-up/email", {
      email,
      password: TEST_PASSWORD,
      name: PRIVATE_AUTH_COMPATIBILITY_NAME,
    });
    await authRequest(baseUrl, jar, "/api/auth/sign-in/email", {
      email,
      password: TEST_PASSWORD,
    });
    await grantSmokeWriteAccess(db, email);

    const gardenHtml = await textRequest(baseUrl, jar, "/garden");
    assertIncludes(
      gardenHtml,
      "Catalog match",
      "Garden page missing catalog typeahead UI.",
    );

    const bgSuggestions = await fetchSuggestions(
      baseUrl,
      jar,
      bgTarget.canonicalName,
    );
    assertNoDuplicateConcepts(bgTarget.canonicalName, bgSuggestions);
    const selectedBg = bgSuggestions.find(
      (suggestion) =>
        suggestion.id === bgTarget.catalogItemId &&
        suggestion.source ===
          EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE &&
        suggestion.catalogKind === "plant_variety",
    );
    if (!selectedBg) {
      throw new Error(
        `BG OJ target ${bgTarget.canonicalName} is missing from /garden typeahead.`,
      );
    }

    const entry = await jsonRequest<EntryResponse>(
      baseUrl,
      jar,
      "/api/garden/entries",
      {
        method: "POST",
        body: {
          target: "first_plant_entry",
          spaceName: "OVE-85 BG official varieties smoke",
          plantName: `OVE-85 BG OJ ${selectedBg.canonicalName}`,
          objectKind: "plant",
          catalogItemId: selectedBg.id,
          userAddedCatalogName: null,
          varietyText: selectedBg.displayName,
          title: "OVE-85 BG official variety selected",
          body: "Local smoke entry for BG source-backed catalog readback.",
          entryDate: "2026-07-02",
          locationVisibility: "hidden",
          coarseRegionCode: null,
          clientMutationId: randomUUID(),
          syncStatus: "online",
          activationSource: "direct_garden",
        },
      },
    );

    assertEqual(
      entry.plantObject.catalogItemId,
      selectedBg.id,
      "Readback response did not preserve the selected BG OJ catalog id.",
    );
    assertEqual(
      entry.plantObject.objectKind,
      "plant",
      "Readback response did not preserve plant object kind.",
    );
    assertEqual(
      entry.plantObject.varietyText,
      selectedBg.canonicalName,
      "Readback response did not preserve the selected BG OJ canonical name.",
    );
    assertEqual(
      entry.plantObject.varietyState,
      "selected",
      "Readback response did not preserve selected variety state.",
    );

    const readbackText = visiblePageText(
      await textRequest(baseUrl, jar, entry.readbackUrl),
    );
    assertIncludes(
      readbackText,
      selectedBg.canonicalName,
      "Object readback page missing the selected BG OJ canonical name.",
    );
    assertIncludes(
      readbackText,
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_ATTRIBUTION,
      "Object readback page missing approved EU OJ / EUR-Lex attribution.",
    );
    assertIncludes(
      readbackText,
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_CAVEAT,
      "Object readback page missing EU OJ legal-value caveat.",
    );

    const sadovoSuggestions = await fetchSuggestions(
      baseUrl,
      jar,
      SADOVO_QUERY,
    );
    assertNoDuplicateConcepts(SADOVO_QUERY, sadovoSuggestions);
    const sadovo = sadovoSuggestions.find(
      (suggestion) =>
        suggestion.source === LEGACY_BG_PRODUCT_SOURCE &&
        suggestion.canonicalName === SADOVO_QUERY &&
        suggestion.catalogKind === "plant_variety",
    );
    if (!sadovo) {
      throw new Error("OVE-61 Sadovo 1 proof row is missing from typeahead.");
    }

    const blockedIasasEvidence = [];
    for (const query of IASAS_BLOCKED_QUERIES) {
      const suggestions = await fetchSuggestions(baseUrl, jar, query);
      assertNoDuplicateConcepts(query, suggestions);
      const normalizedQuery = normalizeSmokeName(query);
      const forbidden = suggestions.find(
        (suggestion) =>
          suggestion.source === LEGACY_BG_PRODUCT_SOURCE &&
          (normalizeSmokeName(suggestion.canonicalName) === normalizedQuery ||
            normalizeSmokeName(suggestion.displayName) === normalizedQuery),
      );
      if (forbidden) {
        throw new Error(
          `IASAS-only blocked row ${query} reached typeahead through ${forbidden.source}.`,
        );
      }
      blockedIasasEvidence.push({
        query,
        iasasOnlyProjectionAbsent: true,
      });
    }

    const output = {
      issue: "OVE-85",
      baseUrl,
      dryRunTarget: "bg-official-varieties",
      importCommand: "pnpm catalog:sources:import-eu-oj-common-catalogue",
      sourcePath: "official_journal_eur_lex",
      bgOfficialJournalRowsProjected: projectedBgRows,
      selectedBgOfficialVariety: {
        query: bgTarget.canonicalName,
        displayName: selectedBg.displayName,
        canonicalName: selectedBg.canonicalName,
        catalogKind: selectedBg.catalogKind,
        source: selectedBg.source,
        bulgariaRelevantRow: bgTarget.isBulgariaRelevant,
        beyondSadovoProof:
          normalizeSmokeName(selectedBg.canonicalName) !==
          normalizeSmokeName(SADOVO_QUERY),
        duplicateSameConceptSuggestionsAbsent: true,
        readbackStatus: 200,
        sourceAttributionShown: true,
        legalValueCaveatShown: true,
      },
      sadovoStabilityProof: {
        query: SADOVO_QUERY,
        canonicalName: sadovo.canonicalName,
        catalogKind: sadovo.catalogKind,
        source: sadovo.source,
        stillSelectableAfterBgFullImport: true,
        duplicateSameConceptSuggestionsAbsent: true,
      },
      blockedRowsProof: {
        reviewNeededAndRejectedOjRowsHaveNoProductLinks: true,
        blockedOjProjectionLeaks,
        iasasOnlyRowsAbsentFromTypeahead: blockedIasasEvidence,
      },
      productionRolloutClaim: false,
      nextGate: "OVE-89 entity-resolution QA remains required before OVE-90.",
      leakCheck: "passed",
    };
    assertNoForbiddenEvidence(output);
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await db.destroy();
  }
}

function parseOptions(argv: string[]) {
  let baseUrl =
    process.env.OVE85_SMOKE_BASE_URL ??
    process.env.PUBLIC_SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    DEFAULT_BASE_URL;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      baseUrl = argv[index + 1] ?? baseUrl;
      index += 1;
    }
  }

  return { baseUrl };
}

function createDb() {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);

  if (!connectionString) {
    throw new Error("Missing supported database connection env");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });

  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

async function findBgOjSmokeTarget(
  db: Kysely<Database>,
): Promise<BgOjSmokeTarget> {
  const target = await buildBgOjSmokeTargetQuery(db).executeTakeFirst();
  if (!target) {
    throw new Error(
      "No Bulgaria-relevant EU OJ Common Catalogue product rows found. Run pnpm catalog:sources:import-eu-oj-common-catalogue after the OVE-85 dry-run.",
    );
  }
  if (
    normalizeSmokeName(target.canonicalName) ===
    normalizeSmokeName(SADOVO_QUERY)
  ) {
    throw new Error("OVE-85 BG OJ target did not go beyond Sadovo 1.");
  }

  return {
    catalogItemId: target.catalogItemId,
    canonicalName: target.canonicalName,
    displayName: target.displayName,
    source: target.source,
    isBulgariaRelevant: Boolean(target.isBulgariaRelevant),
  };
}

function buildBgOjSmokeTargetQuery(db: Kysely<Database>) {
  const isBulgariaRelevant = sql<boolean>`(${sql.ref(
    "catalog_source_records.source_only_fields",
  )} #>> '{parser,countryCode}') = 'BG'`;

  return db
    .selectFrom("catalog_items")
    .innerJoin(
      "catalog_item_names",
      "catalog_item_names.catalog_item_id",
      "catalog_items.id",
    )
    .innerJoin(
      "catalog_source_links",
      "catalog_source_links.catalog_item_id",
      "catalog_items.id",
    )
    .innerJoin(
      "catalog_source_records",
      "catalog_source_records.id",
      "catalog_source_links.source_record_id",
    )
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_items.id as catalogItemId",
      "catalog_items.canonical_name as canonicalName",
      "catalog_item_names.display_name as displayName",
      "catalog_items.source as source",
      isBulgariaRelevant.as("isBulgariaRelevant"),
    ])
    .where(
      "catalog_items.source",
      "=",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    )
    .where("catalog_items.status", "=", "seeded")
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.catalog_kind", "=", "plant_variety")
    .where("catalog_item_names.is_primary", "=", true)
    .where(
      "catalog_source_links.source_slug",
      "=",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    )
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .where("catalog_source_records.projection_status", "=", "projected")
    .where(isBulgariaRelevant)
    .orderBy("catalog_items.canonical_name", "asc")
    .limit(1);
}

async function countProjectedBgOjRows(db: Kysely<Database>) {
  const isBulgariaRelevant = sql<boolean>`(${sql.ref(
    "catalog_source_records.source_only_fields",
  )} #>> '{parser,countryCode}') = 'BG'`;
  const row = await db
    .selectFrom("catalog_source_records")
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select(sql<number>`count(*)`.as("projectedRows"))
    .where(
      "catalog_source_snapshots.source_slug",
      "=",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    )
    .where("catalog_source_records.projection_status", "=", "projected")
    .where(isBulgariaRelevant)
    .executeTakeFirst();

  return toNumber(row?.projectedRows);
}

async function countBlockedOjProjectionLeaks(db: Kysely<Database>) {
  const row = await db
    .selectFrom("catalog_source_records")
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .leftJoin("catalog_items as leaked_items", (join) =>
      join
        .onRef(
          "leaked_items.source_id",
          "=",
          "catalog_source_records.source_record_id",
        )
        .on(
          "leaked_items.source",
          "=",
          EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
        ),
    )
    .select(sql<number>`count(${sql.ref("leaked_items.id")})`.as("leaks"))
    .where(
      "catalog_source_snapshots.source_slug",
      "=",
      EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    )
    .where("catalog_source_records.projection_status", "!=", "projected")
    .executeTakeFirst();

  return toNumber(row?.leaks);
}

async function grantSmokeWriteAccess(db: Kysely<Database>, email: string) {
  const user = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (!user) {
    throw new Error(
      "Smoke auth user was not persisted before write access setup.",
    );
  }

  await db
    .insertInto("pilot_invite_grants")
    .values({
      user_id: user.id,
      cohort: FOUNDER_REHEARSAL_COHORT,
      segment: DEFAULT_PILOT_SEGMENT,
    })
    .onConflict((oc) => oc.column("user_id").doNothing())
    .execute();
}

async function fetchSuggestions(
  baseUrl: string,
  jar: CookieJar,
  query: string,
) {
  const typeahead = await jsonRequest<TypeaheadResponse>(
    baseUrl,
    jar,
    `/api/garden/catalog/typeahead?q=${encodeURIComponent(query)}`,
  );
  return Array.isArray(typeahead.suggestions) ? typeahead.suggestions : [];
}

async function authRequest(
  baseUrl: string,
  jar: CookieJar,
  path: string,
  body: Record<string, string>,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: jar.header(),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  jar.addFromResponse(response);

  if (!response.ok) {
    throw new Error(
      `Auth request failed at ${path}: ${response.status} ${await response.text()}`,
    );
  }
}

async function jsonRequest<T>(
  baseUrl: string,
  jar: CookieJar,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init.method && init.method !== "GET" ? { Origin: baseUrl } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Cookie: jar.header(),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  jar.addFromResponse(response);

  if (!response.ok) {
    throw new Error(
      `Request failed at ${path}: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

async function textRequest(baseUrl: string, jar: CookieJar, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "text/html",
      Cookie: jar.header(),
    },
    redirect: "manual",
  });
  jar.addFromResponse(response);

  if (!response.ok) {
    throw new Error(
      `Page request failed at ${path}: ${response.status} ${await response.text()}`,
    );
  }

  return response.text();
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeSmokeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function assertNoDuplicateConcepts(
  query: string,
  suggestions: CatalogSuggestion[],
) {
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    const key = `${suggestion.catalogKind}:${normalizeSmokeName(
      suggestion.canonicalName,
    )}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate same-concept suggestion reached typeahead for ${query}: ${suggestion.canonicalName} (${suggestion.catalogKind}).`,
      );
    }
    seen.add(key);
  }
}

function assertIncludes(value: string, expected: string, message: string) {
  if (!value.includes(expected)) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}; received ${actual}.`);
  }
}

function visiblePageText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertNoForbiddenEvidence(output: unknown) {
  const serialized = JSON.stringify(output);
  for (const marker of FORBIDDEN_EVIDENCE_MARKERS) {
    if (serialized.toLowerCase().includes(marker.toLowerCase())) {
      throw new Error(`Smoke evidence contains forbidden marker: ${marker}.`);
    }
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  const fromGetter = withGetter.getSetCookie?.();
  if (fromGetter && fromGetter.length > 0) return fromGetter;

  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,]+=)/) : [];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
