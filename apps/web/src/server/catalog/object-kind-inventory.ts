/**
 * OVE-210: read-only pre-collapse inventory for plant_objects.object_kind.
 * Classification and SQL are pure/exported so unit tests can prove safety without
 * touching a live database.
 */

export type BeeColonyCatalogKind = "breed" | "plant_variety" | "species" | null;

export type BeeColonyVarietyState =
  | "selected"
  | "unknown"
  | "user_added"
  | "free_text";

export type BeeColonyRowClassification =
  | "safe_breed"
  | "safe_unidentified"
  | "manual_check";

export type BeeColonyInventoryRow = {
  id: string;
  catalogItemId: string | null;
  varietyState: BeeColonyVarietyState;
  catalogKind: BeeColonyCatalogKind;
  catalogSource: string | null;
  catalogHasPublicSlug: boolean;
};

export type ObjectKindCountRow = {
  objectKind: string;
  count: number;
};

export type BeeColonyDependentsSummary = {
  journalEntries: number;
  journalEntryObjectMentions: number;
  lineageSubjectEdges: number;
  lineageSourceEdges: number;
  mediaAssetsViaJournal: number;
  publicSlugJournalEntries: number;
};

export type ObjectKindInventoryReport = {
  kindCounts: ObjectKindCountRow[];
  beeColonyRows: BeeColonyInventoryRow[];
  dependents: BeeColonyDependentsSummary;
  classifications: Array<{
    id: string;
    classification: BeeColonyRowClassification;
  }>;
  safeToCollapse: boolean;
  manualCheckIds: string[];
};

/** Every statement the inventory script may issue. Must be SELECT-only. */
export const OBJECT_KIND_INVENTORY_SQL = {
  kindCounts: `
select object_kind as "objectKind", count(*)::bigint as count
from plant_objects
group by object_kind
order by object_kind
`.trim(),

  beeColonyRows: `
select
  po.id as id,
  po.catalog_item_id as "catalogItemId",
  po.variety_state as "varietyState",
  ci.catalog_kind as "catalogKind",
  ci.source as "catalogSource",
  (ci.public_slug is not null) as "catalogHasPublicSlug"
from plant_objects po
left join catalog_items ci on ci.id = po.catalog_item_id
where po.object_kind = 'bee_colony'
order by po.id
`.trim(),

  dependents: `
select
  (
    select count(*)::bigint
    from journal_entries je
    inner join plant_objects po on po.id = je.plant_object_id
    where po.object_kind = 'bee_colony'
  ) as "journalEntries",
  (
    select count(*)::bigint
    from journal_entry_object_mentions m
    inner join plant_objects po on po.id = m.plant_object_id
    where po.object_kind = 'bee_colony'
  ) as "journalEntryObjectMentions",
  (
    select count(*)::bigint
    from lineage_provenance_edges e
    inner join plant_objects po on po.id = e.subject_plant_object_id
    where po.object_kind = 'bee_colony'
  ) as "lineageSubjectEdges",
  (
    select count(*)::bigint
    from lineage_provenance_edges e
    inner join plant_objects po on po.id = e.source_plant_object_id
    where po.object_kind = 'bee_colony'
  ) as "lineageSourceEdges",
  (
    select count(*)::bigint
    from media_assets ma
    inner join journal_entries je on je.id = ma.journal_entry_id
    inner join plant_objects po on po.id = je.plant_object_id
    where po.object_kind = 'bee_colony'
  ) as "mediaAssetsViaJournal",
  (
    select count(*)::bigint
    from journal_entries je
    inner join plant_objects po on po.id = je.plant_object_id
    where po.object_kind = 'bee_colony'
      and je.public_slug is not null
  ) as "publicSlugJournalEntries"
`.trim(),
} as const;

export function listObjectKindInventoryStatements(): string[] {
  return Object.values(OBJECT_KIND_INVENTORY_SQL);
}

export function assertObjectKindInventorySqlIsSelectOnly(
  statements: readonly string[] = listObjectKindInventoryStatements(),
): void {
  for (const statement of statements) {
    if (!/^\s*select\b/i.test(statement)) {
      throw new Error(
        `Object-kind inventory statement is not SELECT-only: ${statement.slice(0, 80)}`,
      );
    }
    if (/\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i.test(statement)) {
      throw new Error(
        `Object-kind inventory statement contains a mutating keyword: ${statement.slice(0, 80)}`,
      );
    }
  }
}

