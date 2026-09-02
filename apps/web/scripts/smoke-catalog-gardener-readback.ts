import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";
import type { Kysely } from "kysely";

import type { Database } from "../src/db/schema";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import {
  ATOMIC_JOURNAL_CREATE_PROTOCOL,
  ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER,
  type AtomicJournalCreateResponse,
} from "../src/lib/garden/entry-contracts";
import {
  isOve330ServeClass,
  type Ove330ServeClass,
} from "../src/lib/media/presentation-contract";
import { buildAtomicTextJournalCreateRequest } from "./atomic-journal-text-request";
import type {
  searchCatalogSuggestions as searchCatalogFn,
  searchCatalogSuggestionsForTypeahead as searchTypeaheadFn,
} from "../src/server/catalog-repository";
import type { resolvePlantObjectCatalog as resolveCatalogFn } from "../src/server/journal-repository";

type DB = Kysely<Database>;

const DEFAULT_BASE_URL = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 10_000;
const FIXTURE_ITEM_ID = "16100000-0000-4000-8000-000000000001";
const PRIMARY_NAME_ID = "16100000-0000-4000-8000-000000000101";
const GENERATED_NAME_ID = "16100000-0000-4000-8000-000000000102";
const SYNONYM_NAME_ID = "16100000-0000-4000-8000-000000000103";
const LOCALE_NAME_ID = "16100000-0000-4000-8000-000000000104";
const GENERATED_PROJECTION_ID = "16100000-0000-4000-8000-000000000201";
const SYNONYM_PROJECTION_ID = "16100000-0000-4000-8000-000000000202";
const LOCALE_PROJECTION_ID = "16100000-0000-4000-8000-000000000203";
const CANONICAL_NAME = "OVE161 Золотий томат";
const UI_EMAIL = "ove161-ui@example.test";
const EPHEMERAL_TEST_PASSWORD = `ove-161-${randomUUID()}-${Date.now()}`;
const UI_PASSWORD_ENV = "OVE161_SMOKE_UI_PASSWORD";
const EMAIL_PREFIX = "ove161-";
const ALLOWED_SUGGESTION_KEYS = new Set([
  "id",
  "displayName",
  "canonicalName",
  "catalogKind",
  "locale",
  "status",
  "source",
  "trustState",
  "trustLabel",
  "sourceLabel",
  "sourceCaveat",
  "disambiguationLabel",
  "serveClass",
]);

const SEARCH_CASES = [
  { kind: "typo", query: "OVE161 Золотй томат" },
  { kind: "transliteration", query: "OVE161 Zolotyi tomat" },
  { kind: "synonym", query: "OVE161 Sun Tomato" },
  { kind: "cross_locale", query: "OVE161 Златен домат" },
] as const;

interface CatalogSuggestion {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: "plant_variety" | "species" | "breed";
  locale: string;
  status: "seeded" | "confirmed";
  source: string;
  serveClass: Ove330ServeClass;
}

interface TypeaheadResponse {
  suggestions?: unknown[];
}

interface CreatedEntry {
  plantObject: {
    id: string;
    catalogItemId: string | null;
    varietyText: string | null;
    varietyState: string;
  };
  readbackUrl: string;
}

