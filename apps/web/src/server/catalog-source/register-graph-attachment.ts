import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, JsonValue } from "@/db/schema";
import {
  formSlugFromDenomination,
  resolveSlugCollision,
} from "@/lib/catalog/slugs";

/**
 * Attach every registered cultivar and breed to its species (OVE-395,
 * ADR-0026 D1, D7, D8, D13).
 *
 * The three register importers already write what a register says: a row in
 * the source layer, a catalog item, its names and a source link. What none of
 * them writes is the one fact a gardener sees — that this denomination is a
 * form *of* something. Without it a species card lists no forms, a cultivar has
 * no hierarchical address, and the picker cannot prefer what is registered in
 * the reader's market.
 *
 * This is one pass, not three. All three registers answer the same three
 * questions in different words — which species, under which denomination,
 * registered where and when — so the differences live in one adapter per
 * register and everything after it is shared. It reads the source record
 * rather than the importer's in-memory definition, which means it also repairs
 * rows that landed before this existed, in production, without re-importing
 * anything.
 *
 * A form attaches through a `form_of` relation and never as a tree branch
 * (D1): `catalog_item_relations_enforce_kinds` refuses a cultivar-to-cultivar
 * or taxon-to-taxon `form_of`, and the card reads a form's species from that
 * relation. A species this pass cannot resolve leaves the cultivar working and
 * unattached with a `source_link` item in the owner's queue, because curation
 * never blocks a gardener (D5).
 */

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const UA_STATE_REGISTER_SLUG = "ua-state-register";
export const EU_COMMON_CATALOGUE_SLUG = "eu-oj-eur-lex-common-catalogue";
export const VERTEBRATE_BREED_SLUG = "vertebrate-breed-ontology";
export const UA_BEE_BREED_SLUG = "ua-bee-breeds";

export const REGISTER_SOURCE_SLUGS = [
  UA_STATE_REGISTER_SLUG,
  EU_COMMON_CATALOGUE_SLUG,
  VERTEBRATE_BREED_SLUG,
  UA_BEE_BREED_SLUG,
] as const;

export type RegisterSourceSlug = (typeof REGISTER_SOURCE_SLUGS)[number];

/** The identifier scheme each register writes, from the closed set of 0054. */
const IDENTIFIER_SCHEME_BY_SOURCE: Record<RegisterSourceSlug, string> = {
  [UA_STATE_REGISTER_SLUG]: "ua_register",
  [EU_COMMON_CATALOGUE_SLUG]: "eu_common_catalogue",
  [VERTEBRATE_BREED_SLUG]: "vbo",
  [UA_BEE_BREED_SLUG]: "vbo",
};

/** How many rows one pass reads at a time. */
const ATTACH_BATCH_ROWS = 500;

/**
 * The scientific name behind a breed ontology's species group.
 *
 * The vertebrate breed ontology groups breeds under an English husbandry word,
 * not a binomial: "Cattle", not "Bos taurus". A checklist has never heard of
 * "Cattle", so without this every breed would wait in the queue for a curator
 * to type a name that is not in dispute. Only groups whose species is
 * unambiguous are here; anything else is left to a curator on purpose.
 */
const SPECIES_BY_BREED_GROUP: Record<string, string> = {
  cattle: "Bos taurus",
  "dairy cattle": "Bos taurus",
  "beef cattle": "Bos taurus",
  chicken: "Gallus gallus",
  goat: "Capra hircus",
  sheep: "Ovis aries",
  pig: "Sus scrofa",
  swine: "Sus scrofa",
  horse: "Equus caballus",
  rabbit: "Oryctolagus cuniculus",
  duck: "Anas platyrhynchos",
  goose: "Anser anser",
  turkey: "Meleagris gallopavo",
  "honey bee": "Apis mellifera",
  quail: "Coturnix japonica",
};

/** A breed group's species, when the group is a husbandry word. */
export function speciesOfBreedGroup(group: string): string {
  return SPECIES_BY_BREED_GROUP[group.trim().toLowerCase()] ?? group.trim();
}

