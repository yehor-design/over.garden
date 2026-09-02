import { createHash } from "node:crypto";

export const APPROVED_RETIREMENT_EVIDENCE_DIGEST =
  "bc5c9ade2db4386cee5db9990b223e0e5b7b61a4574816ccb82fb83930625404";

export const OVE349_CLEANUP_CONFIRMATION =
  "delete-approved-ove349-test-residue" as const;
export const OVE349_MIGRATION_CONFIRMATION =
  "apply-ove349-schema-contract" as const;

export interface AggregateCounts {
  [key: string]: number;
}

export interface LegacyProductionReport {
  version: "ove349.productionPreflight.v2";
  environment: "production";
  selectOnly: true;
  databaseIdentity: "digitalocean_overgarden_production";
  schemaDigest: string;
  drafts: AggregateCounts;
  privateEntries: AggregateCounts;
  privateEntryGroups: Array<Record<string, unknown>>;
  media: AggregateCounts;
  mediaGroups: Array<
    Record<string, unknown> & { referenceClass: string; rows: number }
  >;
  publicDerivativeStates: {
    privateEntryPresent: number;
    privateEntryAbsent: number;
    publicEntryPresent: number;
    publicEntryAbsent: number;
    unattachedPresent: number;
    unattachedAbsent: number;
    providerErrors: number;
  };
  jobs: AggregateCounts;
  visibility: AggregateCounts;
  legacyQuarantineBucket: {
    identity: "overgarden-quarantine";
    objectCount: number;
    totalBytes: number;
    ageBands: {
      newerThanDay: number;
      oneToSevenDays: number;
      olderThanSevenDays: number;
    };
  };
}

export interface RetirementGateSnapshot {
  evidenceDigest: string;
  drafts: number;
  privateEntries: number;
  privateAttachedMedia: number;
  unattachedMedia: number;
  candidatePresentObjects: number;
  candidateAbsentObjects: number;
  publicEntries: number;
  publicMedia: number;
  publicPresentObjects: number;
  publicMissingObjects: number;
  unfinishedLegacyJobs: number;
  unfinishedStagingJobs: number;
  unfinishedRevokeJobs: number;
  providerErrors: number;
  publicOverlap: number;
  outsideApprovedScope: number;
}

export type RetirementGateClassification =
  | { state: "eligible_zero"; reason: "approved_exact_test_residue" }
  | {
      state: "blocked_real_state" | "blocked_inflight" | "drift";
      reason: string;
    };

export interface ZeroStateEvidence {
  drafts: number;
  privateEntries: number;
  unattachedMedia: number;
  nonFinalMedia: number;
  unfinishedEffects: number;
  publicEntries: number;
  publicMedia: number;
  publicObjectsPresent: number;
  publicObjectsMissing: number;
  providerErrors: number;
}

export type RetirementOperatorArgs =
  | { mode: "preflight" | "verify"; envFile?: string }
  | {
      mode: "cleanup";
      envFile?: string;
      approvedDigest: string;
      observationReceipt: string;
      confirmProduction: typeof OVE349_CLEANUP_CONFIRMATION;
    }
  | {
      mode: "migrate";
      envFile?: string;
      approvedZeroDigest: string;
      confirmProduction: typeof OVE349_MIGRATION_CONFIRMATION;
    };

export function stableEvidenceDigest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function toRetirementGateSnapshot(
  report: LegacyProductionReport,
  evidenceDigest = stableEvidenceDigest(report),
): RetirementGateSnapshot {
  const privateAttachedMedia = sumMediaGroup(report, "private_entry");
  const publicMedia = sumMediaGroup(report, "public_entry");
  const unattachedMedia = sumMediaGroup(report, "unattached");
  const classifiedMedia = privateAttachedMedia + publicMedia + unattachedMedia;
  const candidatePresentObjects =
    report.publicDerivativeStates.privateEntryPresent +
    report.publicDerivativeStates.unattachedPresent;
  const outsideApprovedScope =
    numberAt(report.visibility, "unexpected_rows") +
    Math.max(0, numberAt(report.media, "total") - classifiedMedia) +
    report.legacyQuarantineBucket.objectCount;

  return {
    evidenceDigest,
    drafts: numberAt(report.drafts, "total"),
    privateEntries: numberAt(report.privateEntries, "total"),
    privateAttachedMedia,
    unattachedMedia,
    candidatePresentObjects,
    // Rows with no derivative key are already absent at the provider and are
    // part of the approved 37-row candidate set even though no HEAD occurs.
    candidateAbsentObjects:
      privateAttachedMedia + unattachedMedia - candidatePresentObjects,
    publicEntries: numberAt(report.visibility, "public_rows"),
    publicMedia,
    publicPresentObjects: report.publicDerivativeStates.publicEntryPresent,
    publicMissingObjects: report.publicDerivativeStates.publicEntryAbsent,
    unfinishedLegacyJobs: numberAt(report.jobs, "unfinished_legacy_jobs"),
    unfinishedStagingJobs: numberAt(
      report.jobs,
      "unfinished_staging_finalize_jobs",
    ),
    unfinishedRevokeJobs: numberAt(
      report.jobs,
      "unfinished_preserved_revoke_jobs",
    ),
    providerErrors: report.publicDerivativeStates.providerErrors,
    publicOverlap: 0,
    outsideApprovedScope,
  };
}

