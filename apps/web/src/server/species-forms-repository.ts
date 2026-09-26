import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, PlantObjectKind } from "@/db/schema";
import { ADDRESS_MANIFEST } from "@/lib/address/address-manifest";
import { slugify } from "@/lib/address/slugify";
import { GARDENER_ENTRY_SOURCE } from "@/lib/catalog/gardener-entries";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { StandardSpecies } from "@/server/catalog-repository";
import { assignCatalogSlug } from "@/server/catalog-slug-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * A species' list of cultivars or breeds (OVE-524, the owner's decision of
 * 2026-09-25): what the project already has for that species, and nothing
 * the catalogue merely knows.
 *
 *   * A registered cultivar or breed is on the list once at least one object
 *     uses it; the register's other thousands are not offered.
 *   * An entry a gardener added is on the list from the moment it exists —
 *     shared with every gardener at once, published like any form, and
 *     corrected by the owner afterwards (29.21), never before.
 *   * Merged and removed entries are not on it.
 *
 * Most used first, then by name. The count orders the list and is never
 * shown.
 */

/** The snapshot 0086 creates for the gardeners' source. */
export const GARDENER_SOURCE_SLUG = "overgarden-gardeners";
/** The name's bounds: what `catalog_item_names.display_name` holds. */
export const SPECIES_FORM_NAME_MAX_LENGTH = 120;
/** More than any species has on production (2026-09-26: tens). */
export const SPECIES_FORM_LIST_LIMIT = 300;

export type SpeciesFormNodeKind = "cultivar" | "breed";

export function formNodeKindForObjectKind(
  objectKind: PlantObjectKind,
): SpeciesFormNodeKind {
  return objectKind === "animal" ? "breed" : "cultivar";
}

export interface SpeciesFormRow {
  id: string;
  name: string;
}

export interface SpeciesForm {
  id: string;
  canonicalName: string;
}

/** A gardener's entry name as stored: one line of text, 1–120 characters. */
export function normalizeSpeciesFormName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  if (Array.from(normalized).length > SPECIES_FORM_NAME_MAX_LENGTH) return null;
  return normalized;
}

/** How many objects use a form, as the list and the reuse both order by it. */
function formUsesSql(formRef: string) {
  return sql<number>`(
    select count(*)::int
    from plant_objects as used
    where used.catalog_item_id = ${sql.ref(`${formRef}.id`)}
      and used.variety_state = 'selected'
  )`;
}

/** The distinct forms of a species, whichever assertion attached them. */
function speciesFormIdsSql(speciesId: string) {
  return sql<{ id: string }>`(
    select distinct relation.from_catalog_item_id as id
    from catalog_item_relations as relation
    where relation.to_catalog_item_id = ${speciesId}::uuid
      and relation.relation_type = 'form_of'
  )`;
}

export function buildSpeciesFormsListQuery(
  executor: QueryExecutor,
  input: { speciesId: string; objectKind: PlantObjectKind },
) {
  return executor
    .selectFrom(speciesFormIdsSql(input.speciesId).as("forms"))
    .innerJoin("catalog_items as form", "form.id", "forms.id")
    .select(["form.id", "form.canonical_name as name"])
    .where("form.identity_state", "=", "active")
    .where("form.node_kind", "=", formNodeKindForObjectKind(input.objectKind))
    .where((eb) =>
      eb.or([
        eb("form.source", "=", GARDENER_ENTRY_SOURCE),
        eb.exists(
          eb
            .selectFrom("plant_objects as used")
            .select(sql`1`.as("one"))
            .whereRef("used.catalog_item_id", "=", "form.id")
            .where("used.variety_state", "=", "selected"),
        ),
      ]),
    )
    .orderBy(formUsesSql("form"), "desc")
    .orderBy("form.canonical_name", "asc")
    .orderBy("form.id", "asc")
    .limit(SPECIES_FORM_LIST_LIMIT);
}

export async function listSpeciesForms(
  input: { speciesId: string; objectKind: PlantObjectKind },
  executor: QueryExecutor = db,
): Promise<SpeciesFormRow[]> {
  return buildSpeciesFormsListQuery(executor, input).execute();
}

/**
 * A cultivar or breed chosen from the list, re-read at the write: an active
 * form of this species, of the object's kind. Any active form is accepted —
 * a name the gardener typed may have matched a registered cultivar no object
 * used yet — so the list is what is offered, not what is allowed.
 */
export async function findSpeciesForm(
  executor: QueryExecutor,
  input: { speciesId: string; formId: string; objectKind: PlantObjectKind },
): Promise<SpeciesForm | null> {
  const row = await executor
    .selectFrom(speciesFormIdsSql(input.speciesId).as("forms"))
    .innerJoin("catalog_items as form", "form.id", "forms.id")
    .select(["form.id", "form.canonical_name as canonicalName"])
    .where("form.id", "=", input.formId)
    .where("form.identity_state", "=", "active")
    .where("form.node_kind", "=", formNodeKindForObjectKind(input.objectKind))
    .executeTakeFirst();
  return row ?? null;
}

