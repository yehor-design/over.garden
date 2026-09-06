import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import type { CatalogKind, Database } from "@/db/schema";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import { getLocalizedCoarseRegionLabel } from "@/lib/garden/regions";
import type { PublicLocale } from "@/lib/public-localization";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * The organism card's structured facts (ADR-0026 D9), read in one statement
 * over `catalog_items`, `catalog_item_names`, `catalog_item_relations`,
 * `catalog_item_facts`, `catalog_item_identifiers`,
 * `catalog_source_assertions` and `catalog_source_snapshots`. Only public
 * assertions reach the card: rights class `source_public`, decision
 * `automatic` or `curator_accepted`. A name row without an assertion (the
 * legacy importers) is shown under the card's own source.
 */
export interface PublicOrganismCardRow {
  firstHandContentAt: Date | string | null;
  indexableOverride: boolean | null;
  forms: PublicOrganismRelatedRow[];
  pests: PublicOrganismRelatedRow[];
  hosts: PublicOrganismRelatedRow[];
  names: PublicOrganismNameRow[];
  facts: PublicOrganismFactRow[];
  identifiers: PublicOrganismIdentifierRow[];
  sources: PublicOrganismSourceRow[];
}

export interface PublicOrganismRelatedRow {
  catalogItemId: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  publicSlug: string;
  speciesSlug: string | null;
  hostClass: string | null;
}

export interface PublicOrganismNameRow {
  displayName: string;
  nameType: string;
  locale: string;
  authorship: string | null;
  isPrimary: boolean;
  sourceSlug: string | null;
  sourceName: string | null;
  sourceVersion: string | null;
  observedAt: string | null;
}

export interface PublicOrganismFactRow {
  predicate: string;
  regionCode: string | null;
  value: string;
  valueNormalized: string | null;
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  observedAt: string;
}

export interface PublicOrganismIdentifierRow {
  scheme: string;
  value: string;
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  observedAt: string;
}

export interface PublicOrganismSourceRow {
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  fetchedAt: string;
  lastObservedAt: string;
}

export interface PublicOrganismExperienceRow {
  regionCode: string | null;
  objectCount: number;
  gardenerCount: number;
  totalGardeners: number;
}

const PUBLIC_ASSERTION = sql`assertion.rights_class = 'source_public' and assertion.decision in ('automatic', 'curator_accepted')`;

function selectableStatuses() {
  return sql.join(SELECTABLE_CATALOG_STATUSES.map((status) => sql`${status}`));
}

/** A related node the card may link to: active, selectable, global, addressed. */
function publicNode(alias: string) {
  const node = sql.raw(alias);
  return sql`${node}.identity_state = 'active' and ${node}.created_by_user_id is null and ${node}.public_slug is not null and ${node}.status in (${selectableStatuses()})`;
}

function speciesSlugOf(alias: string) {
  const node = sql.raw(alias);
  return sql`(
    select parent.public_slug
    from catalog_item_relations as form_relation
    join catalog_items as parent on parent.id = form_relation.to_catalog_item_id
    where form_relation.from_catalog_item_id = ${node}.id
      and form_relation.relation_type = 'form_of'
      and parent.node_kind = 'taxon'
      and parent.identity_state = 'active'
      and parent.public_slug is not null
    order by form_relation.created_at, form_relation.id
    limit 1
  )`;
}

function relatedJson(alias: string, hostClass: boolean) {
  const node = sql.raw(alias);
  return sql`json_build_object(
    'catalogItemId', ${node}.id,
    'canonicalName', ${node}.canonical_name,
    'catalogKind', ${node}.catalog_kind,
    'publicSlug', ${node}.public_slug,
    'speciesSlug', ${speciesSlugOf(alias)},
    'hostClass', ${hostClass ? sql`relation.host_class` : sql`null`}
  )`;
}

