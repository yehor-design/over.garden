/**
 * OVE-199 read-only launch corpus inventory, plan, and check.
 * SELECT-only SQL. Redacted reports — never titles, bodies, emails, or media keys.
 */

import { createHash } from "node:crypto";

import {
  isJournalContentClass,
  isJournalSourceLanguage,
  requiresDeclaredSourceLanguage,
  type JournalContentClass,
} from "@/lib/launch-corpus/content-class";
import {
  LAUNCH_CORPUS_SHOT_LIST,
  LAUNCH_CORPUS_TOPOLOGY,
  listEditorialSeedShotIds,
} from "@/lib/launch-corpus/shot-list";
import {
  assertLocalCoverMatrixComplete,
  listLocalCoverMatrixBranchIds,
} from "@/lib/launch-corpus/cover-matrix";
import { publicMediaEligibilitySqlText } from "@/server/media/public-media-eligibility";

export type LaunchCorpusDisposition =
  | "archive"
  | "revoke_via_ove195"
  | "reclassify_retain_lifecycle"
  | "reclassify_production_smoke"
  | "retain_ok"
  | "no_action_pending_signoff";

export type LaunchCorpusQualityClass =
  | "public_active_launch"
  | "production_smoke_suspect"
  | "technical_label_hit"
  | "tiny_or_placeholder_media"
  | "missing_source_language"
  | "non_gardener_class_on_public"
  | "visual_fixture_namespace"
  | "archived_public_slug"
  | "private_active"
  | "editorial_seed_slot";

export interface LaunchCorpusDispositionTarget {
  qualityClass: LaunchCorpusQualityClass;
  disposition: LaunchCorpusDisposition;
  count: number;
  notes: string;
}

export interface LaunchCorpusContentClassCount {
  contentClass: string;
  count: number;
}

export interface LaunchCorpusPlanReport {
  issue: "OVE-199";
  evidenceClass: "launch_corpus_plan";
  environment: "local" | "production";
  redacted: true;
  contentClassCounts: LaunchCorpusContentClassCount[];
  publicActiveCount: number;
  publicActiveByClass: LaunchCorpusContentClassCount[];
  publicActiveTargetHashes: string[];
  technicalLabelHits: number;
  tinyPlaceholderMediaHits: number;
  visualFixtureMutationHits: number;
  missingSourceLanguageOnFounderPublic: number;
  archivedWithPublicSlug: number;
  privateActive: number;
  dispositionTargets: LaunchCorpusDispositionTarget[];
  editorialSeedSlots: readonly string[];
  topology: typeof LAUNCH_CORPUS_TOPOLOGY;
  localCoverMatrixBranchIds: readonly string[];
  launchReady: boolean;
  blockingReasons: string[];
}

export interface LaunchCorpusCheckFinding {
  code: string;
  severity: "fail" | "warn";
  count: number;
  message: string;
}

export interface LaunchCorpusCheckReport {
  issue: "OVE-199";
  evidenceClass: "launch_corpus_check";
  environment: "local" | "production";
  redacted: true;
  ok: boolean;
  findings: LaunchCorpusCheckFinding[];
  plan: LaunchCorpusPlanReport;
}

