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

loadEnv({ path: ".env.local", override: false });

const DEFAULT_BASE_URL = "http://localhost:3000";
const TEST_PASSWORD = `ove-104-${randomUUID()}-${Date.now()}`;
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

interface EuOjSmokeTarget {
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
    const target = await findSmokeTarget(db);
    const jar = new CookieJar();
    const smokeName = `OVE-104 EU OJ ${target.canonicalName}`;
    const email = `ove104-smoke-${Date.now()}-${randomUUID()}@example.test`;

    await authRequest(baseUrl, jar, "/api/auth/sign-up/email", {
      email,
      password: TEST_PASSWORD,
      name: PRIVATE_AUTH_COMPATIBILITY_NAME,
    });
    await authRequest(baseUrl, jar, "/api/auth/sign-in/email", {
      email,
      password: TEST_PASSWORD,
    });

    const gardenHtml = await textRequest(baseUrl, jar, "/garden");
    assertIncludes(
      gardenHtml,
      "Catalog match",
      "Garden page missing catalog typeahead UI.",
    );

    const suggestions = await fetchSuggestions(
      baseUrl,
      jar,
      target.canonicalName,
    );
    const selected = suggestions.find(
      (suggestion) =>
        suggestion.id === target.catalogItemId &&
        suggestion.source ===
          EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    );
    if (!selected) {
      throw new Error(
        `EU OJ target ${target.canonicalName} is missing from /garden typeahead.`,
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
          spaceName: "OVE-104 EU OJ smoke",
          plantName: smokeName,
          objectKind: "plant",
          catalogItemId: selected.id,
          userAddedCatalogName: null,
          varietyText: selected.displayName,
          title: "OVE-104 EU OJ selected variety",
          body: "Local smoke entry for source-backed catalog readback.",
          entryDate: "2026-07-01",
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
      selected.id,
      "Readback response did not preserve the selected EU OJ catalog id.",
    );
    assertEqual(
      entry.plantObject.varietyText,
      selected.canonicalName,
      "Readback response did not preserve the selected EU OJ canonical name.",
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
      smokeName,
      "Object readback page missing the saved plant name.",
    );
    assertIncludes(
      readbackText,
      selected.canonicalName,
      "Object readback page missing the selected EU OJ canonical name.",
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

    const blockedIasasEvidence = [];
    for (const query of IASAS_BLOCKED_QUERIES) {
      const blockedSuggestions = await fetchSuggestions(baseUrl, jar, query);
      const normalizedBlockedQuery = normalizeSmokeName(query);
      const forbidden = blockedSuggestions.find(
        (suggestion) =>
          suggestion.source === "eu_common_catalogue_bg" &&
          (normalizeSmokeName(suggestion.canonicalName) ===
            normalizedBlockedQuery ||
            normalizeSmokeName(suggestion.displayName) ===
              normalizedBlockedQuery),
      );
      if (forbidden) {
        throw new Error(
          `IASAS-only blocked row ${query} reached product typeahead through ${forbidden.source}.`,
        );
      }
      blockedIasasEvidence.push({
        query,
        iasasOnlyProjectionAbsent: true,
        approvedOjSuggestionCount: blockedSuggestions.filter(
          (suggestion) =>
            suggestion.source ===
            EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
        ).length,
      });
    }

    const output = {
      issue: "OVE-104",
      baseUrl,
      sourcePath: "official_journal_eur_lex",
      bulgariaRelevantRowAvailable: target.isBulgariaRelevant,
      selected: {
        query: target.canonicalName,
        displayName: selected.displayName,
        canonicalName: selected.canonicalName,
        catalogKind: selected.catalogKind,
        source: selected.source,
        readbackStatus: 200,
        sourceAttributionShown: true,
        legalValueCaveatShown: true,
      },
      fallbackNote: target.isBulgariaRelevant
        ? null
        : "No Bulgaria-relevant accepted row was available from the current approved OJ artifact; smoke used a second accepted EU OJ row without claiming BG coverage.",
      blockedIasasEvidence,
      productionRolloutClaim: false,
      nextGate:
        "OVE-85-90 may resume only after OVE-104 is committed, pushed, and verified on main; OVE-90 remains production proof.",
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
    process.env.OVE104_SMOKE_BASE_URL ??
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

async function findSmokeTarget(db: Kysely<Database>): Promise<EuOjSmokeTarget> {
  const bulgariaTarget = await buildEuOjSmokeTargetQuery(
    db,
    true,
  ).executeTakeFirst();
  if (bulgariaTarget) return bulgariaTarget;

  const fallbackTarget = await buildEuOjSmokeTargetQuery(
    db,
    false,
  ).executeTakeFirst();
  if (fallbackTarget) return fallbackTarget;

  throw new Error(
    "No EU OJ Common Catalogue product rows found. Run pnpm catalog:sources:import-eu-oj-common-catalogue first.",
  );
}

function buildEuOjSmokeTargetQuery(
  db: Kysely<Database>,
  requireBulgariaRelevant: boolean,
) {
  const isBulgariaRelevant = sql<boolean>`(${sql.ref(
    "catalog_source_records.source_only_fields",
  )} #>> '{parser,countryCode}') = 'BG'`;

  let query = db
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
    .where("catalog_source_snapshots.attribution_required", "=", true)
    .orderBy("catalog_items.canonical_name", "asc")
    .limit(1);

  if (requireBulgariaRelevant) {
    query = query.where(isBulgariaRelevant);
  }

  return query;
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