/**
 * The entry for a typed name: the one the species already has under the same
 * matching key (`catalog_cultivar_key`, migration 0086), or a new shared
 * entry. Never a duplicate: the lookup and the insert run under one
 * per-species lock, so two gardeners adding «Брама» at once get one entry.
 *
 * The existing one is found by any of its names, among every active form of
 * the species — a registered cultivar nobody used yet included — preferring
 * the most used, then a registered one over a gardener's, then the oldest.
 *
 * A new entry is a catalogue form (0086): kind `cultivar` or `breed`,
 * `form_of` the species through its own source assertion, `source =
 * 'gardener'`, created by the gardener and not reviewed. Its one name is the
 * name as typed, in the gardener's language, and its address is that name
 * romanized, like a register's denomination.
 */
export async function findOrCreateSpeciesForm(
  trx: Transaction<Database>,
  input: {
    species: StandardSpecies;
    objectKind: PlantObjectKind;
    name: string;
    locale: InterfaceLocale;
    userId: string;
  },
): Promise<SpeciesForm & { created: boolean }> {
  const nodeKind = formNodeKindForObjectKind(input.objectKind);
  await sql`select pg_advisory_xact_lock(hashtextextended(${`species-forms:${input.species.id}`}, 0))`.execute(
    trx,
  );

  const existing = await trx
    .selectFrom(speciesFormIdsSql(input.species.id).as("forms"))
    .innerJoin("catalog_items as form", "form.id", "forms.id")
    .select(["form.id", "form.canonical_name as canonicalName"])
    .where("form.identity_state", "=", "active")
    .where("form.node_kind", "=", nodeKind)
    .where((eb) =>
      eb.or([
        eb(
          sql`catalog_cultivar_key(form.canonical_name)`,
          "=",
          sql`catalog_cultivar_key(${input.name})`,
        ),
        eb.exists(
          eb
            .selectFrom("catalog_item_names as name")
            .select(sql`1`.as("one"))
            .whereRef("name.catalog_item_id", "=", "form.id")
            .where(
              sql`catalog_cultivar_key(name.display_name)`,
              "=",
              sql`catalog_cultivar_key(${input.name})`,
            ),
        ),
      ]),
    )
    .orderBy(formUsesSql("form"), "desc")
    .orderBy(sql`form.source = ${GARDENER_ENTRY_SOURCE}`, "asc")
    .orderBy("form.created_at", "asc")
    .orderBy("form.id", "asc")
    .limit(1)
    .executeTakeFirst();
  if (existing) return { ...existing, created: false };

  const assertion = await trx
    .insertInto("catalog_source_assertions")
    .columns([
      "source_slug",
      "source_snapshot_id",
      "rights_class",
      "confidence",
      "decision",
      "reason_codes",
    ])
    .expression((eb) =>
      eb
        .selectFrom("catalog_source_snapshots as snapshot")
        .select([
          sql.lit(GARDENER_SOURCE_SLUG).as("source_slug"),
          "snapshot.id",
          sql.lit("source_public").as("rights_class"),
          sql.lit(1).as("confidence"),
          sql.lit("automatic").as("decision"),
          sql<string[]>`array['gardener_entry']::text[]`.as("reason_codes"),
        ])
        .where("snapshot.source_slug", "=", GARDENER_SOURCE_SLUG)
        .orderBy("snapshot.created_at", "asc")
        .limit(1),
    )
    .returning("id")
    .executeTakeFirst();
  if (!assertion) {
    throw new Error(
      "The gardeners' source snapshot is missing (migration 0086).",
    );
  }

  const id = randomUUID();
  await trx
    .insertInto("catalog_items")
    .values({
      id,
      canonical_name: input.name,
      normalized_name: sql<string>`catalog_normalize_name(${input.name})`,
      source: GARDENER_ENTRY_SOURCE,
      source_id: id,
      locale: input.locale,
      node_kind: nodeKind,
      rank: nodeKind,
      kingdom: input.species.kingdom,
      identity_state: "active",
      created_by_user_id: input.userId,
      reviewed_at: null,
    })
    .execute();
  await trx
    .insertInto("catalog_item_names")
    .values({
      catalog_item_id: id,
      display_name: input.name,
      normalized_name: sql<string>`catalog_normalize_name(${input.name})`,
      locale: input.locale,
      script: /\p{Script=Cyrillic}/u.test(input.name) ? "cyrillic" : "latin",
      is_primary: true,
      name_type: "denomination",
      assertion_id: assertion.id,
      weight: 1,
    })
    .execute();
  await trx
    .insertInto("catalog_item_relations")
    .values({
      from_catalog_item_id: id,
      to_catalog_item_id: input.species.id,
      relation_type: "form_of",
      host_class: null,
      assertion_id: assertion.id,
    })
    .execute();
  await assignCatalogSlug(
    {
      catalogItemId: id,
      nodeKind,
      base: formSlugBase(input.name, input.locale, nodeKind),
    },
    trx,
  );
  return { id, canonicalName: input.name, created: true };
}

const FORM_RESERVED_WORDS = new Set(
  ADDRESS_MANIFEST.find((entry) => entry.namespace === "form")?.reservedWords ??
    [],
);

/**
 * The name romanized in the gardener's language, as a register's
 * denomination is (`formSlugFromDenomination`, which knows no Russian). A
 * word the form namespace reserves (`register`, the species' register hub)
 * is never an address on its own.
 */
function formSlugBase(
  name: string,
  locale: InterfaceLocale,
  nodeKind: SpeciesFormNodeKind,
): string {
  const base = slugify(name, {
    script: "latin",
    language: locale,
    fallback: nodeKind === "breed" ? "breed" : "variety",
  });
  return FORM_RESERVED_WORDS.has(base) ? `${base}-${nodeKind}` : base;
}