/** Every statement the plan script may issue. Must be SELECT-only. */
export const LAUNCH_CORPUS_INVENTORY_SQL = {
  contentClassCounts: `
select coalesce(content_class, 'unset') as "contentClass", count(*)::bigint as count
from journal_entries
group by coalesce(content_class, 'unset')
order by coalesce(content_class, 'unset')
`.trim(),

  publicActiveByClass: `
select coalesce(content_class, 'unset') as "contentClass", count(*)::bigint as count
from journal_entries
where visibility = 'public'
  and lifecycle_state = 'active'
  and public_slug is not null
group by coalesce(content_class, 'unset')
order by coalesce(content_class, 'unset')
`.trim(),

  publicActiveTargets: `
select id
from journal_entries
where visibility = 'public'
  and lifecycle_state = 'active'
  and public_slug is not null
  and coalesce(content_class, 'real_ugc') = 'real_ugc'
order by id
`.trim(),

  technicalLabelHits: `
select count(*)::bigint as count
from journal_entries
where visibility = 'public'
  and lifecycle_state = 'active'
  and public_slug is not null
  and (
    title ~* '(OVE-[[:digit:]]+|\\bsmoke\\b|\\bfixture\\b|\\blorem\\b|\\bplaceholder\\b|\\btest harness\\b)'
    or body ~* '(OVE-[[:digit:]]+|\\bsmoke\\b|\\bfixture\\b|\\blorem\\b|\\bplaceholder\\b|\\btest harness\\b)'
  )
`.trim(),

  tinyPlaceholderMediaHits: `
select count(*)::bigint as count
from media_assets ma
inner join journal_entries je on je.id = ma.journal_entry_id
where je.visibility = 'public'
  and je.lifecycle_state = 'active'
  and je.public_slug is not null
  and ${publicMediaEligibilitySqlText("ma")}
  and (
    (ma.intrinsic_width is not null and ma.intrinsic_width <= 16)
    or (ma.intrinsic_height is not null and ma.intrinsic_height <= 16)
    or (
      ma.intrinsic_width is not null
      and ma.intrinsic_height is not null
      and ma.intrinsic_width = ma.intrinsic_height
      and ma.intrinsic_width <= 32
    )
  )
`.trim(),

  visualFixtureMutationHits: `
select count(*)::bigint as count
from journal_entries
where client_mutation_id like 'visual-fixtures/%'
   or content_class = 'visual_fixture'
`.trim(),

  missingSourceLanguageOnFounderPublic: `
select count(*)::bigint as count
from journal_entries
where visibility = 'public'
  and lifecycle_state = 'active'
  and public_slug is not null
  and content_class in ('founder_first_hand', 'editorial')
  and source_language is null
`.trim(),

  archivedWithPublicSlug: `
select count(*)::bigint as count
from journal_entries
where lifecycle_state = 'archived'
  and public_slug is not null
`.trim(),

  privateActive: `
select count(*)::bigint as count
from journal_entries
where visibility = 'private'
  and lifecycle_state = 'active'
`.trim(),

  publicActiveCount: `
select count(*)::bigint as count
from journal_entries
where visibility = 'public'
  and lifecycle_state = 'active'
  and public_slug is not null
`.trim(),
} as const;

export function listLaunchCorpusInventoryStatements(): string[] {
  return Object.values(LAUNCH_CORPUS_INVENTORY_SQL);
}

export function assertLaunchCorpusInventorySqlIsSelectOnly(
  statements: readonly string[] = listLaunchCorpusInventoryStatements(),
): void {
  for (const statement of statements) {
    if (!/^\s*select\b/i.test(statement)) {
      throw new Error(
        `Launch corpus inventory statement is not SELECT-only: ${statement.slice(0, 80)}`,
      );
    }
  }
}

export interface LaunchCorpusInventoryRows {
  contentClassCounts: LaunchCorpusContentClassCount[];
  publicActiveByClass: LaunchCorpusContentClassCount[];
  publicActiveTargetIds: string[];
  technicalLabelHits: number;
  tinyPlaceholderMediaHits: number;
  visualFixtureMutationHits: number;
  missingSourceLanguageOnFounderPublic: number;
  archivedWithPublicSlug: number;
  privateActive: number;
  publicActiveCount: number;
}

