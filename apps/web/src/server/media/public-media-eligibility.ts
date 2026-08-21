import "server-only";

import { sql, type RawBuilder, type SqlBool } from "kysely";
import {
  classifyPublicMediaProjection,
  isVerifiedTransitionalMediaState,
  type PublicMediaProjectionInput,
  type PublicProjectionQualityClass,
  type PublicProjectionQualityReason,
} from "@/lib/public-projection-quality";

export {
  classifyPublicMediaProjection,
  type PublicMediaProjectionDecision,
  type PublicMediaProjectionInput,
} from "@/lib/public-projection-quality";

/** ADR-0018 format-conversion-only owner for every public media SQL projection. */
export function publicMediaEligibilityPredicate(
  alias = "media_assets",
): RawBuilder<SqlBool> {
  return sql<SqlBool>`
    ${sql.ref(`${alias}.status`)} = ${"processed"}
    and ${sql.ref(`${alias}.derivative_key`)} is not null
    and ${sql.ref(`${alias}.revoked_at`)} is null
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
    and ${alias}.revoked_at is null
  `.trim();
}

export function isPublicMediaEligible(
  row: PublicMediaProjectionInput,
): boolean {
  return classifyPublicMediaProjection(row).state !== "excluded";
}

/**
 * Transitional processing completion remains strict until OVE-333/OVE-334.
 * It must not be confused with ADR-0018 public projection eligibility.
 */
export function isPublicMediaVerifiedForProcessing(
  row: PublicMediaProjectionInput,
): boolean {
  return isVerifiedTransitionalMediaState(row);
}

export function publicMediaProjectionQuality(row: PublicMediaProjectionInput): {
  qualityClass: PublicProjectionQualityClass;
  qualityReasons: PublicProjectionQualityReason[];
} {
  const decision = classifyPublicMediaProjection(row);
  return {
    qualityClass: decision.qualityClass,
    qualityReasons: [...decision.qualityReasons],
  };
}
