import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { isAddressSlug } from "@/lib/address/address-contract.generated";
import { resolveAddressCollision } from "@/lib/address/slugify";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type CatalogSlugNamespace = "species" | "form";

/** Species slugs and form slugs live in separate history namespaces. */
export function catalogSlugNamespaceForNodeKind(
  nodeKind: string,
): CatalogSlugNamespace {
  return nodeKind === "taxon" ? "species" : "form";
}

/**
 * Every slug ever assigned to another organism that could collide with the
 * base or its `-2`, `-3`, … suffixes. Both namespaces count: a bare
 * `/species/{slug}` request is looked up in both, so one slug names one
 * organism, and a retired slug is never handed to a second one (D8).
 */
export function buildTakenCatalogSlugsQuery(
  executor: QueryExecutor,
  base: string,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_item_slug_history")
    .select(["catalog_item_slug_history.slug as slug"])
    .where("catalog_item_slug_history.catalog_item_id", "!=", catalogItemId)
    .where((eb) =>
      eb.or([
        eb("catalog_item_slug_history.slug", "=", base),
        eb("catalog_item_slug_history.slug", "like", `${base}-%`),
      ]),
    );
}

/**
 * The base itself when free, else the first free `-N` suffix.
 *
 * The namespace is the address manifest's, and `species` and `form` are two of
 * its names: both are `latin`, so the guard is the same either way, but saying
 * which one is being assigned keeps the call honest when they diverge.
 */
export function chooseCatalogSlug(
  base: string,
  takenSlugs: readonly string[],
  namespace: CatalogSlugNamespace = "form",
) {
  return resolveAddressCollision(namespace, base, new Set(takenSlugs));
}

/**
 * Assigns a slug to an organism: the base, or the first free suffixed
 * variant. The `catalog_item_slug_history_sync` trigger records the
 * assignment and closes the previous slug, which answers 308 from then on.
 * Reassigning the organism's own current or former slug is allowed and
 * reopens that history row.
 */
export async function assignCatalogSlug(
  input: { catalogItemId: string; nodeKind: string; base: string },
  executor: QueryExecutor = db,
): Promise<{ slug: string; namespace: CatalogSlugNamespace }> {
  const namespace = catalogSlugNamespaceForNodeKind(input.nodeKind);
  if (!isAddressSlug(namespace, input.base)) {
    throw new Error(`Not a catalog slug: ${input.base}`);
  }
  const taken = await buildTakenCatalogSlugsQuery(
    executor,
    input.base,
    input.catalogItemId,
  ).execute();
  const slug = chooseCatalogSlug(
    input.base,
    taken.map((row) => row.slug),
    namespace,
  );
  await executor
    .updateTable("catalog_items")
    .set({ public_slug: slug })
    .where("catalog_items.id", "=", input.catalogItemId)
    .execute();
  return { slug, namespace };
}