export function buildPublicOrganismCardStatement(catalogItemId: string) {
  return sql<PublicOrganismCardRow>`
    select
      item.first_hand_content_at as "firstHandContentAt",
      item.indexable_override as "indexableOverride",
      coalesce((
        select json_agg(${relatedJson("form", false)} order by form.canonical_name, form.id)
        from catalog_item_relations as relation
        join catalog_items as form on form.id = relation.from_catalog_item_id
        join catalog_source_assertions as assertion on assertion.id = relation.assertion_id
        where relation.to_catalog_item_id = item.id
          and relation.relation_type = 'form_of'
          and ${publicNode("form")}
          and ${PUBLIC_ASSERTION}
      ), '[]'::json) as "forms",
      coalesce((
        select json_agg(${relatedJson("pest", true)} order by pest.canonical_name, pest.id)
        from catalog_item_relations as relation
        join catalog_items as pest on pest.id = relation.from_catalog_item_id
        join catalog_source_assertions as assertion on assertion.id = relation.assertion_id
        where relation.to_catalog_item_id = item.id
          and relation.relation_type = 'pest_of'
          and ${publicNode("pest")}
          and ${PUBLIC_ASSERTION}
      ), '[]'::json) as "pests",
      coalesce((
        select json_agg(${relatedJson("host", true)} order by host.canonical_name, host.id)
        from catalog_item_relations as relation
        join catalog_items as host on host.id = relation.to_catalog_item_id
        join catalog_source_assertions as assertion on assertion.id = relation.assertion_id
        where relation.from_catalog_item_id = item.id
          and relation.relation_type = 'pest_of'
          and ${publicNode("host")}
          and ${PUBLIC_ASSERTION}
      ), '[]'::json) as "hosts",
      coalesce((
        select json_agg(json_build_object(
          'displayName', name.display_name,
          'nameType', name.name_type,
          'locale', name.locale,
          'authorship', name.authorship,
          'isPrimary', name.is_primary,
          'sourceSlug', assertion.source_slug,
          'sourceName', snapshot.source_name,
          'sourceVersion', snapshot.source_version,
          'observedAt', assertion.observed_at
        ) order by name.name_type, name.locale, name.is_primary desc, name.display_name)
        from catalog_item_names as name
        left join catalog_source_assertions as assertion on assertion.id = name.assertion_id
        left join catalog_source_snapshots as snapshot on snapshot.id = assertion.source_snapshot_id
        where name.catalog_item_id = item.id
          and (name.assertion_id is null or (${PUBLIC_ASSERTION}))
      ), '[]'::json) as "names",
      coalesce((
        select json_agg(json_build_object(
          'predicate', fact.predicate,
          'regionCode', fact.region_code,
          'value', fact.value,
          'valueNormalized', fact.value_normalized,
          'sourceSlug', assertion.source_slug,
          'sourceName', snapshot.source_name,
          'sourceVersion', snapshot.source_version,
          'observedAt', assertion.observed_at
        ) order by fact.predicate, fact.region_code nulls first, fact.value)
        from catalog_item_facts as fact
        join catalog_source_assertions as assertion on assertion.id = fact.assertion_id
        join catalog_source_snapshots as snapshot on snapshot.id = assertion.source_snapshot_id
        where fact.catalog_item_id = item.id
          and ${PUBLIC_ASSERTION}
      ), '[]'::json) as "facts",
      coalesce((
        select json_agg(json_build_object(
          'scheme', identifier.scheme,
          'value', identifier.value,
          'sourceSlug', assertion.source_slug,
          'sourceName', snapshot.source_name,
          'sourceVersion', snapshot.source_version,
          'observedAt', assertion.observed_at
        ) order by identifier.scheme, identifier.value)
        from catalog_item_identifiers as identifier
        join catalog_source_assertions as assertion on assertion.id = identifier.assertion_id
        join catalog_source_snapshots as snapshot on snapshot.id = assertion.source_snapshot_id
        where identifier.catalog_item_id = item.id
          and ${PUBLIC_ASSERTION}
      ), '[]'::json) as "identifiers",
      coalesce((
        select json_agg(json_build_object(
          'sourceSlug', contributed.source_slug,
          'sourceName', contributed.source_name,
          'sourceVersion', contributed.source_version,
          'sourceUrl', contributed.source_url,
          'license', contributed.license,
          'licenseUrl', contributed.license_url,
          'attributionRequired', contributed.attribution_required,
          'attributionText', contributed.attribution_text,
          'fetchedAt', contributed.fetched_at,
          'lastObservedAt', contributed.last_observed_at
        ) order by contributed.source_name, contributed.source_version)
        from (
          select
            snapshot.source_slug, snapshot.source_name, snapshot.source_version,
            snapshot.source_url, snapshot.license, snapshot.license_url,
            snapshot.attribution_required, snapshot.attribution_text, snapshot.fetched_at,
            max(assertion.observed_at) as last_observed_at
          from catalog_source_assertions as assertion
          join catalog_source_snapshots as snapshot on snapshot.id = assertion.source_snapshot_id
          where ${PUBLIC_ASSERTION}
            and assertion.id in (
              select name.assertion_id from catalog_item_names as name
                where name.catalog_item_id = item.id and name.assertion_id is not null
              union
              select identifier.assertion_id from catalog_item_identifiers as identifier
                where identifier.catalog_item_id = item.id
              union
              select fact.assertion_id from catalog_item_facts as fact
                where fact.catalog_item_id = item.id
              union
              select relation.assertion_id from catalog_item_relations as relation
                where relation.to_catalog_item_id = item.id or relation.from_catalog_item_id = item.id
            )
          group by snapshot.id, snapshot.source_slug, snapshot.source_name, snapshot.source_version,
            snapshot.source_url, snapshot.license, snapshot.license_url,
            snapshot.attribution_required, snapshot.attribution_text, snapshot.fetched_at
        ) as contributed
      ), '[]'::json) as "sources"
    from catalog_items as item
    where item.id = ${catalogItemId}::uuid
  `;
}

