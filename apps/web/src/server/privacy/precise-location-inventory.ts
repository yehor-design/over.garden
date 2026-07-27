/**
 * OVE-234 — read-only precise-location inventory.
 *
 * The audit reads existing user text, classifies it with the authoritative
 * detector, and reports counts and row identifiers only. It never returns,
 * prints, or logs the offending text, and it issues SELECT statements only:
 * a cleanup plan is a separate, maintainer-approved step.
 */

import {
  PRECISE_LOCATION_POLICY_VERSION,
  findPreciseLocationText,
  type PreciseLocationTextKind,
} from "@/lib/privacy/precise-location-text";

export type PreciseLocationSurfaceKey =
  | "journal_entry_title"
  | "journal_entry_body"
  | "engagement_comment_body"
  | "user_public_profile_bio"
  | "user_public_profile_display_name"
  | "lineage_source_label"
  | "lineage_question_text";

export const PRECISE_LOCATION_SURFACE_KEYS: readonly PreciseLocationSurfaceKey[] =
  [
    "journal_entry_title",
    "journal_entry_body",
    "engagement_comment_body",
    "user_public_profile_bio",
    "user_public_profile_display_name",
    "lineage_source_label",
    "lineage_question_text",
  ] as const;

export interface PreciseLocationInventoryRow {
  /** Row identifier only — never the scanned text. */
  id: string;
  value: string;
  /** True when the row is reachable from a public/indexable surface. */
  publiclyVisible: boolean;
}

export interface PreciseLocationSurfaceReport {
  surface: PreciseLocationSurfaceKey;
  scannedRows: number;
  affectedRows: number;
  affectedPublicRows: number;
  countsByKind: Record<string, number>;
  /** Row ids only, capped, so an operator can act without seeing the text. */
  sampleRowIds: string[];
}

export interface PreciseLocationInventoryReport {
  policyVersion: typeof PRECISE_LOCATION_POLICY_VERSION;
  surfaces: PreciseLocationSurfaceReport[];
  totals: {
    scannedRows: number;
    affectedRows: number;
    affectedPublicRows: number;
    countsByKind: Record<string, number>;
  };
  clean: boolean;
}

const MAX_SAMPLE_ROW_IDS = 20;

/** Every statement the audit may issue. SELECT-only by construction. */
export const PRECISE_LOCATION_INVENTORY_SQL: Record<
  PreciseLocationSurfaceKey,
  string
> = {
  journal_entry_title: `
select id::text as id, title as value,
  (visibility = 'public' and lifecycle_state = 'active') as "publiclyVisible"
from journal_entries
where title is not null and title <> ''
`.trim(),

  journal_entry_body: `
select id::text as id, body as value,
  (visibility = 'public' and lifecycle_state = 'active') as "publiclyVisible"
from journal_entries
where body is not null and body <> ''
`.trim(),

  engagement_comment_body: `
select id::text as id, body as value,
  (comment_state = 'active') as "publiclyVisible"
from engagement_comments
where body is not null and body <> ''
`.trim(),

  user_public_profile_bio: `
select user_id::text as id, bio as value,
  (profile_visibility = 'public') as "publiclyVisible"
from user_public_profiles
where bio is not null and bio <> ''
`.trim(),

  user_public_profile_display_name: `
select user_id::text as id, display_name as value,
  (profile_visibility = 'public') as "publiclyVisible"
from user_public_profiles
where display_name is not null and display_name <> ''
`.trim(),

  lineage_source_label: `
select id::text as id, source_reference_label as value, true as "publiclyVisible"
from lineage_provenance_edges
where source_reference_label is not null and source_reference_label <> ''
`.trim(),

  lineage_question_text: `
select id::text as id, question_text as value, false as "publiclyVisible"
from lineage_questions
where question_text is not null and question_text <> ''
`.trim(),
};

const SELECT_ONLY_PATTERN =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|merge)\b/i;

export function assertPreciseLocationInventorySqlIsSelectOnly(): void {
  for (const [surface, statement] of Object.entries(
    PRECISE_LOCATION_INVENTORY_SQL,
  )) {
    if (!/^select\b/i.test(statement.trim())) {
      throw new Error(`Inventory statement for ${surface} is not a SELECT.`);
    }
    if (SELECT_ONLY_PATTERN.test(statement)) {
      throw new Error(`Inventory statement for ${surface} mutates data.`);
    }
  }
}

export function classifyPreciseLocationSurface(
  surface: PreciseLocationSurfaceKey,
  rows: readonly PreciseLocationInventoryRow[],
): PreciseLocationSurfaceReport {
  const countsByKind: Record<string, number> = {};
  const sampleRowIds: string[] = [];
  let affectedRows = 0;
  let affectedPublicRows = 0;

  for (const row of rows) {
    const found = findPreciseLocationText(row.value);
    if (!found) continue;

    affectedRows += 1;
    if (row.publiclyVisible) affectedPublicRows += 1;
    const kind: PreciseLocationTextKind = found.kind;
    countsByKind[kind] = (countsByKind[kind] ?? 0) + 1;
    if (sampleRowIds.length < MAX_SAMPLE_ROW_IDS) sampleRowIds.push(row.id);
  }

  return {
    surface,
    scannedRows: rows.length,
    affectedRows,
    affectedPublicRows,
    countsByKind,
    sampleRowIds,
  };
}

export function buildPreciseLocationInventoryReport(
  surfaces: readonly PreciseLocationSurfaceReport[],
): PreciseLocationInventoryReport {
  const countsByKind: Record<string, number> = {};
  let scannedRows = 0;
  let affectedRows = 0;
  let affectedPublicRows = 0;

  for (const surface of surfaces) {
    scannedRows += surface.scannedRows;
    affectedRows += surface.affectedRows;
    affectedPublicRows += surface.affectedPublicRows;
    for (const [kind, count] of Object.entries(surface.countsByKind)) {
      countsByKind[kind] = (countsByKind[kind] ?? 0) + count;
    }
  }

  return {
    policyVersion: PRECISE_LOCATION_POLICY_VERSION,
    surfaces: [...surfaces],
    totals: { scannedRows, affectedRows, affectedPublicRows, countsByKind },
    clean: affectedRows === 0,
  };
}

export function formatPreciseLocationInventoryReport(
  report: PreciseLocationInventoryReport,
): string {
  const lines: string[] = [
    `Precise-location inventory (${report.policyVersion})`,
    `Scanned rows: ${report.totals.scannedRows}`,
    `Affected rows: ${report.totals.affectedRows} (public: ${report.totals.affectedPublicRows})`,
    "",
  ];

  for (const surface of report.surfaces) {
    const kinds = Object.entries(surface.countsByKind)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(", ");
    lines.push(
      `- ${surface.surface}: scanned=${surface.scannedRows} affected=${surface.affectedRows} public=${surface.affectedPublicRows}${
        kinds ? ` [${kinds}]` : ""
      }`,
    );
    if (surface.sampleRowIds.length > 0) {
      lines.push(`  row ids: ${surface.sampleRowIds.join(" ")}`);
    }
  }

  lines.push("", report.clean ? "RESULT: clean" : "RESULT: cleanup required");
  lines.push(
    "No scanned text is included in this report by design (AGENTS.md hard rule 1).",
  );
  return `${lines.join("\n")}\n`;
}