/**
 * What a register row says, once its own words are behind us.
 *
 * `speciesText` is whatever names the species: a Latin binomial with
 * authorship, a crop line with a common name after a dash, or a breed's
 * species group. `denomination` is the registered name, which is also the slug
 * (D8). `regionCode` is the market the registration is in, which is what the
 * picker's boost reads through `registered_ua` and `registered_eu` (D7).
 */
export interface RegisterFormClaim {
  speciesText: string | null;
  denomination: string | null;
  regionCode: string | null;
  year: string | null;
  status: "registered" | "withdrawn";
  qualifiers: Record<string, string>;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "NULL") return null;
  return trimmed;
}

function objectAt(
  payload: unknown,
  ...path: string[]
): Record<string, unknown> | null {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return null;
    current = (current as Record<string, unknown>)[key];
  }
  if (!current || typeof current !== "object" || Array.isArray(current))
    return null;
  return current as Record<string, unknown>;
}

/**
 * The Latin half of a crop line.
 *
 * The EU Official Journal writes "Beta vulgaris L. - Sugar beet": a scientific
 * name, a dash, and an English common name. Matching the whole line against a
 * checklist finds nothing, and matching the English half finds the wrong
 * things, so the Latin half is what a species lookup is given.
 */
export function scientificHalfOfCropLine(value: string): string {
  const [head] = value.split(/\s+[-–—]\s+/u);
  return (head ?? value).trim();
}

/** ISO 3166-1 alpha-2, or null when the register names no market. */
function regionCodeOf(value: unknown): string | null {
  const code = text(value);
  if (!code) return null;
  const upper = code.toUpperCase();
  return /^[A-Z]{2}$/u.test(upper) ? upper : null;
}

/** The year in a date or a bare year, as four digits. */
export function registrationYear(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const match = /(\d{4})/u.exec(raw);
  return match?.[1] ?? null;
}

/**
 * One register row, read as a claim. One adapter per register, and nothing
 * downstream needs to know which one it came from.
 */
export function readRegisterClaim(
  sourceSlug: RegisterSourceSlug,
  rawPayload: unknown,
  allowedProjection: unknown,
): RegisterFormClaim {
  if (sourceSlug === UA_STATE_REGISTER_SLUG) {
    const row = objectAt(rawPayload, "row") ?? {};
    const normalized = objectAt(rawPayload, "normalizedRow") ?? row;
    const qualifiers: Record<string, string> = {
      register: "ua_state_register",
    };
    const zone = text(normalized.proposedZone ?? row.proposedZone);
    if (zone) qualifiers.zone = zone;
    const applicant = text(
      normalized.countryCodeApplicant ?? row["сountryCodeApplicant"],
    );
    if (applicant) qualifiers.applicant_country = applicant;
    return {
      speciesText: text(normalized.taxonNameLat ?? row.taxonNameLat),
      denomination: text(normalized.varietyName ?? row.varietyName),
      regionCode: "UA",
      year: registrationYear(
        normalized.startDateRegistration ?? row.startDateRegistration,
      ),
      status: "registered",
      qualifiers,
    };
  }

  if (sourceSlug === EU_COMMON_CATALOGUE_SLUG) {
    const row = objectAt(rawPayload, "row") ?? {};
    const action = text(row.admissionAction)?.toLowerCase() ?? "";
    const qualifiers: Record<string, string> = {
      register: "eu_common_catalogue",
    };
    const notifier = text(row.notifierCode);
    if (notifier) qualifiers.notifier = notifier;
    const supplement = text(row.supplementLabel);
    if (supplement) qualifiers.supplement = supplement;
    if (action) qualifiers.admission_action = action;
    const species = text(row.speciesOrCrop);
    return {
      speciesText: species ? scientificHalfOfCropLine(species) : null,
      denomination: text(row.varietyDenomination),
      // The notifying member state is the market the row is about; the
      // catalogue as a whole is the Union, so a row without one says `EU`.
      regionCode: regionCodeOf(row.countryCode) ?? "EU",
      year: registrationYear(row.publicationDate),
      // A deletion is still a registration fact: the row records that the
      // variety was in the catalogue and is not any more. Nothing is deleted.
      status:
        action === "delete" || action === "withdraw" || action === "withdrawn"
          ? "withdrawn"
          : "registered",
      qualifiers,
    };
  }

  const projection = objectAt(allowedProjection) ?? {};
  const row = objectAt(rawPayload, "row") ?? objectAt(rawPayload) ?? {};
  const group = text(projection.speciesGroup ?? row.speciesGroup);
  return {
    speciesText: group ? speciesOfBreedGroup(group) : null,
    denomination: text(projection.canonicalName ?? row.breedName ?? row.name),
    regionCode: sourceSlug === UA_BEE_BREED_SLUG ? "UA" : null,
    year: registrationYear(row.year ?? projection.year),
    status: "registered",
    qualifiers: { register: sourceSlug.replace(/-/gu, "_") },
  };
}