export function buildLaunchCorpusPlanReport(input: {
  environment: "local" | "production";
  inventory: LaunchCorpusInventoryRows;
}): LaunchCorpusPlanReport {
  assertLocalCoverMatrixComplete();

  const dispositionTargets: LaunchCorpusDispositionTarget[] = [];

  const smokeSuspect =
    input.inventory.technicalLabelHits +
    countClass(input.inventory.publicActiveByClass, "production_smoke");

  if (smokeSuspect > 0) {
    dispositionTargets.push({
      qualityClass: "production_smoke_suspect",
      disposition: "archive",
      count: smokeSuspect,
      notes:
        "Public-active rows with technical labels or production_smoke class → archive (lifecycle archived; out of feed/search). Exact IDs only after sign-off.",
    });
  }

  if (input.inventory.tinyPlaceholderMediaHits > 0) {
    dispositionTargets.push({
      qualityClass: "tiny_or_placeholder_media",
      disposition: "revoke_via_ove195",
      count: input.inventory.tinyPlaceholderMediaHits,
      notes:
        "Dimension-tiny public derivatives are a legacy fast count; OVE-231 classifies flat, transparent, dark-ambiguous, and placeholder bytes before any OVE-199 disposition.",
    });
  }

  if (input.inventory.visualFixtureMutationHits > 0) {
    dispositionTargets.push({
      qualityClass: "visual_fixture_namespace",
      disposition:
        input.environment === "production"
          ? "reclassify_retain_lifecycle"
          : "retain_ok",
      count: input.inventory.visualFixtureMutationHits,
      notes:
        input.environment === "production"
          ? "Fixture namespace must be absent from production; classify and remove from guest surfaces."
          : "Local/preview fixture rows are expected; production refusal remains enforced.",
    });
  }

  if (input.inventory.archivedWithPublicSlug > 0) {
    dispositionTargets.push({
      qualityClass: "archived_public_slug",
      disposition: "reclassify_retain_lifecycle",
      count: input.inventory.archivedWithPublicSlug,
      notes:
        "Includes OVE-191 retired synthetic Gone tombs — retain lifecycle/search parity; never impersonate as real UGC.",
    });
  }

  dispositionTargets.push({
    qualityClass: "editorial_seed_slot",
    disposition: "no_action_pending_signoff",
    count: LAUNCH_CORPUS_SHOT_LIST.length,
    notes: `Frozen OVE-199 v1 evidence covers ${LAUNCH_CORPUS_TOPOLOGY.journals} editorial slots (${LAUNCH_CORPUS_TOPOLOGY.spaces} spaces / ${LAUNCH_CORPUS_TOPOLOGY.objects} objects), but grants no mutation authority after OVE-349; a new public-only final-WebP vertical contract and exact sign-off are required.`,
  });

  const nonFounderPublic = countClass(
    input.inventory.publicActiveByClass,
    "real_ugc",
  );
  if (input.environment === "production" && nonFounderPublic > 0) {
    dispositionTargets.push({
      qualityClass: "public_active_launch",
      disposition: "reclassify_production_smoke",
      count: nonFounderPublic,
      notes:
        "Existing public-active legacy real_ugc rows must be reviewed under sign-off: archive/hide/reclassify so they are not mistaken for independent gardener evidence.",
    });
  }

  const blockingReasons: string[] = [];
  if (input.inventory.technicalLabelHits > 0) {
    blockingReasons.push("technical_label_hits");
  }
  if (input.inventory.tinyPlaceholderMediaHits > 0) {
    blockingReasons.push("tiny_placeholder_media");
  }
  if (
    input.environment === "production" &&
    input.inventory.visualFixtureMutationHits > 0
  ) {
    blockingReasons.push("visual_fixture_in_production");
  }
  if (input.inventory.missingSourceLanguageOnFounderPublic > 0) {
    blockingReasons.push("missing_founder_source_language");
  }
  const editorialPublic = countClass(
    input.inventory.publicActiveByClass,
    "editorial",
  );
  if (input.environment === "production" && editorialPublic < 8) {
    blockingReasons.push("insufficient_editorial_launch_public");
  }

  // Public-only real_ugc without founder seed still blocks launch readiness.
  if (
    input.environment === "production" &&
    input.inventory.publicActiveCount > 0 &&
    editorialPublic === 0
  ) {
    if (!blockingReasons.includes("insufficient_editorial_launch_public")) {
      blockingReasons.push("insufficient_editorial_launch_public");
    }
  }

  return {
    issue: "OVE-199",
    evidenceClass: "launch_corpus_plan",
    environment: input.environment,
    redacted: true,
    contentClassCounts: input.inventory.contentClassCounts,
    publicActiveCount: input.inventory.publicActiveCount,
    publicActiveByClass: input.inventory.publicActiveByClass,
    publicActiveTargetHashes: input.inventory.publicActiveTargetIds
      .map(redactLaunchCorpusTargetId)
      .sort(),
    technicalLabelHits: input.inventory.technicalLabelHits,
    tinyPlaceholderMediaHits: input.inventory.tinyPlaceholderMediaHits,
    visualFixtureMutationHits: input.inventory.visualFixtureMutationHits,
    missingSourceLanguageOnFounderPublic:
      input.inventory.missingSourceLanguageOnFounderPublic,
    archivedWithPublicSlug: input.inventory.archivedWithPublicSlug,
    privateActive: input.inventory.privateActive,
    dispositionTargets,
    editorialSeedSlots: listEditorialSeedShotIds(),
    topology: LAUNCH_CORPUS_TOPOLOGY,
    localCoverMatrixBranchIds: listLocalCoverMatrixBranchIds(),
    launchReady: blockingReasons.length === 0,
    blockingReasons,
  };
}

