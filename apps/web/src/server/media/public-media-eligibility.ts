import "server-only";

import { sql, type RawBuilder, type SqlBool } from "kysely";
import { LAUNCH_MEDIA_QUALITY_POLICY_VERSION } from "@/lib/media/launch-media-quality";

/** One fail-closed owner for every public media SQL projection. */
export function publicMediaEligibilityPredicate(
  alias = "media_assets",
): RawBuilder<SqlBool> {
  return sql<SqlBool>`
    ${sql.ref(`${alias}.status`)} = ${"processed"}
    and ${sql.ref(`${alias}.derivative_key`)} is not null
    and ${sql.ref(`${alias}.original_deleted_at`)} is not null
    and ${sql.ref(`${alias}.revoked_at`)} is null
    and ${sql.ref(`${alias}.media_readiness_state`)} = ${"public_ready"}
    and ${sql.ref(`${alias}.public_object_id`)} is not null
    and (
      ${sql.ref(`${alias}.quality_policy_version`)} is null
      or (
        ${sql.ref(`${alias}.quality_policy_version`)} = ${LAUNCH_MEDIA_QUALITY_POLICY_VERSION}
        and ${sql.ref(`${alias}.quality_class`)} = ${"accepted"}
      )
    )
  `;
}

/** Canonical fragment for bounded operator SQL that cannot use Kysely builders. */
export function publicMediaEligibilitySqlText(alias = "media_assets"): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error("Invalid media eligibility SQL alias.");
  }
  return `
    ${alias}.status = 'processed'
    and ${alias}.derivative_key is not null
    and ${alias}.original_deleted_at is not null
    and ${alias}.revoked_at is null
    and ${alias}.media_readiness_state = 'public_ready'
    and ${alias}.public_object_id is not null
    and (
      ${alias}.quality_policy_version is null
      or (
        ${alias}.quality_policy_version = '${LAUNCH_MEDIA_QUALITY_POLICY_VERSION}'
        and ${alias}.quality_class = 'accepted'
      )
    )
  `.trim();
}

export function isPublicMediaEligible(row: {
  status: string;
  derivativeKey: string | null;
  originalDeletedAt: Date | string | null;
  revokedAt?: Date | string | null;
  mediaReadinessState?: string | null;
  publicObjectId?: string | null;
  qualityPolicyVersion?: string | null;
  qualityClass?: string | null;
}): boolean {
  return (
    row.status === "processed" &&
    Boolean(row.derivativeKey) &&
    Boolean(row.originalDeletedAt) &&
    !row.revokedAt &&
    row.mediaReadinessState === "public_ready" &&
    Boolean(row.publicObjectId) &&
    (row.qualityPolicyVersion == null ||
      (row.qualityPolicyVersion === LAUNCH_MEDIA_QUALITY_POLICY_VERSION &&
        row.qualityClass === "accepted"))
  );
}