// ----------------------------------------------------------------------
// The graph
// ----------------------------------------------------------------------

/** Register forms that are not yet attached to a species. */
export function buildUnattachedRegisterFormsQuery(
  executor: QueryExecutor,
  input: {
    sourceSlug: RegisterSourceSlug;
    limit: number;
    /**
     * Page forward from the last form read, so one run reads each one once.
     *
     * The primary key, not the timestamp. Postgres stores `created_at` with
     * microsecond precision and the driver binds a JavaScript Date with
     * millisecond precision, so a `(created_at, id)` cursor compares against a
     * value a few hundred microseconds in the past and hands back the same
     * rows for ever. A uuid has no such rounding.
     */
    afterId?: string | null;
  },
) {
  return (
    executor
      .selectFrom("catalog_source_links as link")
      .innerJoin(
        "catalog_source_records as record",
        "record.id",
        "link.source_record_id",
      )
      .innerJoin(
        "catalog_source_snapshots as snapshot",
        "snapshot.id",
        "record.source_snapshot_id",
      )
      .innerJoin("catalog_items as item", "item.id", "link.catalog_item_id")
      .select([
        "item.id as catalogItemId",
        "item.canonical_name as canonicalName",
        "item.node_kind as nodeKind",
        "item.public_slug as publicSlug",
        "item.locale as locale",
        "record.id as sourceRecordId",
        "record.source_record_id as sourceRecordKey",
        "record.raw_payload as rawPayload",
        "record.allowed_projection as allowedProjection",
        "snapshot.id as sourceSnapshotId",
        "snapshot.source_slug as sourceSlug",
      ])
      .where("snapshot.source_slug", "=", input.sourceSlug)
      .where("link.projection_kind", "=", "canonical_item")
      .where("item.identity_state", "=", "active")
      .where("item.merged_into_catalog_item_id", "is", null)
      .where("item.node_kind", "in", ["cultivar", "breed"])
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("catalog_item_relations as relation")
              .select("relation.id")
              .whereRef("relation.from_catalog_item_id", "=", "item.id")
              .where("relation.relation_type", "=", "form_of"),
          ),
        ),
      )
      // A form waiting in the queue *is* read again. The species it needs is
      // usually created by another row of the same register a moment later,
      // and a rule that skipped queued forms would leave them waiting for a
      // curator to decide something the next run decides by itself. Attaching
      // one closes its queue item, so a form is never both.
      .$if(Boolean(input.afterId), (query) =>
        query.where("item.id", ">", input.afterId as string),
      )
      .orderBy("item.id")
      .limit(input.limit)
  );
}

/**
 * The binomial inside a scientific name, without its authorship.
 *
 * A register writes "Prunus armeniaca L."; a checklist stores the canonical
 * name and the scientific name separately, and only the second carries the
 * author. Taking the first two tokens when the second is lower case is the
 * shape of every binomial and of nothing else here: "Cattle" stays one token,
 * "Beta vulgaris L." loses only the author. It is a heuristic, and it is safe
 * because what it produces is only ever compared for exact equality.
 */
