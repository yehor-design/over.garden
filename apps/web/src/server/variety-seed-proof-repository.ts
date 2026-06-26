import "server-only";

import { type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogItemStatus,
  Database,
  VarietySeedProof,
  VarietySeedProofStatus,
} from "@/db/schema";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import type { RequestScope } from "@/server/request-scope";

const MAX_SEED_PROOFS_FOR_CURATION = 25;
const MAX_CATALOG_ITEM_ID_LENGTH = 200;
const SEED_PROOF_LIMITS = {
  title: { min: 1, max: 120 },
  summary: { min: 1, max: 280 },
  body: { min: 80, max: 1600 },
  sourceLabel: { min: 1, max: 160 },
} as const;

const UNSAFE_HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const UNSAFE_PUBLIC_SEED_PATTERNS = [
  /\b(lat|latitude|lng|longitude|gps|coordinates?)\b/i,
  /\baddress\b/i,
  /\bstreet\b/i,
  /\bemail\b/i,
  /\bphone\b/i,
  /\bowner[_ -]?user[_ -]?id\b/i,
  /\bquarantine[_ -]?key\b/i,
  /координат/i,
  /широт/i,
  /довгот/i,
  /геолокац/i,
  /адрес/i,
  /вулиц/i,
  /улиц/i,
  /имейл/i,
  /телефон/i,
  /[^\s@]+@[^\s@]+\.[^\s@]+/i,
];

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface VarietySeedProofInput {
  catalogItemId: string;
  title: string;
  summary: string;
  body: string;
  sourceLabel?: string | null;
  status: VarietySeedProofStatus | string;
}

export interface NormalizedVarietySeedProofInput {
  catalogItemId: string;
  title: string;
  summary: string;
  body: string;
  sourceLabel: string | null;
  status: VarietySeedProofStatus;
}

export interface SeedProofCatalogItem {
  id: string;
  canonicalName: string;
  publicSlug: string;
  status: Extract<CatalogItemStatus, "seeded" | "confirmed">;
  source: string;
  locale: string;
}

export interface VarietySeedProofCurationRow {
  id: string;
  catalogItemId: string;
  catalogCanonicalName: string;
  catalogPublicSlug: string;
  catalogStatus: Extract<CatalogItemStatus, "seeded" | "confirmed">;
  catalogLocale: string;
  title: string;
  summary: string;
  body: string;
  sourceLabel: string | null;
  status: VarietySeedProofStatus;
  publishedAt: Date | string | null;
  updatedAt: Date | string;
}

export interface PublicVarietySeedProof {
  title: string;
  summary: string;
  body: string;
  sourceLabel: string | null;
  publishedAt: Date | string | null;
  updatedAt: Date | string;
}

export interface UpsertVarietySeedProofResult {
  proof: VarietySeedProof;
  catalog: SeedProofCatalogItem;
}

export async function listVarietySeedProofsForCuration(
  limit = MAX_SEED_PROOFS_FOR_CURATION,
  executor: QueryExecutor = db,
): Promise<VarietySeedProofCurationRow[]> {
  const rows = await buildListVarietySeedProofsForCurationQuery(
    executor,
    limit,
  ).execute();

  return rows.map((row) => ({
    id: row.id,
    catalogItemId: row.catalogItemId,
    catalogCanonicalName: row.catalogCanonicalName,
    catalogPublicSlug: row.catalogPublicSlug,
    catalogStatus: row.catalogStatus as Extract<
      CatalogItemStatus,
      "seeded" | "confirmed"
    >,
    catalogLocale: row.catalogLocale,
    title: row.title,
    summary: row.summary,
    body: row.body,
    sourceLabel: row.sourceLabel,
    status: row.status as VarietySeedProofStatus,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  }));
}

export async function upsertVarietySeedProof(
  scope: RequestScope,
  input: VarietySeedProofInput,
): Promise<UpsertVarietySeedProofResult> {
  const normalized = normalizeVarietySeedProofInput(input);
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    const catalog = await requireSeedProofCatalogItem(
      trx,
      normalized.catalogItemId,
    );
    const proof = await buildUpsertVarietySeedProofQuery(
      trx,
      scope,
      normalized,
      now,
    ).executeTakeFirstOrThrow();

    return { proof, catalog };
  });
}

export function buildFindSeedProofCatalogItemQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "id",
      "canonical_name as canonicalName",
      "public_slug as publicSlug",
      "status",
      "source",
      "locale",
    ])
    .where("id", "=", catalogItemId)
    .where("status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("created_by_user_id", "is", null)
    .where("public_slug", "is not", null)
    .$narrowType<{ publicSlug: string }>();
}

export function buildUpsertVarietySeedProofQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: NormalizedVarietySeedProofInput,
  now: Date,
) {
  const publishedAt = input.status === "published" ? now : null;

  return executor
    .insertInto("variety_seed_proofs")
    .values({
      catalog_item_id: input.catalogItemId,
      title: input.title,
      summary: input.summary,
      body: input.body,
      source_label: input.sourceLabel,
      status: input.status,
      author_user_id: scope.userId,
      published_at: publishedAt,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("catalog_item_id").doUpdateSet({
        title: input.title,
        summary: input.summary,
        body: input.body,
        source_label: input.sourceLabel,
        status: input.status,
        author_user_id: scope.userId,
        published_at: publishedAt,
        updated_at: now,
      }),
    )
    .returningAll();
}

export function buildListVarietySeedProofsForCurationQuery(
  executor: QueryExecutor,
  limit = MAX_SEED_PROOFS_FOR_CURATION,
) {
  return executor
    .selectFrom("variety_seed_proofs")
    .innerJoin(
      "catalog_items",
      "catalog_items.id",
      "variety_seed_proofs.catalog_item_id",
    )
    .select([
      "variety_seed_proofs.id as id",
      "variety_seed_proofs.catalog_item_id as catalogItemId",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "catalog_items.status as catalogStatus",
      "catalog_items.locale as catalogLocale",
      "variety_seed_proofs.title as title",
      "variety_seed_proofs.summary as summary",
      "variety_seed_proofs.body as body",
      "variety_seed_proofs.source_label as sourceLabel",
      "variety_seed_proofs.status as status",
      "variety_seed_proofs.published_at as publishedAt",
      "variety_seed_proofs.updated_at as updatedAt",
    ])
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("catalog_items.public_slug", "is not", null)
    .orderBy("variety_seed_proofs.updated_at", "desc")
    .limit(normalizeSeedProofLimit(limit))
    .$narrowType<{ catalogPublicSlug: string }>();
}

export function buildPublishedVarietySeedProofByCatalogItemIdQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("variety_seed_proofs")
    .select([
      "title",
      "summary",
      "body",
      "source_label as sourceLabel",
      "published_at as publishedAt",
      "updated_at as updatedAt",
    ])
    .where("catalog_item_id", "=", catalogItemId)
    .where("status", "=", "published");
}

export function normalizeVarietySeedProofInput(
  input: VarietySeedProofInput,
): NormalizedVarietySeedProofInput {
  const catalogItemId = normalizeCatalogItemId(input.catalogItemId);
  if (!catalogItemId) {
    throw new Error("Catalog item is required for a variety seed proof.");
  }

  const normalized = {
    catalogItemId,
    title: normalizeSingleLineText(
      "title",
      input.title,
      SEED_PROOF_LIMITS.title,
    ),
    summary: normalizeSingleLineText(
      "summary",
      input.summary,
      SEED_PROOF_LIMITS.summary,
    ),
    body: normalizeBodyText(input.body),
    sourceLabel: normalizeOptionalText(
      "source label",
      input.sourceLabel,
      SEED_PROOF_LIMITS.sourceLabel,
    ),
    status: normalizeSeedProofStatus(input.status),
  };

  assertSeedProofTextIsPublicSafe([
    normalized.title,
    normalized.summary,
    normalized.body,
    normalized.sourceLabel ?? "",
  ]);

  return normalized;
}

async function requireSeedProofCatalogItem(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<SeedProofCatalogItem> {
  const row = await buildFindSeedProofCatalogItemQuery(
    executor,
    catalogItemId,
  ).executeTakeFirst();

  if (!row) {
    throw new Error(
      "Seed proof can only be attached to a seeded or confirmed public catalog item.",
    );
  }

  return {
    id: row.id,
    canonicalName: row.canonicalName,
    publicSlug: row.publicSlug,
    status: row.status as Extract<CatalogItemStatus, "seeded" | "confirmed">,
    source: row.source,
    locale: row.locale,
  };
}

function normalizeCatalogItemId(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0
    ? trimmed.slice(0, MAX_CATALOG_ITEM_ID_LENGTH)
    : null;
}

function normalizeSingleLineText(
  fieldName: string,
  value: string,
  limits: { min: number; max: number },
) {
  return normalizeBoundedText(
    fieldName,
    value.trim().replace(/\s+/g, " "),
    limits,
  );
}

function normalizeOptionalText(
  fieldName: string,
  value: string | null | undefined,
  limits: { min: number; max: number },
) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalizeBoundedText(fieldName, normalized, limits) : null;
}

function normalizeBodyText(value: string) {
  const normalized = value
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return normalizeBoundedText("body", normalized, SEED_PROOF_LIMITS.body);
}

function normalizeBoundedText(
  fieldName: string,
  value: string,
  limits: { min: number; max: number },
) {
  if (value.length < limits.min) {
    throw new Error(`Seed proof ${fieldName} is too short.`);
  }

  if (value.length > limits.max) {
    throw new Error(`Seed proof ${fieldName} is too long.`);
  }

  return value;
}

function normalizeSeedProofStatus(value: string): VarietySeedProofStatus {
  if (value === "published" || value === "draft") return value;
  throw new Error("Seed proof status must be draft or published.");
}

function assertSeedProofTextIsPublicSafe(values: string[]) {
  for (const value of values) {
    if (!value) continue;

    if (UNSAFE_HTML_PATTERN.test(value)) {
      throw new Error("Seed proof text must be plain text.");
    }

    for (const pattern of UNSAFE_PUBLIC_SEED_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error("Seed proof text contains unsafe public fields.");
      }
    }
  }
}

function normalizeSeedProofLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_SEED_PROOFS_FOR_CURATION;
  return Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_SEED_PROOFS_FOR_CURATION,
  );
}
