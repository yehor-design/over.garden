import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { CatalogKind, Database } from "@/db/schema";
import {
  publicCatalogPermalinkPath,
  type CatalogAliasScheme,
  type PublicCatalogAddressRequest,
} from "@/lib/catalog/addresses";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { catalogSpeciesSlugSql } from "@/server/catalog-address-sql";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MAX_MERGE_HOPS = 4;
const MAX_ALIAS_VALUE_LENGTH = 120;

/**
 * What an address request resolves to (ADR-0026 D8), decided before any page
 * streams: the canonical page itself, a permanent redirect to it (a
 * historical slug, an old `/variety` or `/breed` path, a form under a stale
 * species slug, a merged node), or nothing.
 */
export type PublicCatalogAddressLookup =
  | { status: "canonical"; catalogItemId: string; canonicalPath: string }
  | { status: "redirect"; catalogItemId: string; canonicalPath: string }
  | { status: "not_found" };

export interface PublicCatalogCanonicalAddress {
  catalogItemId: string;
  catalogKind: CatalogKind;
  nodeKind: string;
  publicSlug: string;
  speciesSlug: string | null;
  canonicalPath: string;
  permalinkPath: string;
}

/** Every slug ever assigned in a namespace, with the node it belongs to. */
export function buildCatalogSlugHistoryLookupQuery(
  executor: QueryExecutor,
  slug: string,
  namespaces: readonly ("species" | "form")[],
) {
  return executor
    .selectFrom("catalog_item_slug_history")
    .select([
      "catalog_item_slug_history.namespace as namespace",
      "catalog_item_slug_history.slug as slug",
      "catalog_item_slug_history.catalog_item_id as catalogItemId",
      "catalog_item_slug_history.valid_to as validTo",
    ])
    .where("catalog_item_slug_history.slug", "=", slug)
    .where("catalog_item_slug_history.namespace", "in", [...namespaces])
    // The current assignment first, then the most recent retired one.
    .orderBy(sql`case when ${sql.ref("catalog_item_slug_history.valid_to")} is null then 0 else 1 end`)
    .orderBy("catalog_item_slug_history.valid_from", "desc")
    .limit(1);
}

/** The node behind an address: its kind, slug, species, and merge target. */
export function buildCatalogItemAddressQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_items")
    .select([
      "catalog_items.id as id",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.node_kind as nodeKind",
      "catalog_items.public_slug as publicSlug",
      "catalog_items.identity_state as identityState",
      "catalog_items.status as status",
      "catalog_items.created_by_user_id as createdByUserId",
      "catalog_items.merged_into_catalog_item_id as mergedIntoCatalogItemId",
      catalogSpeciesSlugSql("catalog_items").as("speciesSlug"),
    ])
    .where("catalog_items.id", "=", catalogItemId);
}

/** An external identifier's node (`/eppo/{code}`, `/col/{id}`, …). */
export function buildCatalogIdentifierLookupQuery(
  executor: QueryExecutor,
  scheme: CatalogAliasScheme,
  value: string,
) {
  return executor
    .selectFrom("catalog_item_identifiers")
    .select(["catalog_item_identifiers.catalog_item_id as catalogItemId"])
    .where("catalog_item_identifiers.scheme", "=", scheme)
    .where("catalog_item_identifiers.value", "=", value)
    .orderBy("catalog_item_identifiers.created_at", "asc")
    .limit(1);
}

/**
 * Resolves the organism a page request names, following merges, and says
 * whether the request is the canonical address or must redirect to it.
 */
export async function resolvePublicCatalogAddress(
  request: PublicCatalogAddressRequest,
  executor: QueryExecutor = db,
): Promise<PublicCatalogAddressLookup> {
  const subjectSlug = request.kind === "species" ? (request.formSlug ?? request.speciesSlug) : request.slug;
  const namespaces: ("species" | "form")[] =
    request.kind === "species"
      ? request.formSlug
        ? ["form", "species"]
        : ["species", "form"]
      : ["form", "species"];
  const history = await buildCatalogSlugHistoryLookupQuery(
    executor,
    subjectSlug,
    namespaces,
  ).executeTakeFirst();
  if (!history) return { status: "not_found" };

  const address = await readPublicCatalogCanonicalAddress(
    executor,
    history.catalogItemId,
  );
  if (!address) return { status: "not_found" };

  const requestedPath = requestedCatalogPath(request);
  return requestedPath === address.canonicalPath
    ? {
        status: "canonical",
        catalogItemId: address.catalogItemId,
        canonicalPath: address.canonicalPath,
      }
    : {
        status: "redirect",
        catalogItemId: address.catalogItemId,
        canonicalPath: address.canonicalPath,
      };
}