export function canonicalNameOf(scientificName: string): string {
  const tokens = scientificName.split(/\s+/u).filter(Boolean);
  if (tokens.length < 2) return scientificName.trim();
  const [genus, epithet] = tokens as [string, string];
  if (!/^[a-z][a-z-]*$/u.test(epithet)) return genus;
  return `${genus} ${epithet}`;
}

/**
 * The species a register row names.
 *
 * Three ways in, in the order that is safest to be wrong about: the scientific
 * name a node already carries, the same name in the Catalogue of Life
 * checklist (which builds the node and its whole classification), and finally
 * a vernacular a node is known by in the register's own language. Two matches
 * are not a match: a homonym is a decision, not a coin toss.
 *
 * Both checklist comparisons are exact, and both are written so an index can
 * serve them: the scientific name through its own btree, and the canonical
 * name through the prefix index, whose `text_pattern_ops` class answers `like`
 * but not `=`. A wildcard-free `like` is that equality.
 */
export async function resolveSpeciesNode(
  executor: QueryExecutor,
  input: { speciesText: string; assertionId: string; locale: string },
): Promise<{ catalogItemId: string; rule: string } | { ambiguous: string[] }> {
  // A register writes the name with its author; a node carries the canonical
  // name and, usually, the authored one as well. Both spellings are offered so
  // "Solanum lycopersicum L." finds the node called "Solanum lycopersicum".
  const spellings = [
    ...new Set([input.speciesText, canonicalNameOf(input.speciesText)]),
  ];
  const candidates = await executor
    .selectFrom("catalog_items as item")
    .select(["item.id as id"])
    .where("item.node_kind", "=", "taxon")
    .where("item.identity_state", "=", "active")
    .where("item.merged_into_catalog_item_id", "is", null)
    .where(({ eb, or, selectFrom, exists }) =>
      or([
        eb(
          "item.normalized_name",
          "in",
          spellings.map(
            (spelling) => sql<string>`catalog_normalize_name(${spelling})`,
          ),
        ),
        exists(
          selectFrom("catalog_item_names as name")
            .select("name.id")
            .whereRef("name.catalog_item_id", "=", "item.id")
            .where("name.name_type", "in", [
              "scientific_accepted",
              "scientific_synonym",
            ])
            .where(
              "name.normalized_name",
              "in",
              spellings.map(
                (spelling) => sql<string>`catalog_normalize_name(${spelling})`,
              ),
            ),
        ),
      ]),
    )
    .limit(3)
    .execute();
  if (candidates.length === 1) {
    return { catalogItemId: candidates[0]!.id, rule: "scientific_name" };
  }
  if (candidates.length > 1) {
    return { ambiguous: candidates.map((row) => row.id) };
  }

  // Two lookups, never one with an `or`: each is a different index, and an
  // `or` across them plans as a sequential scan of the whole checklist.
  const scientific = await executor
    .selectFrom("catalog_source_col_usages as usage")
    .select(["usage.col_id as colId"])
    .where(
      "usage.source_snapshot_id",
      "=",
      sql<string>`catalog_col_current_snapshot()`,
    )
    .where("usage.status", "=", "accepted")
    .where(
      "usage.normalized_scientific_name",
      "=",
      sql<string>`catalog_normalize_name(${input.speciesText})`,
    )
    .limit(3)
    .execute();
  const usages =
    scientific.length > 0
      ? scientific
      : await executor
          .selectFrom("catalog_source_col_usages as usage")
          .select(["usage.col_id as colId"])
          .where(
            "usage.source_snapshot_id",
            "=",
            sql<string>`catalog_col_current_snapshot()`,
          )
          .where("usage.status", "=", "accepted")
          .where(
            "usage.normalized_name",
            "like",
            sql<string>`catalog_normalize_name(${canonicalNameOf(input.speciesText)})`,
          )
          .limit(3)
          .execute();
  if (usages.length === 1) {
    // Two statements, not one: `catalog_col_ensure_node` inserts rows the
    // calling statement's snapshot cannot see, so its result is read back.
    const ensured = await sql<{ id: string }>`
      select catalog_col_ensure_node(${usages[0]!.colId}, ${input.assertionId}::uuid)::text as id
    `.execute(executor);
    const id = ensured.rows[0]?.id;
    if (id) return { catalogItemId: id, rule: "col_usage" };
  }
  if (usages.length > 1) {
    return { ambiguous: [] };
  }

  const vernaculars = await executor
    .selectFrom("catalog_item_names as name")
    .innerJoin("catalog_items as item", "item.id", "name.catalog_item_id")
    .select(["item.id as id"])
    .where("item.node_kind", "=", "taxon")
    .where("item.identity_state", "=", "active")
    .where("item.merged_into_catalog_item_id", "is", null)
    .where("name.name_type", "=", "vernacular")
    .where("name.locale", "=", input.locale)
    .where(
      "name.normalized_name",
      "=",
      sql<string>`catalog_normalize_name(${input.speciesText})`,
    )
    .limit(3)
    .execute();
  if (vernaculars.length === 1) {
    return { catalogItemId: vernaculars[0]!.id, rule: "vernacular_name" };
  }
  return { ambiguous: vernaculars.map((row) => row.id) };
}