/**
 * SAFE when the hive keeps bee recognition via a breed catalog identity, or is
 * unidentified (unknown/free_text) with no foreign catalog binding.
 * Foreign or missing-selected catalog bindings require manual check before collapse.
 */
export function classifyBeeColonyRow(
  row: Pick<BeeColonyInventoryRow, "varietyState" | "catalogKind">,
): BeeColonyRowClassification {
  if (row.catalogKind === "breed") {
    return "safe_breed";
  }

  const unidentified =
    row.varietyState === "unknown" || row.varietyState === "free_text";
  const foreignCatalog =
    row.catalogKind === "plant_variety" || row.catalogKind === "species";

  if (unidentified && !foreignCatalog) {
    return "safe_unidentified";
  }

  return "manual_check";
}

export function buildObjectKindInventoryReport(input: {
  kindCounts: ObjectKindCountRow[];
  beeColonyRows: BeeColonyInventoryRow[];
  dependents: BeeColonyDependentsSummary;
}): ObjectKindInventoryReport {
  const classifications = input.beeColonyRows.map((row) => ({
    id: row.id,
    classification: classifyBeeColonyRow(row),
  }));
  const manualCheckIds = classifications
    .filter((row) => row.classification === "manual_check")
    .map((row) => row.id);

  return {
    kindCounts: input.kindCounts,
    beeColonyRows: input.beeColonyRows,
    dependents: input.dependents,
    classifications,
    safeToCollapse: manualCheckIds.length === 0,
    manualCheckIds,
  };
}

export function formatObjectKindInventoryReport(
  report: ObjectKindInventoryReport,
): string {
  const lines: string[] = [];
  lines.push("OVE-210 object-kind inventory (redacted)");
  lines.push("");
  lines.push("## Counts by object_kind");
  if (report.kindCounts.length === 0) {
    lines.push("(none)");
  } else {
    for (const row of report.kindCounts) {
      lines.push(`- ${row.objectKind}: ${row.count}`);
    }
  }

  lines.push("");
  lines.push("## bee_colony rows");
  if (report.beeColonyRows.length === 0) {
    lines.push("(none)");
  } else {
    for (const row of report.beeColonyRows) {
      const classification = classifyBeeColonyRow(row);
      lines.push(
        [
          `- id=${row.id}`,
          `catalog_item_id=${row.catalogItemId ?? "null"}`,
          `variety_state=${row.varietyState}`,
          `catalog_kind=${row.catalogKind ?? "null"}`,
          `catalog_source=${row.catalogSource ?? "null"}`,
          `catalog_has_public_slug=${row.catalogHasPublicSlug}`,
          `classification=${classification}`,
        ].join(" "),
      );
    }
  }

  lines.push("");
  lines.push("## Dependents of bee_colony objects (counts only)");
  lines.push(`- journal_entries.plant_object_id: ${report.dependents.journalEntries}`);
  lines.push(
    `- journal_entry_object_mentions.plant_object_id: ${report.dependents.journalEntryObjectMentions}`,
  );
  lines.push(
    `- lineage_provenance_edges.subject_plant_object_id: ${report.dependents.lineageSubjectEdges}`,
  );
  lines.push(
    `- lineage_provenance_edges.source_plant_object_id: ${report.dependents.lineageSourceEdges}`,
  );
  lines.push(
    `- media_assets via journal_entries: ${report.dependents.mediaAssetsViaJournal}`,
  );
  lines.push(
    `- journal_entries with public_slug: ${report.dependents.publicSlugJournalEntries}`,
  );

  lines.push("");
  lines.push(
    `SAFE TO COLLAPSE: ${report.safeToCollapse ? "yes" : "no"}`,
  );
  if (!report.safeToCollapse) {
    lines.push(
      `manual_check_ids: ${report.manualCheckIds.join(",") || "(none)"}`,
    );
  }

  return `${lines.join("\n")}\n`;
}
