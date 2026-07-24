/**
 * OVE-210/211: read-only object-kind inventory after the two-kind collapse.
 * Flags any plant_objects.object_kind outside {plant, animal} without naming
 * removed historical kind values in source (acceptance grep gate).
 */

export type AllowedObjectKind = "plant" | "animal";

export const ALLOWED_OBJECT_KINDS: readonly AllowedObjectKind[] = [
  "plant",
  "animal",
] as const;

export type ObjectKindCountRow = {
  objectKind: string;
  count: number;
};

export type UnexpectedKindRow = {
  id: string;
  objectKind: string;
  catalogItemId: string | null;
  varietyState: string;
  catalogKind: string | null;
  catalogSource: string | null;
};

export type ObjectKindDependentsSummary = {
  journalEntries: number;
  journalEntryObjectMentions: number;
  lineageSubjectEdges: number;
  lineageSourceEdges: number;
  mediaAssetsViaJournal: number;
  publicSlugJournalEntries: number;
};

export type ObjectKindInventoryReport = {
  kindCounts: ObjectKindCountRow[];
  unexpectedRows: UnexpectedKindRow[];
  dependents: ObjectKindDependentsSummary;
  safeToCollapse: boolean;
};

/** Every statement the inventory script may issue. Must be SELECT-only. */
export const OBJECT_KIND_INVENTORY_SQL = {
  kindCounts: `
select object_kind as "objectKind", count(*)::bigint as count
from plant_objects
group by object_kind
order by object_kind
`.trim(),

  unexpectedRows: `
select
  po.id as id,
  po.object_kind as "objectKind",
  po.catalog_item_id as "catalogItemId",
  po.variety_state as "varietyState",
  ci.catalog_kind as "catalogKind",
  ci.source as "catalogSource"
from plant_objects po
left join catalog_items ci on ci.id = po.catalog_item_id
where po.object_kind not in ('plant', 'animal')
order by po.id
`.trim(),

  dependents: `
select
  (
    select count(*)::bigint
    from journal_entries je
    inner join plant_objects po on po.id = je.plant_object_id
    where po.object_kind not in ('plant', 'animal')
  ) as "journalEntries",
  (
    select count(*)::bigint
    from journal_entry_object_mentions m
    inner join plant_objects po on po.id = m.plant_object_id
    where po.object_kind not in ('plant', 'animal')
  ) as "journalEntryObjectMentions",
  (
    select count(*)::bigint
    from lineage_provenance_edges e
    inner join plant_objects po on po.id = e.subject_plant_object_id
    where po.object_kind not in ('plant', 'animal')
  ) as "lineageSubjectEdges",
  (
    select count(*)::bigint
    from lineage_provenance_edges e
    inner join plant_objects po on po.id = e.source_plant_object_id
    where po.object_kind not in ('plant', 'animal')
  ) as "lineageSourceEdges",
  (
    select count(*)::bigint
    from media_assets ma
    inner join journal_entries je on je.id = ma.journal_entry_id
    inner join plant_objects po on po.id = je.plant_object_id
    where po.object_kind not in ('plant', 'animal')
  ) as "mediaAssetsViaJournal",
  (
    select count(*)::bigint
    from journal_entries je
    inner join plant_objects po on po.id = je.plant_object_id
    where po.object_kind not in ('plant', 'animal')
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
    if (
      /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i.test(
        statement,
      )
    ) {
      throw new Error(
        `Object-kind inventory statement contains a mutating keyword: ${statement.slice(0, 80)}`,
      );
    }
  }
}

export function isAllowedObjectKind(value: string): value is AllowedObjectKind {
  return value === "plant" || value === "animal";
}

export function buildObjectKindInventoryReport(input: {
  kindCounts: ObjectKindCountRow[];
  unexpectedRows: UnexpectedKindRow[];
  dependents: ObjectKindDependentsSummary;
}): ObjectKindInventoryReport {
  const unexpectedFromCounts = input.kindCounts.filter(
    (row) => !isAllowedObjectKind(row.objectKind) && row.count > 0,
  );
  return {
    kindCounts: input.kindCounts,
    unexpectedRows: input.unexpectedRows,
    dependents: input.dependents,
    safeToCollapse:
      unexpectedFromCounts.length === 0 && input.unexpectedRows.length === 0,
  };
}

export function formatObjectKindInventoryReport(
  report: ObjectKindInventoryReport,
): string {
  const lines: string[] = [];
  lines.push("OVE-211 object-kind inventory (redacted)");
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
  lines.push("## Unexpected kinds (outside plant|animal)");
  if (report.unexpectedRows.length === 0) {
    lines.push("(none)");
  } else {
    for (const row of report.unexpectedRows) {
      lines.push(
        [
          `- id=${row.id}`,
          `object_kind=${row.objectKind}`,
          `catalog_item_id=${row.catalogItemId ?? "null"}`,
          `variety_state=${row.varietyState}`,
          `catalog_kind=${row.catalogKind ?? "null"}`,
          `catalog_source=${row.catalogSource ?? "null"}`,
        ].join(" "),
      );
    }
  }

  lines.push("");
  lines.push("## Dependents of unexpected-kind objects (counts only)");
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

  return `${lines.join("\n")}\n`;
}