export interface RegisterAttachmentSummary {
  sourceSlug: RegisterSourceSlug;
  formsRead: number;
  attached: number;
  attachedByScientificName: number;
  attachedByColUsage: number;
  attachedByVernacular: number;
  denominationsWritten: number;
  identifiersWritten: number;
  registrationFactsWritten: number;
  slugsAssigned: number;
  queuedForCuration: number;
  /** Queue items a later run answered by attaching the form after all. */
  queueItemsClosed: number;
  durationMs: number;
}

/**
 * Close queue items for forms that are attached after all.
 *
 * A form queued by one run and attached by a later one would otherwise ask the
 * owner to decide something already decided. Repairing it here rather than only
 * at the moment of attachment also covers rows written before this existed.
 */
export async function closeAnsweredRegisterQueueItems(
  input: { sourceSlug: RegisterSourceSlug },
  executor: Kysely<Database> = db,
): Promise<number> {
  const closed = await sql<{ id: string }>`
    update catalog_curation_queue as queued
       set state = 'auto_applied', decided_at = now()
     where queued.item_type = 'source_link'
       and queued.state = 'open'
       and queued.subject_catalog_item_id in (
         select link.catalog_item_id
         from catalog_source_links as link
         join catalog_source_records as record on record.id = link.source_record_id
         join catalog_source_snapshots as snapshot
           on snapshot.id = record.source_snapshot_id
         where snapshot.source_slug = ${input.sourceSlug}
           and link.projection_kind = 'canonical_item'
       )
       and exists (
         select 1 from catalog_item_relations as relation
         where relation.from_catalog_item_id = queued.subject_catalog_item_id
           and relation.relation_type = 'form_of'
       )
    returning queued.id::text as id
  `.execute(executor);
  return closed.rows.length;
}

/**
 * The invariant the task is judged on: every register form has exactly one
 * `form_of` relation or exactly one open queue item, never both and never
 * neither.
 *
 * Counting it is the only way to know. A pass that attaches 9,056 of 11,940
 * forms says nothing about the other 2,884 unless something asks where they
 * went, and a form that is both attached and queued is a curator being asked
 * to decide something already decided.
 */
