import { randomUUID } from "node:crypto";
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { defaultObjectKindForCatalogSelection } from "../src/lib/garden/catalog-object-kind";
import { FOUNDER_REHEARSAL_COHORT } from "../src/lib/garden/pilot-invite";
import { DEFAULT_PILOT_SEGMENT } from "../src/lib/pilot/segments";

loadEnv({ path: ".env.local", override: false });

const DEFAULT_BASE_URL = "http://localhost:3000";
const TEST_PASSWORD = `ove-67-${randomUUID()}-${Date.now()}`;
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
  "operator",
];

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

interface SmokeCase {
  query: string;
  expectedCanonicalName: string;
  expectedCatalogKind: CatalogKind;
  expectedObjectKind: "plant" | "animal";
  expectedIdentityLabel:
    | "Plant variety"
    | "Plant species"
    | "Bee breed"
    | "Animal breed";
  plantName: string;
}

interface BlockedAliasSmokeCase {
  query: string;
  forbiddenDisplayName: string;
  forbiddenCanonicalName?: string;
  forbiddenCatalogKind?: CatalogKind;
}

const SMOKE_CASES: SmokeCase[] = [
  {
    query: "Ботсадівський",
    expectedCanonicalName: "Ботсадівський",
    expectedCatalogKind: "plant_variety",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant variety",
    plantName: "OVE-67 Botsadivskyi apricot",
  },
  {
    query: "Kaiser",
    expectedCanonicalName: "Кайзер",
    expectedCatalogKind: "plant_variety",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant variety",
    plantName: "OVE-81 Kaiser tomato-rootstock variety",
  },
  {
    query: "7 ФОР 7",
    expectedCanonicalName: "7 ФОР 7",
    expectedCatalogKind: "plant_variety",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant variety",
    plantName: "OVE-81 potato variety",
  },
  {
    query: "ЕС ЯСМІНІС КЛП",
    expectedCanonicalName: "ЕС ЯСМІНІС КЛП",
    expectedCatalogKind: "plant_variety",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant variety",
    plantName: "OVE-81 sunflower variety",
  },
  {
    query: "помідор",
    expectedCanonicalName: "Solanum lycopersicum L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-67 tomato species",
  },
  {
    query: "помідори",
    expectedCanonicalName: "Solanum lycopersicum L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-83 tomato Ukrainian plural species",
  },
  {
    query: "домат",
    expectedCanonicalName: "Solanum lycopersicum L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-67 domat species",
  },
  {
    query: "домати",
    expectedCanonicalName: "Solanum lycopersicum L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-83 tomato Bulgarian plural species",
  },
  {
    query: "огірок",
    expectedCanonicalName: "Cucumis sativus L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-82 cucumber species",
  },
  {
    query: "огірок звичайний",
    expectedCanonicalName: "Cucumis sativus L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-83 cucumber Ukrainian formal species",
  },
  {
    query: "common sunflower",
    expectedCanonicalName: "Helianthus annuus L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-83 common sunflower species",
  },
  {
    query: "сонях",
    expectedCanonicalName: "Helianthus annuus L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-83 Ukrainian sunflower species",
  },
  {
    query: "слънчоглед",
    expectedCanonicalName: "Helianthus annuus L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-82 sunflower species",
  },
  {
    query: "Basil",
    expectedCanonicalName: "Ocimum basilicum L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-82 basil species",
  },
  {
    query: "sweet basil",
    expectedCanonicalName: "Ocimum basilicum L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-83 sweet basil species",
  },
  {
    query: "базилік духмяний",
    expectedCanonicalName: "Ocimum basilicum L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-83 Ukrainian basil species",
  },
  {
    query: "обикновен босилек",
    expectedCanonicalName: "Ocimum basilicum L.",
    expectedCatalogKind: "species",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant species",
    plantName: "OVE-83 Bulgarian basil species",
  },
  {
    query: "Карпатська",
    expectedCanonicalName: "Карпатська бджола",
    expectedCatalogKind: "breed",
    expectedObjectKind: "animal",
    expectedIdentityLabel: "Bee breed",
    plantName: "OVE-67 Carpathian colony",
  },
  {
    query: "Ukrainian Grey",
    expectedCanonicalName: "Ukrainian Grey (Cattle)",
    expectedCatalogKind: "breed",
    expectedObjectKind: "animal",
    expectedIdentityLabel: "Animal breed",
    plantName: "OVE-86 Ukrainian Grey cattle",
  },
  {
    query: "Садово 1",
    expectedCanonicalName: "Садово 1",
    expectedCatalogKind: "plant_variety",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant variety",
    plantName: "OVE-67 Sadovo wheat",
  },
  {
    query: "Red Cherry",
    expectedCanonicalName: "Red Cherry tomato",
    expectedCatalogKind: "plant_variety",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant variety",
    plantName: "OVE-67 Red Cherry tomato",
  },
  {
    query: "Bulgarian Carrot",
    expectedCanonicalName: "Bulgarian Carrot pepper",
    expectedCatalogKind: "plant_variety",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant variety",
    plantName: "OVE-88 Bulgarian Carrot pepper",
  },
  {
    query: "Odessa Market",
    expectedCanonicalName: "Odessa Market tomato",
    expectedCatalogKind: "plant_variety",
    expectedObjectKind: "plant",
    expectedIdentityLabel: "Plant variety",
    plantName: "OVE-88 Odessa Market tomato",
  },
];