/**
 * The gardener experience behind the card: distinct gardeners with public
 * entries on objects linked to the node or one of its forms, and their spread
 * by oblast. A region counts only when the object shows it (`region`
 * visibility on the object, or on its space when the object inherits).
 */
export function buildPublicOrganismExperienceStatement(catalogItemId: string) {
  return sql<PublicOrganismExperienceRow>`
    with linked as (
      select ${catalogItemId}::uuid as id
      union
      select relation.from_catalog_item_id
      from catalog_item_relations as relation
      where relation.to_catalog_item_id = ${catalogItemId}::uuid
        and relation.relation_type = 'form_of'
    ),
    visible as (
      select distinct
        journal_entries.owner_user_id,
        plant_objects.id as object_id,
        case
          when plant_objects.location_visibility = 'region' then coalesce(
            plant_objects.coarse_region_code,
            case when spaces.location_visibility = 'region' then spaces.coarse_region_code end
          )
        end as region_code
      from journal_entries
      join plant_objects on plant_objects.id = journal_entries.plant_object_id
      join spaces on spaces.id = journal_entries.space_id
      where plant_objects.catalog_item_id in (select id from linked)
        and plant_objects.variety_state = 'selected'
        and journal_entries.owner_user_id = plant_objects.owner_user_id
        and journal_entries.owner_user_id = spaces.owner_user_id
        and journal_entries.visibility = 'public'
        and journal_entries.lifecycle_state = 'active'
        and journal_entries.public_gone_at is null
        and journal_entries.public_slug is not null
        and ${publicLaunchSurfacePredicates()}
    )
    select
      region_code as "regionCode",
      count(distinct object_id)::int as "objectCount",
      count(distinct owner_user_id)::int as "gardenerCount",
      (select count(distinct owner_user_id)::int from visible) as "totalGardeners"
    from visible
    group by region_code
    order by count(distinct object_id) desc, region_code nulls last
  `;
}