export async function readRegisterAttachmentInvariant(
  input: { sourceSlug: RegisterSourceSlug },
  executor: Kysely<Database> = db,
): Promise<{
  forms: number;
  attached: number;
  queued: number;
  bothAttachedAndQueued: number;
  neither: number;
}> {
  const row = await sql<{
    forms: number;
    attached: number;
    queued: number;
    both: number;
    neither: number;
  }>`
    with forms as (
      select item.id,
             exists (
               select 1 from catalog_item_relations as relation
               where relation.from_catalog_item_id = item.id
                 and relation.relation_type = 'form_of'
             ) as attached,
             exists (
               -- Only an open item is waiting. One this pass answered by
               -- attaching the form later is auto_applied, which is a
               -- decision, not a question still on the owner's desk.
               select 1 from catalog_curation_queue as queued
               where queued.subject_catalog_item_id = item.id
                 and queued.item_type = 'source_link'
                 and queued.state = 'open'
             ) as queued
      from catalog_source_links as link
      join catalog_source_records as record on record.id = link.source_record_id
      join catalog_source_snapshots as snapshot
        on snapshot.id = record.source_snapshot_id
      join catalog_items as item on item.id = link.catalog_item_id
      where snapshot.source_slug = ${input.sourceSlug}
        and link.projection_kind = 'canonical_item'
        and item.identity_state = 'active'
        and item.merged_into_catalog_item_id is null
        and item.node_kind in ('cultivar', 'breed')
    )
    select count(*)::int as forms,
           count(*) filter (where attached)::int as attached,
           count(*) filter (where queued)::int as queued,
           count(*) filter (where attached and queued)::int as both,
           count(*) filter (where not attached and not queued)::int as neither
    from forms
  `.execute(executor);
  const counts = row.rows[0];
  return {
    forms: counts?.forms ?? 0,
    attached: counts?.attached ?? 0,
    queued: counts?.queued ?? 0,
    bothAttachedAndQueued: counts?.both ?? 0,
    neither: counts?.neither ?? 0,
  };
}

/**
 * Attach one register's forms, in bounded batches.
 *
 * Each form is its own transaction, so a run interrupted halfway leaves whole
 * cultivars behind it and the next run finishes the rest. Everything written
 * is idempotent: the relation, the identifier and the name conflict away, and
 * a registration fact is replaced rather than repeated.
 */
export async function attachRegisterFormsToSpecies(
  input: { sourceSlug: RegisterSourceSlug; limit?: number },
  executor: Kysely<Database> = db,
): Promise<RegisterAttachmentSummary> {
  const startedAt = Date.now();
  const summary: RegisterAttachmentSummary = {
    sourceSlug: input.sourceSlug,
    formsRead: 0,
    attached: 0,
    attachedByScientificName: 0,
    attachedByColUsage: 0,
    attachedByVernacular: 0,
    denominationsWritten: 0,
    identifiersWritten: 0,
    registrationFactsWritten: 0,
    slugsAssigned: 0,
    queuedForCuration: 0,
    queueItemsClosed: 0,
    durationMs: 0,
  };
  const limit = input.limit ?? 100_000;
  // 15,177 Ukrainian register rows name a few hundred species between them, so
  // the ladder runs once per species and not once per row. The memo lives for
  // one run: a node another run creates is found by the query next time.
  const speciesMemo = new Map<
    string,
    { catalogItemId: string; rule: string } | { ambiguous: string[] }
  >();

  summary.queueItemsClosed += await closeAnsweredRegisterQueueItems(
    { sourceSlug: input.sourceSlug },
    executor,
  );

  // Paged by a cursor rather than by "the first N unattached". A form this run
  // cannot resolve stays unattached, so a limit-only query would hand back the
  // same residue for ever and the run would spin instead of finishing.
  let afterId: string | null = null;
  while (summary.formsRead < limit) {
    const batch: UnattachedForm[] = await buildUnattachedRegisterFormsQuery(
      executor,
      {
        sourceSlug: input.sourceSlug,
        limit: Math.min(ATTACH_BATCH_ROWS, limit - summary.formsRead),
        afterId,
      },
    ).execute();
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1]!.catalogItemId;

    for (const form of batch) {
      summary.formsRead += 1;
      await executor
        .transaction()
        .execute(async (trx) => attachOneForm(trx, form, summary, speciesMemo));
    }
  }

  summary.durationMs = Date.now() - startedAt;
  return summary;
}