const BLOCKED_ALIAS_SMOKE_CASES: BlockedAliasSmokeCase[] = [
  {
    query: "garden tomato",
    forbiddenDisplayName: "garden tomato",
  },
  {
    query: "love apple",
    forbiddenDisplayName: "love apple",
    forbiddenCanonicalName: "Solanum lycopersicum L.",
    forbiddenCatalogKind: "species",
  },
  {
    query: "помидор",
    forbiddenDisplayName: "помидор",
    forbiddenCanonicalName: "Solanum lycopersicum L.",
    forbiddenCatalogKind: "species",
  },
  {
    query: "gherkin",
    forbiddenDisplayName: "gherkin",
    forbiddenCanonicalName: "Cucumis sativus L.",
    forbiddenCatalogKind: "species",
  },
  {
    query: "pickle",
    forbiddenDisplayName: "pickle",
    forbiddenCanonicalName: "Cucumis sativus L.",
    forbiddenCatalogKind: "species",
  },
  {
    query: "holy basil",
    forbiddenDisplayName: "holy basil",
  },
  {
    query: "Українська сіра",
    forbiddenDisplayName: "Українська сіра",
    forbiddenCanonicalName: "Ukrainian Grey (Cattle)",
    forbiddenCatalogKind: "breed",
  },
  {
    query: "Unreviewed NPGS landrace proof row",
    forbiddenDisplayName: "Unreviewed NPGS landrace proof row",
  },
  {
    query: "Balkan dry bean proof row",
    forbiddenDisplayName: "Balkan dry bean proof row",
  },
  {
    query: "Kyiv Long cucumber proof row",
    forbiddenDisplayName: "Kyiv Long cucumber proof row",
  },
  {
    query: "Chernozem melon proof row",
    forbiddenDisplayName: "Chernozem melon proof row",
  },
  {
    query: "Red Cherry duplicate proof row",
    forbiddenDisplayName: "Red Cherry duplicate proof row",
  },
  {
    query: "Ambiguous Capsicum proof row",
    forbiddenDisplayName: "Ambiguous Capsicum proof row",
  },
  {
    query: "Restricted-field proof row",
    forbiddenDisplayName: "Restricted-field proof row",
  },
  {
    query: "Policy-caveat proof row",
    forbiddenDisplayName: "Policy-caveat proof row",
  },
  {
    query: "External-terms proof row",
    forbiddenDisplayName: "External-terms proof row",
  },
];

class CookieJar {
  private readonly cookies = new Map<string, string>();

  set(name: string, value: string) {
    this.cookies.set(name, value);
  }

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
  const jar = new CookieJar();