/** `/id/{uuid}`: the permalink resolves to the canonical page. */
export async function resolvePublicCatalogPermalink(
  catalogItemId: string,
  executor: QueryExecutor = db,
): Promise<PublicCatalogAddressLookup> {
  if (!isUuid(catalogItemId)) return { status: "not_found" };
  const address = await readPublicCatalogCanonicalAddress(executor, catalogItemId);
  return address
    ? {
        status: "redirect",
        catalogItemId: address.catalogItemId,
        canonicalPath: address.canonicalPath,
      }
    : { status: "not_found" };
}

/** `/eppo/{code}`, `/col/{id}`, `/gbif/{key}`, `/wikidata/{qid}`. */
export async function resolvePublicCatalogAlias(
  scheme: CatalogAliasScheme,
  value: string,
  executor: QueryExecutor = db,
): Promise<PublicCatalogAddressLookup> {
  const normalized = normalizeCatalogAliasValue(scheme, value);
  if (!normalized) return { status: "not_found" };
  const identifier = await buildCatalogIdentifierLookupQuery(
    executor,
    scheme,
    normalized,
  ).executeTakeFirst();
  if (!identifier) return { status: "not_found" };
  const address = await readPublicCatalogCanonicalAddress(
    executor,
    identifier.catalogItemId,
  );
  return address
    ? {
        status: "redirect",
        catalogItemId: address.catalogItemId,
        canonicalPath: address.canonicalPath,
      }
    : { status: "not_found" };
}

/**
 * The canonical address of a node, following merges. Null when the node is
 * retired, gardener-created, not selectable, or has no slug.
 */
export async function readPublicCatalogCanonicalAddress(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<PublicCatalogCanonicalAddress | null> {
  let currentId = catalogItemId;
  for (let hop = 0; hop <= MAX_MERGE_HOPS; hop += 1) {
    const item = await buildCatalogItemAddressQuery(executor, currentId).executeTakeFirst();
    if (!item) return null;
    if (item.identityState === "merged" && item.mergedIntoCatalogItemId) {
      currentId = item.mergedIntoCatalogItemId;
      continue;
    }
    if (
      item.identityState !== "active" ||
      item.createdByUserId !== null ||
      !item.publicSlug ||
      !isSelectableStatus(item.status)
    ) {
      return null;
    }
    const catalogKind = item.catalogKind as CatalogKind;
    return {
      catalogItemId: item.id,
      catalogKind,
      nodeKind: item.nodeKind,
      publicSlug: item.publicSlug,
      speciesSlug: item.speciesSlug,
      canonicalPath: publicCatalogEvidencePath({
        catalogKind,
        publicSlug: item.publicSlug,
        speciesSlug: item.speciesSlug,
      }),
      permalinkPath: publicCatalogPermalinkPath(item.id),
    };
  }
  return null;
}

export function requestedCatalogPath(request: PublicCatalogAddressRequest) {
  if (request.kind === "species") {
    return request.formSlug
      ? `/species/${request.speciesSlug}/${request.formSlug}`
      : `/species/${request.speciesSlug}`;
  }
  return `/${request.catalogKind === "breed" ? "breed" : "variety"}/${request.slug}`;
}

/** Identifier values as the schemes publish them; anything else is no match. */
export function normalizeCatalogAliasValue(
  scheme: CatalogAliasScheme,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ALIAS_VALUE_LENGTH) return null;
  switch (scheme) {
    case "eppo":
      return /^[A-Za-z0-9]{3,10}$/u.test(trimmed) ? trimmed.toUpperCase() : null;
    case "wikidata":
      return /^[Qq]\d{1,12}$/u.test(trimmed) ? trimmed.toUpperCase() : null;
    case "gbif":
      return /^\d{1,12}$/u.test(trimmed) ? trimmed : null;
    case "col":
      return /^[A-Za-z0-9._-]{1,64}$/u.test(trimmed) ? trimmed : null;
    default:
      return null;
  }
}

function isSelectableStatus(status: string) {
  return (SELECTABLE_CATALOG_STATUSES as readonly string[]).includes(status);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