type UnattachedForm = Awaited<
  ReturnType<ReturnType<typeof buildUnattachedRegisterFormsQuery>["execute"]>
>[number];

async function attachOneForm(
  trx: Transaction<Database>,
  form: UnattachedForm,
  summary: RegisterAttachmentSummary,
  speciesMemo: Map<
    string,
    { catalogItemId: string; rule: string } | { ambiguous: string[] }
  >,
): Promise<void> {
  const sourceSlug = form.sourceSlug as RegisterSourceSlug;
  const claim = readRegisterClaim(
    sourceSlug,
    form.rawPayload,
    form.allowedProjection,
  );
  const assertion = await trx
    .insertInto("catalog_source_assertions")
    .values({
      source_slug: sourceSlug,
      source_snapshot_id: form.sourceSnapshotId,
      source_record_id: form.sourceRecordId,
      rights_class: "source_public",
      confidence: 1,
      decision: "automatic",
      reason_codes: ["register_form_attachment"],
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const memoKey = claim.speciesText
    ? `${form.locale}::${claim.speciesText.toLowerCase()}`
    : null;
  const memoized = memoKey ? speciesMemo.get(memoKey) : undefined;
  const resolved =
    memoized ??
    (claim.speciesText
      ? await resolveSpeciesNode(trx, {
          speciesText: claim.speciesText,
          assertionId: assertion.id,
          locale: form.locale,
        })
      : { ambiguous: [] as string[] });
  if (memoKey && !memoized) speciesMemo.set(memoKey, resolved);

  if (!("catalogItemId" in resolved)) {
    const queued = await queueUnresolvedSpecies(
      trx,
      form,
      claim,
      resolved.ambiguous,
    );
    if (queued) summary.queuedForCuration += 1;
    return;
  }

  await trx
    .insertInto("catalog_item_relations")
    .values({
      from_catalog_item_id: form.catalogItemId,
      to_catalog_item_id: resolved.catalogItemId,
      relation_type: "form_of",
      host_class: null,
      assertion_id: assertion.id,
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();
  summary.attached += 1;
  // The queue asked a curator a question this run has now answered.
  const closed = await trx
    .updateTable("catalog_curation_queue")
    .set({ state: "auto_applied", decided_at: sql<Date>`now()` })
    .where("subject_catalog_item_id", "=", form.catalogItemId)
    .where("item_type", "=", "source_link")
    .where("state", "=", "open")
    .returning("id")
    .execute();
  summary.queueItemsClosed += closed.length;
  if (resolved.rule === "scientific_name")
    summary.attachedByScientificName += 1;
  if (resolved.rule === "col_usage") summary.attachedByColUsage += 1;
  if (resolved.rule === "vernacular_name") summary.attachedByVernacular += 1;

  const denomination = claim.denomination ?? form.canonicalName;
  const denominationWritten = await trx
    .insertInto("catalog_item_names")
    .values({
      catalog_item_id: form.catalogItemId,
      display_name: denomination.slice(0, 120),
      normalized_name: sql<string>`catalog_normalize_name(${denomination.slice(0, 120)})`,
      locale: form.locale,
      script:
        form.locale === "uk" || form.locale === "bg" ? "cyrillic" : "latin",
      is_primary: false,
      name_type: "denomination",
      assertion_id: assertion.id,
      weight: 4,
    })
    .onConflict((conflict) => conflict.doNothing())
    .returning("id")
    .executeTakeFirst();
  if (denominationWritten) summary.denominationsWritten += 1;

  const identifierWritten = await trx
    .insertInto("catalog_item_identifiers")
    .values({
      catalog_item_id: form.catalogItemId,
      scheme: IDENTIFIER_SCHEME_BY_SOURCE[sourceSlug],
      value: form.sourceRecordKey,
      assertion_id: assertion.id,
    })
    .onConflict((conflict) => conflict.columns(["scheme", "value"]).doNothing())
    .returning("id")
    .executeTakeFirst();
  if (identifierWritten) summary.identifiersWritten += 1;

  // This register's answer replaces this register's previous answer: a variety
  // withdrawn from the catalogue must not keep a `registered` row beside the
  // `withdrawn` one. Another register's fact is untouched.
  await sql`
    delete from catalog_item_facts as fact
    using catalog_source_assertions as assertion
    where fact.assertion_id = assertion.id
      and fact.catalog_item_id = ${form.catalogItemId}::uuid
      and fact.predicate = 'registration_status'
      and assertion.source_slug = ${sourceSlug}
  `.execute(trx);
  const fact = await trx
    .insertInto("catalog_item_facts")
    .values({
      catalog_item_id: form.catalogItemId,
      predicate: "registration_status",
      region_code: claim.regionCode,
      value: claim.status,
      value_normalized: claim.status,
      qualifiers: sql<JsonValue>`${JSON.stringify({
        ...claim.qualifiers,
        ...(claim.year ? { year: claim.year } : {}),
      })}::jsonb`,
      assertion_id: assertion.id,
    })
    .returning("id")
    .executeTakeFirst();
  if (fact) summary.registrationFactsWritten += 1;

  if (!form.publicSlug) {
    const assigned = await assignFormSlug(
      trx,
      form.catalogItemId,
      denomination,
      form.locale,
    );
    if (assigned) summary.slugsAssigned += 1;
  }
}

/** The registered denomination, romanized, first free in the form namespace (D8). */
async function assignFormSlug(
  trx: Transaction<Database>,
  catalogItemId: string,
  denomination: string,
  locale: string,
): Promise<boolean> {
  const language = locale === "bg" ? "bg" : locale === "uk" ? "uk" : "latin";
  const base = formSlugFromDenomination(denomination, language);
  if (!base) return false;
  const taken = await trx
    .selectFrom("catalog_item_slug_history")
    .select("slug")
    .where("namespace", "=", "form")
    .where(({ eb, or }) =>
      or([eb("slug", "=", base), eb("slug", "like", `${base}-%`)]),
    )
    .execute();
  const slug = resolveSlugCollision(
    "form",
    base,
    new Set(taken.map((row) => row.slug)),
  );
  await trx
    .updateTable("catalog_items")
    .set({ public_slug: slug })
    .where("id", "=", catalogItemId)
    .where("public_slug", "is", null)
    .execute();
  await trx
    .insertInto("catalog_item_slug_history")
    .values({ namespace: "form", slug, catalog_item_id: catalogItemId })
    .onConflict((conflict) =>
      conflict.columns(["namespace", "slug"]).doNothing(),
    )
    .execute();
  return true;
}

async function queueUnresolvedSpecies(
  trx: Transaction<Database>,
  form: UnattachedForm,
  claim: RegisterFormClaim,
  ambiguous: readonly string[],
): Promise<boolean> {
  const proposal = {
    source_slug: form.sourceSlug,
    source_record_id: form.sourceRecordId,
    source_record_key: form.sourceRecordKey,
    species_text: claim.speciesText,
    denomination: claim.denomination,
    candidates: [...ambiguous],
  };
  const row = await sql<{ id: string }>`
    insert into catalog_curation_queue (
      item_type, subject_catalog_item_id, subject_label, proposal, confidence,
      reasons, impact_score, state
    )
    select 'source_link', ${form.catalogItemId}::uuid, ${(claim.denomination ?? form.canonicalName).slice(0, 200)},
           ${JSON.stringify(proposal)}::jsonb, ${ambiguous.length > 0 ? 0.5 : 0.2},
           ${ambiguous.length > 0 ? ["register_species_ambiguous"] : ["register_species_unmatched"]}::text[],
           1, 'open'
    where not exists (
      select 1 from catalog_curation_queue as open_item
      where open_item.item_type = 'source_link'
        and open_item.state in ('open', 'auto_applied', 'accepted')
        and open_item.subject_catalog_item_id = ${form.catalogItemId}::uuid
    )
    returning id::text as id
  `.execute(trx);
  return row.rows.length > 0;
}
