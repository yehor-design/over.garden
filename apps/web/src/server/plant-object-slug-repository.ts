import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "@/db/schema";
import { addressManifestEntry } from "@/lib/address/address-manifest";
import { isAddressSlug } from "@/lib/address/address-contract.generated";
import {
  reservedAsTaken,
  resolveAddressCollision,
  slugify,
} from "@/lib/address/slugify";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const OBJECT = addressManifestEntry("object");

/**
 * The passport's address, given the moment an object first has a public entry
 * (ADR-0029 D9).
 *
 * `OVE-428` gave every object that *then* had a public entry a slug, by a move
 * script run once, and nothing in the product gave one to the next object —
 * so an object published after the move had a passport at
 * `/lineage/objects/{uuid}`, the address the ADR retired, and none at
 * `/@{handle}/objects/{slug}`. This runs inside the same transaction that
 * publishes the entry, so the two addresses come into existence together.
 *
 * The base is the object's display name through the manifest's own slugifier,
 * the disambiguator is a counter (D6), and the scope is the gardener: "Томат"
 * is what half the gardens on this platform call their tomato, and each of
 * them gets `томат` under their own handle. The advisory lock serializes two
 * publishes of the same name by the same gardener for the same reason
 * `assignJournalEntrySlug` takes one; it is keyed by owner and base so
 * unrelated gardeners never wait on each other. It is taken after the
 * per-owner lock the publish transaction already holds, always in that order.
 *
 * A slug, once given, is frozen (D8): a second publish finds it and returns
 * it, and the display name may change without the address following.
 */
export async function assignPlantObjectPublicSlug(
  executor: QueryExecutor,
  input: { plantObjectId: string; ownerUserId: string; displayName: string },
): Promise<string> {
  const existing = await executor
    .selectFrom("plant_objects")
    .select(["plant_objects.public_slug as publicSlug"])
    .where("plant_objects.id", "=", input.plantObjectId)
    .where("plant_objects.owner_user_id", "=", input.ownerUserId)
    .executeTakeFirst();
  if (!existing) throw new Error("Plant object was not found in this garden.");
  if (existing.publicSlug) return existing.publicSlug;

  const base = slugify(input.displayName, {
    script: OBJECT.script,
    language: "uk",
    budget: OBJECT.budget,
    fallback: "object",
  });
  if (!isAddressSlug("object", base)) {
    throw new Error(`Not an object slug: ${base}`);
  }

  await sql`select pg_advisory_xact_lock(hashtextextended(${`plant-object-slug:${input.ownerUserId}:${base}`}, 0))`.execute(
    executor,
  );

  const taken = await buildTakenPlantObjectSlugsQuery(
    executor,
    input.ownerUserId,
    base,
  ).execute();
  const slug = resolveAddressCollision(
    "object",
    base,
    reservedAsTaken(
      OBJECT.reservedWords,
      taken.map((row) => row.slug),
    ),
  );

  // `public_slug is null` in the predicate: the row was read a moment ago in
  // this transaction, but a slug is frozen and this must never overwrite one.
  await executor
    .updateTable("plant_objects")
    .set({ public_slug: slug })
    .where("plant_objects.id", "=", input.plantObjectId)
    .where("plant_objects.owner_user_id", "=", input.ownerUserId)
    .where("plant_objects.public_slug", "is", null)
    .execute();
  return slug;
}

/**
 * Every slug of this gardener's that could collide with the base or one of
 * its `-N` suffixes — the live column *and* the slug history under the
 * gardener's current handle.
 *
 * The history matters here in a way it does not yet for entries: a passport
 * address that was moved still answers 308 from its old slug (D8), and a
 * counter that read only the live column would hand that old slug to a second
 * object, so the old link would silently start opening a different passport.
 */
export function buildTakenPlantObjectSlugsQuery(
  executor: QueryExecutor,
  ownerUserId: string,
  base: string,
) {
  return executor
    .selectFrom("plant_objects")
    .select(["plant_objects.public_slug as slug"])
    .where("plant_objects.owner_user_id", "=", ownerUserId)
    .where("plant_objects.public_slug", "is not", null)
    .where((eb) =>
      eb.or([
        eb("plant_objects.public_slug", "=", base),
        eb("plant_objects.public_slug", "like", `${base}-%`),
      ]),
    )
    .$narrowType<{ slug: string }>()
    .union(
      executor
        .selectFrom("plant_object_slug_history as history")
        .innerJoin("user_handle_registry", (join) =>
          join
            .onRef(
              "user_handle_registry.normalized_handle",
              "=",
              "history.author_handle",
            )
            .on("user_handle_registry.lifecycle_state", "=", "current"),
        )
        .select(["history.slug as slug"])
        .where("user_handle_registry.user_id", "=", ownerUserId)
        .where((eb) =>
          eb.or([
            eb("history.slug", "=", base),
            eb("history.slug", "like", `${base}-%`),
          ]),
        ),
    );
}