interface SmokeContext {
  db: DB;
  resolvePlantObjectCatalog: typeof resolveCatalogFn;
  searchCatalogSuggestions: typeof searchCatalogFn;
  searchCatalogSuggestionsForTypeahead: typeof searchTypeaheadFn;
  baseUrl: string;
  email: string;
  userId: string;
  jar: CookieJar;
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

let db: DB | null = null;
let shouldRunFinalCleanup = true;

async function main() {
  loadEnv({ path: ".env.local", override: false });
  const mode = process.argv[2] ?? "--prove";
  const baseUrl = requireLoopbackHttpUrl(
    process.env.OVE161_SMOKE_BASE_URL ?? DEFAULT_BASE_URL,
    "app",
  );
  requireLoopbackPostgresUrl(
    process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  );
  requireLoopbackHttpUrl(process.env.MEILISEARCH_HOST ?? "", "Meilisearch");

  ({ db } = await import("../src/db"));
  const { resolvePlantObjectCatalog } =
    await import("../src/server/journal-repository");
  const { searchCatalogSuggestions, searchCatalogSuggestionsForTypeahead } =
    await import("../src/server/catalog-repository");

  if (mode === "--reset-ui") {
    await cleanupFixtureState(db);
    runCatalogTypeaheadReindex();
    shouldRunFinalCleanup = false;
    printEvidence({ uiFixturesReset: true });
    return;
  }
  if (mode !== "--prove" && mode !== "--seed-ui") {
    throw new Error(`Unsupported OVE-161 smoke mode: ${mode}`);
  }

  const email =
    mode === "--seed-ui"
      ? UI_EMAIL
      : `${EMAIL_PREFIX}smoke-${Date.now()}-${randomUUID()}@example.test`;
  const password =
    mode === "--seed-ui"
      ? requireUiPassword(process.env[UI_PASSWORD_ENV])
      : EPHEMERAL_TEST_PASSWORD;
  await cleanupFixtureState(db);
  const jar = new CookieJar();
  await authRequest(baseUrl, jar, "/api/auth/sign-up/email", {
    email,
    password,
    name: PRIVATE_AUTH_COMPATIBILITY_NAME,
  });
  await authRequest(baseUrl, jar, "/api/auth/sign-in/email", {
    email,
    password,
  });

  const user = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirstOrThrow();
  await seedApprovedAliasFixtures(db, user.id);
  runCatalogTypeaheadReindex();
  const context: SmokeContext = {
    db,
    resolvePlantObjectCatalog,
    searchCatalogSuggestions,
    searchCatalogSuggestionsForTypeahead,
    baseUrl,
    email,
    userId: user.id,
    jar,
  };
  const proof = await proveGardenerFlow(context);

  if (mode === "--seed-ui") {
    const unresolved = await createEntry(context, {
      label: "ui_existing_object",
      catalogItemId: null,
      userAddedCatalogName: "OVE161 UI unresolved tomato",
    });
    shouldRunFinalCleanup = false;
    printEvidence({
      ...proof,
      uiFixturesSeeded: true,
      gardenPath: "/garden",
      existingObjectPath: `/garden/objects/${unresolved.plantObject.id}`,
    });
    return;
  }

  printEvidence(proof);
}

async function proveGardenerFlow(context: SmokeContext) {
  const gardenHtml = await textRequest(context.baseUrl, context.jar, "/garden");
  const gardenSurface = classifyGardenSurface(gardenHtml);
  assert(
    gardenSurface === "operational_home",
    `Garden readback reached ${gardenSurface} instead of the authenticated operational surface.`,
  );

  const searchEvidence: Array<{ kind: string; suggestionCount: number }> = [];
  for (const searchCase of SEARCH_CASES) {
    const suggestions = await queryTypeahead(context, searchCase.query);
    const selected = suggestions.find(
      (suggestion) => suggestion.id === FIXTURE_ITEM_ID,
    );
    assert(
      selected,
      `${searchCase.kind} did not resolve to the canonical fixture identity.`,
    );
    assertEqual(selected.canonicalName, CANONICAL_NAME, "canonical suggestion");

    const entry = await createEntry(context, {
      label: searchCase.kind,
      catalogItemId: selected.id,
      userAddedCatalogName: null,
    });
    assertCanonicalEntry(entry, searchCase.kind);
    await proveRenderedCanonicalIdentity(
      context.baseUrl,
      context.jar,
      entry.readbackUrl,
      CANONICAL_NAME,
      searchCase.kind,
    );
    searchEvidence.push({
      kind: searchCase.kind,
      suggestionCount: suggestions.length,
    });
  }
  const postgresFallbackAliases = await provePostgresFallback(context);

  const unknown = await createEntry(context, {
    label: "unknown_fallback",
    catalogItemId: null,
    userAddedCatalogName: null,
  });
  assertEqual(unknown.plantObject.varietyState, "unknown", "Unknown fallback");
  assertEqual(unknown.plantObject.catalogItemId, null, "Unknown catalog id");

  const userAdded = await createEntry(context, {
    label: "add_missing_fallback",
    catalogItemId: null,
    userAddedCatalogName: "OVE161 gardener missing tomato",
  });
  assertEqual(
    userAdded.plantObject.varietyState,
    "user_added",
    "Add missing fallback",
  );
  assert(
    userAdded.plantObject.catalogItemId !== FIXTURE_ITEM_ID,
    "Add missing fallback reused the approved identity without selection.",
  );

  const resolved = await context.resolvePlantObjectCatalog(
    { userId: context.userId, sessionId: "ove-161-existing-object-proof" },
    {
      plantObjectId: userAdded.plantObject.id,
      catalogItemId: FIXTURE_ITEM_ID,
    },
  );
  assertEqual(
    resolved.plantObject.catalog_item_id,
    FIXTURE_ITEM_ID,
    "Existing object canonical id",
  );
  assertEqual(
    resolved.plantObject.catalog_canonical_name,
    CANONICAL_NAME,
    "Existing object canonical name",
  );
  assertEqual(resolved.entryCount, 1, "Existing object journal history");

  const approvedNormalizedNames = SEARCH_CASES.slice(1).map(({ query }) =>
    normalizeName(query),
  );
  const duplicate = await context.db
    .selectFrom("catalog_items")
    .select("id")
    .where("created_by_user_id", "=", context.userId)
    .where("normalized_name", "in", approvedNormalizedNames)
    .executeTakeFirst();
  assert(
    !duplicate,
    "Approved aliases created a duplicate provisional identity.",
  );

  const attached = await context.db
    .selectFrom("plant_objects")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("owner_user_id", "=", context.userId)
    .where("catalog_item_id", "=", FIXTURE_ITEM_ID)
    .executeTakeFirstOrThrow();
  assertEqual(Number(attached.count), 5, "Canonical object attachment count");

  return {
    gardenSurface,
    searchCases: searchEvidence,
    postgresFallbackAliases,
    firstEntryCanonicalReadback: true,
    existingObjectCanonicalReadback: true,
    unknownFallback: true,
    addMissingFallback: true,
    duplicateProvisionalAliasAbsent: true,
    unsafeMeiliMetadataAbsent: true,
    journalHistoryPreserved: true,
    leakCheck: "passed",
  };
}

export function classifyGardenSurface(
  html: string,
): "operational_home" | "guest" | "error" | "loading" | "unknown" {
  for (const [marker, classification] of [
    ["operational-home", "operational_home"],
    ["guest", "guest"],
    ["unexpected-error", "error"],
    ["error", "error"],
    ["loading", "loading"],
  ] as const) {
    if (
      html.includes(`data-garden-workspace="${marker}"`) ||
      html.includes(`data-garden-workspace\\":\\"${marker}`)
    ) {
      return classification;
    }
  }
  return "unknown";
}

async function provePostgresFallback(context: SmokeContext) {
  const provenKinds: string[] = [];

  for (const searchCase of SEARCH_CASES.slice(1)) {
    const suggestions = await context.searchCatalogSuggestionsForTypeahead(
      searchCase.query,
      8,
      {
        searchWithMeili: async () => {
          throw new Error("simulated derived-index outage");
        },
        searchWithPostgres: (query, limit) =>
          context.searchCatalogSuggestions(query, limit, context.db),
      },
    );
    assert(
      suggestions.some((suggestion) => suggestion.id === FIXTURE_ITEM_ID),
      `${searchCase.kind} was unavailable through the Postgres fallback.`,
    );
    provenKinds.push(searchCase.kind);
  }

  return provenKinds;
}

async function queryTypeahead(context: SmokeContext, query: string) {
  const response = await jsonRequest<TypeaheadResponse>(
    context.baseUrl,
    context.jar,
    `/api/garden/catalog/typeahead?q=${encodeURIComponent(query)}`,
  );
  return parseGardenerTypeaheadSuggestions(response);
}

export function parseGardenerTypeaheadSuggestions(
  response: TypeaheadResponse,
): CatalogSuggestion[] {
  const rawSuggestions = Array.isArray(response.suggestions)
    ? response.suggestions
    : [];

  for (const suggestion of rawSuggestions) {
    assertRecord(suggestion, "Typeahead suggestion must be an object.");
    for (const key of Object.keys(suggestion)) {
      assert(
        ALLOWED_SUGGESTION_KEYS.has(key),
        `Typeahead leaked a non-contract field: ${key}.`,
      );
    }
    assert(
      isOve330ServeClass(suggestion.serveClass),
      "Typeahead served class is missing or invalid.",
    );
  }

  return rawSuggestions as CatalogSuggestion[];
}

async function createEntry(
  context: SmokeContext,
  input: {
    label: string;
    catalogItemId: string | null;
    userAddedCatalogName: string | null;
  },
) {
  const created = await jsonRequest<AtomicJournalCreateResponse>(
    context.baseUrl,
    context.jar,
    "/api/garden/entries",
    {
      method: "POST",
      body: buildAtomicTextJournalCreateRequest({
        publishId: randomUUID(),
        context: {
          target: "first_plant_entry",
          spaceName: `OVE161 ${input.label} space`,
          plantName: `OVE161 ${input.label} object`,
          objectKind: "plant",
          catalogItemId: input.catalogItemId,
          userAddedCatalogName: input.userAddedCatalogName,
          entryDate: "2026-07-15",
          locationVisibility: "hidden",
          coarseRegionCode: null,
          activationSource: "direct_garden",
        },
        title: `OVE161 ${input.label} entry`,
        text: "Synthetic atomic catalog readback proof without personal garden data.",
      }),
    },
  );
  const row = await context.db
    .selectFrom("journal_entries as je")
    .innerJoin("plant_objects as po", "po.id", "je.plant_object_id")
    .select([
      "po.id as objectId",
      "po.catalog_item_id as catalogItemId",
      "po.variety_text as varietyText",
      "po.variety_state as varietyState",
    ])
    .where("je.id", "=", created.entryId)
    .executeTakeFirstOrThrow();
  return {
    plantObject: {
      id: row.objectId,
      catalogItemId: row.catalogItemId,
      varietyText: row.varietyText,
      varietyState: row.varietyState,
    },
    readbackUrl: `/garden/objects/${row.objectId}`,
  };
}

function assertCanonicalEntry(entry: CreatedEntry, label: string) {
  assertEqual(
    entry.plantObject.catalogItemId,
    FIXTURE_ITEM_ID,
    `${label} catalog id`,
  );
  assertEqual(
    entry.plantObject.varietyText,
    CANONICAL_NAME,
    `${label} identity`,
  );
  assertEqual(entry.plantObject.varietyState, "selected", `${label} state`);
}

async function seedApprovedAliasFixtures(database: DB, reviewerUserId: string) {
  const now = new Date("2026-07-15T12:00:00.000Z");
  await database
    .insertInto("catalog_items")
    .values({
      id: FIXTURE_ITEM_ID,
      canonical_name: CANONICAL_NAME,
      normalized_name: normalizeName(CANONICAL_NAME),
      public_slug: "ove161-golden-tomato",
      catalog_kind: "plant_variety",
      status: "confirmed",
      source: "internal_seed",
      source_id: "ove161-gardener-proof",
      created_by_user_id: null,
      locale: "uk",
      reviewed_at: now,
      reviewed_by_user_id: reviewerUserId,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await database
    .insertInto("catalog_item_names")
    .values([
      catalogName(PRIMARY_NAME_ID, CANONICAL_NAME, "uk", true, now),
      catalogName(GENERATED_NAME_ID, "OVE161 Zolotyi tomat", "uk", false, now),
      catalogName(SYNONYM_NAME_ID, "OVE161 Sun Tomato", "en", false, now),
      catalogName(LOCALE_NAME_ID, "OVE161 Златен домат", "bg", false, now),
    ])
    .execute();

  await database
    .insertInto("catalog_alias_projections")
    .values([
      {
        id: GENERATED_PROJECTION_ID,
        catalog_item_id: FIXTURE_ITEM_ID,
        catalog_item_name_id: GENERATED_NAME_ID,
        generated_from_catalog_item_name_id: PRIMARY_NAME_ID,
        display_name: "OVE161 Zolotyi tomat",
        normalized_name: normalizeName("OVE161 Zolotyi tomat"),
        locale: "uk",
        script: "latin",
        alias_kind: "generated_variant",
        status: "accepted",
        source_slug: "overgarden-alias-generator",
        source_method: "generated",
        confidence: "0.9600",
        license: "OverGarden deterministic generated alias",
        attribution_required: false,
        reason_codes: ["cyrtranslit_forward"],
        source_name_fingerprint: createHash("sha256")
          .update("ove161-generated-fixture")
          .digest("hex"),
        generator_version: "ove160-v1",
        generated_at: now,
        reviewed_at: now,
        reviewed_by_user_id: reviewerUserId,
        decision_reason_code: "approved_generated_alias",
        decision_result: "alias_projected",
        created_at: now,
        updated_at: now,
      },
      curatorAliasProjection({
        id: SYNONYM_PROJECTION_ID,
        catalogItemNameId: SYNONYM_NAME_ID,
        displayName: "OVE161 Sun Tomato",
        locale: "en",
        aliasKind: "synonym",
        now,
      }),
      curatorAliasProjection({
        id: LOCALE_PROJECTION_ID,
        catalogItemNameId: LOCALE_NAME_ID,
        displayName: "OVE161 Златен домат",
        locale: "bg",
        aliasKind: "vernacular_alias",
        now,
      }),
    ])
    .execute();
}

function catalogName(
  id: string,
  displayName: string,
  locale: string,
  isPrimary: boolean,
  createdAt: Date,
) {
  return {
    id,
    catalog_item_id: FIXTURE_ITEM_ID,
    display_name: displayName,
    normalized_name: normalizeName(displayName),
    locale,
    is_primary: isPrimary,
    created_at: createdAt,
  };
}

function curatorAliasProjection(input: {
  id: string;
  catalogItemNameId: string;
  displayName: string;
  locale: string;
  aliasKind: "synonym" | "vernacular_alias";
  now: Date;
}) {
  return {
    id: input.id,
    catalog_item_id: FIXTURE_ITEM_ID,
    catalog_item_name_id: input.catalogItemNameId,
    generated_from_catalog_item_name_id: null,
    display_name: input.displayName,
    normalized_name: normalizeName(input.displayName),
    locale: input.locale,
    script: input.locale === "bg" ? "cyrillic" : "latin",
    alias_kind: input.aliasKind,
    status: "accepted" as const,
    source_slug: "ove161-gardener-proof",
    source_method: "curator" as const,
    confidence: "1.0000",
    license: "OverGarden synthetic smoke fixture",
    attribution_required: false,
    reason_codes: [],
    generated_at: input.now,
    created_at: input.now,
    updated_at: input.now,
  };
}

async function cleanupFixtureState(database: DB) {
  const users = await database
    .selectFrom("user")
    .select("id")
    .where("email", "like", `${EMAIL_PREFIX}%@example.test`)
    .execute();
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await database
      .deleteFrom("spaces")
      .where("owner_user_id", "in", userIds)
      .execute();
    await database
      .deleteFrom("catalog_items")
      .where("created_by_user_id", "in", userIds)
      .execute();
    await database.deleteFrom("user").where("id", "in", userIds).execute();
  }

  await database
    .deleteFrom("catalog_items")
    .where("id", "=", FIXTURE_ITEM_ID)
    .execute();
}

function runCatalogTypeaheadReindex() {
  const matchingDirectory = fileURLToPath(
    new URL("../../../services/matching/", import.meta.url),
  );
  const output = execFileSync(
    "uv",
    [
      "run",
      "--frozen",
      "python",
      "-m",
      "scripts.run_catalog_typeahead_reindex",
    ],
    {
      cwd: matchingDirectory,
      env: process.env,
      encoding: "utf8",
    },
  );
  const result = JSON.parse(output) as { ok?: boolean };
  assert(result.ok === true, "Catalog typeahead worker reindex failed.");
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
  init: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      [ATOMIC_JOURNAL_CREATE_PROTOCOL_HEADER]: ATOMIC_JOURNAL_CREATE_PROTOCOL,
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

export function requireRenderedDocumentMutationGeneration(
  generation: string,
): string {
  if (
    !generation ||
    generation.length > 1_024 ||
    !/^[A-Za-z0-9_-]+$/u.test(generation)
  ) {
    throw new Error(
      "The authenticated owner document omitted a bounded rendered mutation generation.",
    );
  }
  return generation;
}

async function proveRenderedCanonicalIdentity(
  baseUrl: string,
  jar: CookieJar,
  pathname: string,
  canonicalName: string,
  label: string,
): Promise<void> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(
      cookieHeaderToPlaywrightCookies(jar.header(), baseUrl),
    );
    const page = await context.newPage();
    const navigation = await page.goto(`${baseUrl}${pathname}`, {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });
    if (!navigation?.ok()) {
      throw new Error(`${label} rendered readback was unavailable.`);
    }
    try {
      await page.getByText(canonicalName, { exact: false }).first().waitFor({
        state: "visible",
        timeout: REQUEST_TIMEOUT_MS,
      });
    } catch {
      throw new Error(`${label} readback omitted the canonical identity.`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

function cookieHeaderToPlaywrightCookies(
  cookieHeader: string,
  baseUrl: string,
) {
  const cookies = cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return [];
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name && value ? [{ name, value, url: baseUrl }] : [];
  });
  if (cookies.length === 0) {
    throw new Error(
      "The authenticated owner document requires a bounded private session.",
    );
  }
  return cookies;
}

async function textRequest(baseUrl: string, jar: CookieJar, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "text/html", Cookie: jar.header() },
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

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  const values = withGetter.getSetCookie?.();
  if (values && values.length > 0) return values;
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,]+=)/) : [];
}