export function classifyRetirementGate(
  snapshot: RetirementGateSnapshot,
): RetirementGateClassification {
  if (
    snapshot.publicOverlap !== 0 ||
    snapshot.publicMissingObjects !== 0 ||
    snapshot.providerErrors !== 0 ||
    snapshot.publicEntries !== 10 ||
    snapshot.publicMedia !== 14 ||
    snapshot.publicPresentObjects !== 14
  ) {
    return {
      state: "blocked_real_state",
      reason: "public_or_provider_state_is_not_preserved",
    };
  }
  if (
    snapshot.unfinishedLegacyJobs !== 0 ||
    snapshot.unfinishedStagingJobs !== 0 ||
    snapshot.unfinishedRevokeJobs !== 0
  ) {
    return { state: "blocked_inflight", reason: "unfinished_effects_remain" };
  }
  if (
    snapshot.evidenceDigest !== APPROVED_RETIREMENT_EVIDENCE_DIGEST ||
    snapshot.drafts !== 0 ||
    snapshot.privateEntries !== 203 ||
    snapshot.privateAttachedMedia !== 29 ||
    snapshot.unattachedMedia !== 8 ||
    snapshot.candidatePresentObjects !== 27 ||
    snapshot.candidateAbsentObjects !== 10 ||
    snapshot.outsideApprovedScope !== 0
  ) {
    return { state: "drift", reason: "approved_classification_drifted" };
  }
  return {
    state: "eligible_zero",
    reason: "approved_exact_test_residue",
  };
}

export function validateZeroState(
  evidence: ZeroStateEvidence,
): { ok: true } | { ok: false; reason: string } {
  if (
    evidence.publicEntries !== 10 ||
    evidence.publicMedia !== 14 ||
    evidence.publicObjectsPresent !== 14 ||
    evidence.publicObjectsMissing !== 0 ||
    evidence.providerErrors !== 0
  ) {
    return { ok: false, reason: "public_state_drifted" };
  }
  if (
    evidence.drafts !== 0 ||
    evidence.privateEntries !== 0 ||
    evidence.unattachedMedia !== 0 ||
    evidence.nonFinalMedia !== 0 ||
    evidence.unfinishedEffects !== 0
  ) {
    return { ok: false, reason: "legacy_state_remains" };
  }
  return { ok: true };
}

export function parseRetirementOperatorArgs(
  argv: readonly string[],
): RetirementOperatorArgs {
  const values = parseNamedArgs(argv);
  const mode = values.get("mode");
  const envFile = values.get("env-file");
  if (mode === "preflight" || mode === "verify") {
    return { mode, ...(envFile ? { envFile } : {}) };
  }
  if (mode === "cleanup") {
    const approvedDigest = requireSha256Arg(
      values,
      "approved-digest",
      "approved digest",
    );
    if (approvedDigest !== APPROVED_RETIREMENT_EVIDENCE_DIGEST) {
      throw new Error(
        "The cleanup approved digest is not the OVE-349 receipt.",
      );
    }
    const observationReceipt = requireSha256Arg(
      values,
      "observation-receipt",
      "observation receipt",
    );
    const confirmation = values.get("confirm-production");
    if (confirmation !== OVE349_CLEANUP_CONFIRMATION) {
      throw new Error("The exact OVE-349 cleanup confirmation is required.");
    }
    return {
      mode,
      ...(envFile ? { envFile } : {}),
      approvedDigest,
      observationReceipt,
      confirmProduction: confirmation,
    };
  }
  if (mode === "migrate") {
    const approvedZeroDigest = requireSha256Arg(
      values,
      "approved-zero-digest",
      "approved zero-state digest",
    );
    const confirmation = values.get("confirm-production");
    if (confirmation !== OVE349_MIGRATION_CONFIRMATION) {
      throw new Error("The exact OVE-349 migration confirmation is required.");
    }
    return {
      mode,
      ...(envFile ? { envFile } : {}),
      approvedZeroDigest,
      confirmProduction: confirmation,
    };
  }
  throw new Error(
    "Choose --mode preflight, cleanup, migrate, or verify for OVE-349.",
  );
}

function parseNamedArgs(argv: readonly string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(
        `Invalid OVE-349 operator argument near ${token ?? "end"}.`,
      );
    }
    const name = token.slice(2);
    if (values.has(name)) throw new Error(`Duplicate --${name} argument.`);
    values.set(name, value);
  }
  const supported = new Set([
    "mode",
    "env-file",
    "approved-digest",
    "approved-zero-digest",
    "observation-receipt",
    "confirm-production",
  ]);
  for (const name of values.keys()) {
    if (!supported.has(name))
      throw new Error(`Unsupported --${name} argument.`);
  }
  return values;
}

function requireSha256Arg(
  values: Map<string, string>,
  name: string,
  label: string,
) {
  const value = values.get(name);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`A lowercase SHA-256 ${label} is required.`);
  }
  return value;
}

function numberAt(counts: AggregateCounts, key: string) {
  const value = counts[key];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid aggregate count: ${key}.`);
  }
  return value;
}

function sumMediaGroup(report: LegacyProductionReport, referenceClass: string) {
  return report.mediaGroups
    .filter((group) => group.referenceClass === referenceClass)
    .reduce((sum, group) => {
      if (!Number.isSafeInteger(group.rows) || group.rows < 0) {
        throw new Error("Invalid media-group count.");
      }
      return sum + group.rows;
    }, 0);
}