export async function readPublicOrganismCardRow(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<PublicOrganismCardRow | null> {
  const result =
    await buildPublicOrganismCardStatement(catalogItemId).execute(executor);
  return result.rows[0] ?? null;
}

export async function readPublicOrganismExperienceRows(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<PublicOrganismExperienceRow[]> {
  const result =
    await buildPublicOrganismExperienceStatement(catalogItemId).execute(
      executor,
    );
  return result.rows;
}

/* ------------------------------------------------------------------------ */
/* Assembly: pure, so the card's shape is testable without a database.       */
/* ------------------------------------------------------------------------ */

export interface PublicOrganismRegion {
  code: string;
  label: string | null;
  objectCount: number;
  gardenerCount: number;
}

export interface PublicOrganismRelatedItem {
  catalogItemId: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  publicPath: string;
  hostClass: string | null;
}

export interface PublicOrganismAssertionLine {
  kind: "name" | "fact" | "identifier";
  label: string;
  value: string;
  qualifier: string | null;
  observedAt: string | null;
}

export interface PublicOrganismSourceGroup {
  sourceSlug: string | null;
  sourceName: string;
  sourceVersion: string | null;
  observedAt: string | null;
  lines: PublicOrganismAssertionLine[];
}

export interface PublicOrganismAcceptedNameClaim {
  sourceName: string;
  name: string;
}

export interface PublicOrganismSource {
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  fetchedAt: Date | string | null;
  lastObservedAt: Date | string | null;
}

/**
 * "Present in Ukraine", from EPPO, at country level only.
 *
 * ADR-0026 D11 lets country-level distribution status reach the product and
 * stops there: the source layer holds EPPO's sub-national units, and a card
 * never shows them. `verbatim` is the status EPPO wrote, kept beside the word
 * the product reasons about, so a badge can never be more certain than its
 * source.
 */
export interface PublicOrganismPresence {
  regionCode: string;
  status: "present" | "absent" | "transient" | "unknown";
  verbatim: string;
  sourceName: string;
  observedAt: string | null;
}

/** One licence's attribution line, with the day the data was downloaded. */
export interface PublicOrganismAttribution {
  sourceSlug: string;
  sourceName: string;
  text: string;
  downloadedAt: Date | string | null;
}

/** The countries a presence badge is shown for; the two OverGarden serves. */
export const PUBLIC_PRESENCE_REGION_CODES = ["UA", "BG"] as const;

export type PublicPresenceRegionCode =
  (typeof PUBLIC_PRESENCE_REGION_CODES)[number];

const PRESENCE_STATUSES = new Set([
  "present",
  "absent",
  "transient",
  "unknown",
]);

export interface PublicOrganismCard {
  firstHandContentAt: Date | string | null;
  indexableOverride: boolean | null;
  /** D9: the card is indexable once a gardener published on it or the owner said so. */
  hasFirstHandContent: boolean;
  formCount: number;
  gardenerCount: number;
  regions: PublicOrganismRegion[];
  forms: PublicOrganismRelatedItem[];
  pests: PublicOrganismRelatedItem[];
  hosts: PublicOrganismRelatedItem[];
  /** Names, identifiers and facts grouped by the source that asserted them. */
  sourceGroups: PublicOrganismSourceGroup[];
  /** Every distinct accepted scientific name and who says so; two or more is a disagreement shown neutrally (D2). */
  acceptedNameClaims: PublicOrganismAcceptedNameClaim[];
  /** Country-level presence for the two countries OverGarden serves (D11). */
  presence: PublicOrganismPresence[];
  /** Attribution the licence requires, with the download date (D11). */
  attributions: PublicOrganismAttribution[];
  sources: PublicOrganismSource[];
}

export function assemblePublicOrganismCard(input: {
  row: PublicOrganismCardRow | null;
  experience: readonly PublicOrganismExperienceRow[];
  locale: PublicLocale;
  /** The card's own source label for names that no assertion backs. */
  fallbackSource: { slug: string; name: string };
}): PublicOrganismCard {
  const row = input.row;
  const firstHandContentAt = row?.firstHandContentAt ?? null;
  const indexableOverride = row?.indexableOverride ?? null;
  const regions = input.experience
    .filter((entry) => entry.regionCode !== null)
    .map((entry) => ({
      code: entry.regionCode as string,
      label: getLocalizedCoarseRegionLabel(input.locale, entry.regionCode),
      objectCount: Number(entry.objectCount),
      gardenerCount: Number(entry.gardenerCount),
    }));
  const gardenerCount = Number(input.experience[0]?.totalGardeners ?? 0);
  const toRelated = (
    related: PublicOrganismRelatedRow,
  ): PublicOrganismRelatedItem => ({
    catalogItemId: related.catalogItemId,
    canonicalName: related.canonicalName,
    catalogKind: related.catalogKind,
    publicPath: publicCatalogEvidencePath({
      catalogKind: related.catalogKind,
      publicSlug: related.publicSlug,
      speciesSlug: related.speciesSlug,
    }),
    hostClass: related.hostClass,
  });

  const groups = new Map<string, PublicOrganismSourceGroup>();
  const groupFor = (source: {
    sourceSlug: string | null;
    sourceName: string | null;
    sourceVersion: string | null;
    observedAt: string | null;
  }) => {
    const slug = source.sourceSlug ?? input.fallbackSource.slug;
    const version = source.sourceSlug ? source.sourceVersion : null;
    const key = `${slug}:${version ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        sourceSlug: source.sourceSlug,
        sourceName: source.sourceName ?? input.fallbackSource.name,
        sourceVersion: version,
        observedAt: null,
        lines: [],
      };
      groups.set(key, group);
    }
    if (
      source.observedAt &&
      (!group.observedAt || source.observedAt > group.observedAt)
    ) {
      group.observedAt = source.observedAt;
    }
    return group;
  };
  for (const name of row?.names ?? []) {
    groupFor(name).lines.push({
      kind: "name",
      label: name.nameType,
      value: name.authorship
        ? `${name.displayName} ${name.authorship}`
        : name.displayName,
      qualifier: name.locale === "und" ? null : name.locale,
      observedAt: name.observedAt,
    });
  }
  for (const identifier of row?.identifiers ?? []) {
    groupFor(identifier).lines.push({
      kind: "identifier",
      label: identifier.scheme,
      value: identifier.value,
      qualifier: null,
      observedAt: identifier.observedAt,
    });
  }
  for (const fact of row?.facts ?? []) {
    groupFor(fact).lines.push({
      kind: "fact",
      label: fact.predicate,
      value: fact.valueNormalized ?? fact.value,
      qualifier: fact.regionCode,
      observedAt: fact.observedAt,
    });
  }

  // One badge per country, from the fact whose region is exactly that country.
  // A sub-national row (`UA-30`) is not a country row and never becomes one.
  const presence = new Map<string, PublicOrganismPresence>();
  for (const fact of row?.facts ?? []) {
    if (fact.predicate !== "distribution_status") continue;
    const regionCode = (fact.regionCode ?? "").trim().toUpperCase();
    if (
      !(PUBLIC_PRESENCE_REGION_CODES as readonly string[]).includes(regionCode)
    ) {
      continue;
    }
    const normalized = (fact.valueNormalized ?? "").trim().toLowerCase();
    const status = PRESENCE_STATUSES.has(normalized)
      ? (normalized as PublicOrganismPresence["status"])
      : "unknown";
    const existing = presence.get(regionCode);
    // Two sources for one country: the more recent observation wins, and a
    // definite word wins over "unknown" at the same moment.
    if (
      existing &&
      !(
        (fact.observedAt ?? "") > (existing.observedAt ?? "") ||
        (existing.status === "unknown" && status !== "unknown")
      )
    ) {
      continue;
    }
    presence.set(regionCode, {
      regionCode,
      status,
      verbatim: fact.value,
      sourceName: fact.sourceName ?? input.fallbackSource.name,
      observedAt: fact.observedAt ?? null,
    });
  }

  const acceptedNameClaims = new Map<string, PublicOrganismAcceptedNameClaim>();
  for (const name of row?.names ?? []) {
    if (name.nameType !== "scientific_accepted") continue;
    const sourceName = name.sourceName ?? input.fallbackSource.name;
    const claimed = name.displayName.trim();
    const key = `${claimed.toLowerCase()}::${sourceName}`;
    if (!acceptedNameClaims.has(key)) {
      acceptedNameClaims.set(key, { sourceName, name: claimed });
    }
  }

  return {
    firstHandContentAt,
    indexableOverride,
    hasFirstHandContent:
      firstHandContentAt !== null || indexableOverride === true,
    formCount: row?.forms.length ?? 0,
    gardenerCount,
    regions,
    forms: (row?.forms ?? []).map(toRelated),
    pests: (row?.pests ?? []).map(toRelated),
    hosts: (row?.hosts ?? []).map(toRelated),
    sourceGroups: [...groups.values()].sort((left, right) =>
      left.sourceName.localeCompare(right.sourceName, "en"),
    ),
    acceptedNameClaims: [...acceptedNameClaims.values()],
    presence: PUBLIC_PRESENCE_REGION_CODES.map((code) =>
      presence.get(code),
    ).filter((entry): entry is PublicOrganismPresence => entry !== undefined),
    attributions: (row?.sources ?? [])
      .filter((source) => source.attributionRequired && source.attributionText)
      .map((source) => ({
        sourceSlug: source.sourceSlug,
        sourceName: source.sourceName,
        text: source.attributionText as string,
        downloadedAt: source.lastObservedAt ?? source.fetchedAt ?? null,
      })),
    sources: (row?.sources ?? []).map((source) => ({
      sourceSlug: source.sourceSlug,
      sourceName: source.sourceName,
      sourceVersion: source.sourceVersion,
      sourceUrl: source.sourceUrl,
      license: source.license,
      licenseUrl: source.licenseUrl,
      attributionRequired: Boolean(source.attributionRequired),
      attributionText: source.attributionText,
      fetchedAt: source.fetchedAt,
      lastObservedAt: source.lastObservedAt,
    })),
  };
}

/** A card with nothing but its identity: fixtures and a node the graph has not touched. */
export function emptyPublicOrganismCard(
  overrides: Partial<PublicOrganismCard> = {},
): PublicOrganismCard {
  return {
    firstHandContentAt: null,
    indexableOverride: null,
    hasFirstHandContent: false,
    formCount: 0,
    gardenerCount: 0,
    regions: [],
    forms: [],
    pests: [],
    hosts: [],
    sourceGroups: [],
    acceptedNameClaims: [],
    presence: [],
    attributions: [],
    sources: [],
    ...overrides,
  };
}

/** Distinct accepted names: more than one means the sources disagree (D2). */
export function hasAcceptedNameDisagreement(
  claims: readonly PublicOrganismAcceptedNameClaim[],
) {
  return new Set(claims.map((claim) => claim.name.toLowerCase())).size > 1;
}