  const email = `ove67-smoke-${Date.now()}-${randomUUID()}@example.test`;
  await authRequest(baseUrl, jar, "/api/auth/sign-up/email", {
    email,
    password: TEST_PASSWORD,
    name: PRIVATE_AUTH_COMPATIBILITY_NAME,
  });
  await authRequest(baseUrl, jar, "/api/auth/sign-in/email", {
    email,
    password: TEST_PASSWORD,
  });
  await grantSmokeWriteAccess(email);

  const gardenHtml = await textRequest(baseUrl, jar, "/garden");
  assertIncludes(
    gardenHtml,
    "Catalog match",
    "Garden page missing catalog UI.",
  );
  assertIncludes(
    gardenHtml,
    "Keep without match",
    "Garden page missing catalog fallback UI.",
  );

  const evidence = [];
  for (const smokeCase of SMOKE_CASES) {
    const typeahead = await jsonRequest<TypeaheadResponse>(
      baseUrl,
      jar,
      `/api/garden/catalog/typeahead?q=${encodeURIComponent(smokeCase.query)}`,
    );
    const suggestions = Array.isArray(typeahead.suggestions)
      ? typeahead.suggestions
      : [];
    assertNoDuplicateConcepts(smokeCase.query, suggestions);

    const selected = suggestions.find(
      (suggestion) =>
        suggestion.canonicalName === smokeCase.expectedCanonicalName &&
        suggestion.catalogKind === smokeCase.expectedCatalogKind,
    );
    if (!selected) {
      throw new Error(
        `Missing intended suggestion for ${smokeCase.query}: ${smokeCase.expectedCanonicalName} (${smokeCase.expectedCatalogKind}).`,
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
          spaceName: "OVE-67 catalog UX smoke",
          plantName: smokeCase.plantName,
          objectKind: defaultObjectKindForCatalogSelection(
            selected.catalogKind,
            selected.source,
          ),
          catalogItemId: selected.id,
          userAddedCatalogName: null,
          varietyText: selected.displayName,
          title: `OVE-67 ${smokeCase.query}`,
          body: "Catalog UX smoke entry. No personal garden details.",
          entryDate: "2026-06-30",
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
      `${smokeCase.query} readback did not preserve selected catalog id.`,
    );
    assertEqual(
      entry.plantObject.objectKind,
      smokeCase.expectedObjectKind,
      `${smokeCase.query} readback object kind mismatch.`,
    );
    assertEqual(
      entry.plantObject.varietyText,
      smokeCase.expectedCanonicalName,
      `${smokeCase.query} readback canonical identity mismatch.`,
    );
    assertEqual(
      entry.plantObject.varietyState,
      "selected",
      `${smokeCase.query} readback variety state mismatch.`,
    );

    const readbackText = visiblePageText(
      await textRequest(baseUrl, jar, entry.readbackUrl),
    );
    assertIncludes(
      readbackText,
      smokeCase.plantName,
      `${smokeCase.query} readback page missing object name.`,
    );
    assertMatches(
      readbackText,
      new RegExp(
        `${escapeRegExp(smokeCase.expectedIdentityLabel)}\\s*:\\s*${escapeRegExp(
          smokeCase.expectedCanonicalName,
        )}`,
      ),
      `${smokeCase.query} readback page missing kind-specific catalog label. Text snippet: ${snippetAround(
        readbackText,
        smokeCase.expectedCanonicalName,
      )}`,
    );

    evidence.push({
      query: smokeCase.query,
      suggestionCount: suggestions.length,
      selectedResultText: selected.displayName,
      canonicalName: selected.canonicalName,
      catalogKind: selected.catalogKind,
      objectKind: entry.plantObject.objectKind,
      varietyState: entry.plantObject.varietyState,
      duplicateSameConceptSuggestionsAbsent: true,
      readbackIdentityPreserved: true,
      readbackPageStatus: 200,
    });
  }

  const blockedAliasEvidence = [];
  for (const smokeCase of BLOCKED_ALIAS_SMOKE_CASES) {
    const typeahead = await jsonRequest<TypeaheadResponse>(
      baseUrl,
      jar,
      `/api/garden/catalog/typeahead?q=${encodeURIComponent(smokeCase.query)}`,
    );
    const suggestions = Array.isArray(typeahead.suggestions)
      ? typeahead.suggestions
      : [];
    assertNoDuplicateConcepts(smokeCase.query, suggestions);
    assertNoForbiddenDisplayName(smokeCase, suggestions);
    const canonicalTargetAbsent = assertForbiddenCanonicalAbsentIfNeeded(
      smokeCase,
      suggestions,
    );

    blockedAliasEvidence.push({
      query: smokeCase.query,
      suggestionCount: suggestions.length,
      forbiddenDisplayNameAbsent: true,
      canonicalTargetAbsent,
      duplicateSameConceptSuggestionsAbsent: true,
    });
  }

  const output = {
    baseUrl,
    cases: evidence,
    blockedAliasCases: blockedAliasEvidence,
    leakCheck: "passed",
  };
  assertNoForbiddenEvidence(output);
  console.log(JSON.stringify(output, null, 2));
}

function parseOptions(argv: string[]) {
  let baseUrl =
    process.env.OVE67_SMOKE_BASE_URL ??
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

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function grantSmokeWriteAccess(email: string) {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);

  if (!connectionString) {
    throw new Error(
      "Missing supported database connection env for smoke write access.",
    );
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  try {
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
  } finally {
    await db.destroy();
  }
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

function assertNoDuplicateConcepts(
  query: string,
  suggestions: CatalogSuggestion[],
) {
  const seen = new Set<string>();

  for (const suggestion of suggestions) {
    const key = [
      suggestion.catalogKind,
      suggestion.canonicalName.trim().replace(/\s+/g, " ").toLowerCase(),
    ].join(":");

    if (seen.has(key)) {
      throw new Error(
        `${query} returned duplicate same-concept suggestion for ${suggestion.canonicalName} (${suggestion.catalogKind}).`,
      );
    }
    seen.add(key);
  }
}

function assertNoForbiddenDisplayName(
  smokeCase: BlockedAliasSmokeCase,
  suggestions: CatalogSuggestion[],
) {
  const forbidden = normalizeSmokeName(smokeCase.forbiddenDisplayName);
  const match = suggestions.find(
    (suggestion) => normalizeSmokeName(suggestion.displayName) === forbidden,
  );

  if (match) {
    throw new Error(
      `${smokeCase.query} returned blocked alias display name ${match.displayName}.`,
    );
  }
}

function assertForbiddenCanonicalAbsentIfNeeded(
  smokeCase: BlockedAliasSmokeCase,
  suggestions: CatalogSuggestion[],
) {
  if (!smokeCase.forbiddenCanonicalName || !smokeCase.forbiddenCatalogKind) {
    return null;
  }

  const match = suggestions.find(
    (suggestion) =>
      suggestion.canonicalName === smokeCase.forbiddenCanonicalName &&
      suggestion.catalogKind === smokeCase.forbiddenCatalogKind,
  );

  if (match) {
    throw new Error(
      `${smokeCase.query} resolved blocked alias to ${match.canonicalName} (${match.catalogKind}).`,
    );
  }

  return true;
}

function normalizeSmokeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function assertNoForbiddenEvidence(output: unknown) {
  const serialized = JSON.stringify(output);
  for (const marker of FORBIDDEN_EVIDENCE_MARKERS) {
    if (serialized.toLowerCase().includes(marker.toLowerCase())) {
      throw new Error(`Smoke evidence contains forbidden marker: ${marker}.`);
    }
  }
}

function assertIncludes(value: string, expected: string, message: string) {
  if (!value.includes(expected)) throw new Error(message);
}

function assertMatches(value: string, expected: RegExp, message: string) {
  if (!expected.test(value)) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}; received ${actual}.`);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snippetAround(value: string, needle: string) {
  const index = value.indexOf(needle);
  if (index === -1) return value.slice(0, 240);
  return value.slice(Math.max(0, index - 120), index + needle.length + 120);
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