export function redactLaunchCorpusTargetId(id: string): string {
  return createHash("sha256")
    .update(`ove199.production-target.v1:${id}`, "utf8")
    .digest("hex");
}

export function buildLaunchCorpusCheckReport(input: {
  environment: "local" | "production";
  plan: LaunchCorpusPlanReport;
  requireLaunchReady?: boolean;
}): LaunchCorpusCheckReport {
  const findings: LaunchCorpusCheckFinding[] = [];

  if (input.plan.technicalLabelHits > 0) {
    findings.push({
      code: "technical_labels",
      severity: "fail",
      count: input.plan.technicalLabelHits,
      message:
        "Public-active journals still contain OVE-*/smoke/fixture/lorem/placeholder labels.",
    });
  }

  if (input.plan.tinyPlaceholderMediaHits > 0) {
    findings.push({
      code: "placeholder_media",
      severity: "fail",
      count: input.plan.tinyPlaceholderMediaHits,
      message:
        "Public-active journals still reference dimension-tiny media; use the OVE-231 classifier inventory for byte-quality classes.",
    });
  }

  if (
    input.environment === "production" &&
    input.plan.visualFixtureMutationHits > 0
  ) {
    findings.push({
      code: "fixture_in_production",
      severity: "fail",
      count: input.plan.visualFixtureMutationHits,
      message: "Visual fixture namespace present in production journal rows.",
    });
  }

  if (input.plan.missingSourceLanguageOnFounderPublic > 0) {
    findings.push({
      code: "missing_source_language",
      severity: "fail",
      count: input.plan.missingSourceLanguageOnFounderPublic,
      message:
        "Public founder/editorial journals are missing declared source_language.",
    });
  }

  for (const row of input.plan.publicActiveByClass) {
    if (
      row.contentClass === "production_smoke" ||
      row.contentClass === "visual_fixture"
    ) {
      findings.push({
        code: "non_gardener_on_public",
        severity: "fail",
        count: row.count,
        message: `Public-active surface still exposes content_class=${row.contentClass}.`,
      });
    }
  }

  if (input.requireLaunchReady && !input.plan.launchReady) {
    findings.push({
      code: "not_launch_ready",
      severity: "fail",
      count: input.plan.blockingReasons.length,
      message: `Launch corpus not ready: ${input.plan.blockingReasons.join(", ")}.`,
    });
  }

  const ok = findings.every((finding) => finding.severity !== "fail");
  return {
    issue: "OVE-199",
    evidenceClass: "launch_corpus_check",
    environment: input.environment,
    redacted: true,
    ok,
    findings,
    plan: input.plan,
  };
}

export function detectTechnicalLabelText(value: string): boolean {
  return /OVE-\d+|\bsmoke\b|\bfixture\b|\blorem\b|\bplaceholder\b|\btest harness\b/i.test(
    value,
  );
}

export function validateFounderPublicRow(input: {
  contentClass: string;
  sourceLanguage: string | null;
  title: string;
  body: string;
}): string[] {
  const errors: string[] = [];
  if (!isJournalContentClass(input.contentClass)) {
    errors.push("invalid_content_class");
    return errors;
  }
  if (
    requiresDeclaredSourceLanguage(input.contentClass) &&
    !isJournalSourceLanguage(input.sourceLanguage)
  ) {
    errors.push("missing_source_language");
  }
  if (
    detectTechnicalLabelText(input.title) ||
    detectTechnicalLabelText(input.body)
  ) {
    errors.push("technical_label");
  }
  return errors;
}

function countClass(
  rows: LaunchCorpusContentClassCount[],
  contentClass: JournalContentClass | string,
): number {
  return rows.find((row) => row.contentClass === contentClass)?.count ?? 0;
}