function requireUiPassword(value: string | undefined) {
  const password = value?.trim() ?? "";
  if (password.length < 16 || password.length > 200) {
    throw new Error(
      `${UI_PASSWORD_ENV} must be a private 16-200 character local value for --seed-ui.`,
    );
  }
  return password;
}

function requireLoopbackPostgresUrl(value: string | undefined) {
  if (!value) throw new Error("OVE-161 smoke requires a Postgres URL.");
  const url = new URL(value);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("OVE-161 smoke requires the Postgres protocol.");
  }
  requireLoopbackHostname(url, "Postgres");
  if (!url.pathname.replace(/^\//, "")) {
    throw new Error("OVE-161 smoke requires a named local database.");
  }
}

function requireLoopbackHttpUrl(value: string, label: string) {
  if (!value) throw new Error(`OVE-161 smoke requires a ${label} URL.`);
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`OVE-161 smoke requires an HTTP ${label} URL.`);
  }
  requireLoopbackHostname(url, label);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function requireLoopbackHostname(url: URL, label: string) {
  if (
    !new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]).has(
      url.hostname.toLowerCase(),
    )
  ) {
    throw new Error(`OVE-161 smoke refuses non-loopback ${label}.`);
  }
}

function assertRecord(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    message,
  );
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

function printEvidence(details: Record<string, unknown>) {
  const evidence = {
    ok: true,
    issue: "OVE-161",
    ...details,
    environment: "loopback_local",
    productionDataTouched: false,
  };
  const serialized = JSON.stringify(evidence);
  for (const marker of [
    "email",
    "password",
    "cookie",
    "ownerUserId",
    "journalBody",
    "coordinates",
    "latitude",
    "longitude",
    "_rankingScoreDetails",
  ]) {
    assert(
      !serialized.toLowerCase().includes(marker.toLowerCase()),
      `Smoke evidence contains forbidden marker: ${marker}.`,
    );
  }
  console.log(JSON.stringify(evidence, null, 2));
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  void main()
    .finally(async () => {
      if (db && shouldRunFinalCleanup) {
        await cleanupFixtureState(db);
        runCatalogTypeaheadReindex();
      }
      await db?.destroy();
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
