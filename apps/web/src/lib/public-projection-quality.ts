export const PUBLIC_PROJECTION_QUALITY_CONTRACT_VERSION =
  "ove331.qualityClass.v1" as const;

export const PUBLIC_PROJECTION_QUALITY_CLASSES = [
  "verified",
  "partial",
  "unverified",
] as const;

export type PublicProjectionQualityClass =
  (typeof PUBLIC_PROJECTION_QUALITY_CLASSES)[number];

export const PUBLIC_PROJECTION_QUALITY_REASON_CODES = [
  "coarse_region_unavailable",
  "media_projection_unresolved",
  "analytics_delivery_unavailable",
] as const;

export type PublicProjectionQualityReason =
  (typeof PUBLIC_PROJECTION_QUALITY_REASON_CODES)[number];

export const PUBLIC_SEARCH_PROJECTION_QUALITY_REASON_CODES = [
  "coarse_region_unavailable",
  "media_projection_unresolved",
] as const satisfies readonly PublicProjectionQualityReason[];

const QUALITY_CLASS_SET = new Set<string>(PUBLIC_PROJECTION_QUALITY_CLASSES);
const QUALITY_REASON_SET = new Set<string>(
  PUBLIC_PROJECTION_QUALITY_REASON_CODES,
);
const SEARCH_QUALITY_REASON_SET = new Set<string>(
  PUBLIC_SEARCH_PROJECTION_QUALITY_REASON_CODES,
);

export interface PublicProjectionQuality {
  qualityClass: PublicProjectionQualityClass;
  qualityReasons: PublicProjectionQualityReason[];
}

export type AnalyticsDeliveryQuality =
  | { qualityClass: "verified"; qualityReasons: [] }
  | {
      qualityClass: "unverified";
      qualityReasons: ["analytics_delivery_unavailable"];
    };

export function analyticsDeliveryQuality(
  recorded: true,
): Extract<AnalyticsDeliveryQuality, { qualityClass: "verified" }>;
export function analyticsDeliveryQuality(
  recorded: false,
): Extract<AnalyticsDeliveryQuality, { qualityClass: "unverified" }>;
export function analyticsDeliveryQuality(
  recorded: boolean,
): AnalyticsDeliveryQuality;
export function analyticsDeliveryQuality(
  recorded: boolean,
): AnalyticsDeliveryQuality {
  return recorded
    ? { qualityClass: "verified", qualityReasons: [] }
    : {
        qualityClass: "unverified",
        qualityReasons: ["analytics_delivery_unavailable"],
      };
}

export interface PublicMediaProjectionInput {
  derivativeKey: string | null;
  revokedAt?: Date | string | null;
}

export type PublicMediaProjectionDecision =
  | {
      state: "admitted_verified";
      qualityClass: "verified";
      qualityReasons: [];
    }
  | {
      state: "admitted_partial";
      qualityClass: "partial";
      qualityReasons: ["media_projection_unresolved"];
    }
  | {
      state: "excluded";
      qualityClass: "unverified";
      qualityReasons: ["media_projection_unresolved"];
    };

export function classifyPublicMediaProjection(
  row: PublicMediaProjectionInput,
): PublicMediaProjectionDecision {
  if (
    !row.derivativeKey || Boolean(row.revokedAt)
  ) {
    return {
      state: "excluded",
      qualityClass: "unverified",
      qualityReasons: ["media_projection_unresolved"],
    };
  }
  return {
    state: "admitted_verified",
    qualityClass: "verified",
    qualityReasons: [],
  };
}

export function isPublicProjectionQualityClass(
  value: unknown,
): value is PublicProjectionQualityClass {
  return typeof value === "string" && QUALITY_CLASS_SET.has(value);
}

export function isPublicProjectionQualityReason(
  value: unknown,
): value is PublicProjectionQualityReason {
  return typeof value === "string" && QUALITY_REASON_SET.has(value);
}

export function isPublicSearchProjectionQualityReason(
  value: unknown,
): value is (typeof PUBLIC_SEARCH_PROJECTION_QUALITY_REASON_CODES)[number] {
  return typeof value === "string" && SEARCH_QUALITY_REASON_SET.has(value);
}

export function searchProjectionQuality(
  reasons: readonly PublicProjectionQualityReason[],
): PublicProjectionQuality {
  const qualityReasons = normalizePublicProjectionQualityReasons(reasons);
  return {
    qualityClass: qualityReasons.length === 0 ? "verified" : "partial",
    qualityReasons,
  };
}

export function normalizePublicProjectionQualityReasons(
  reasons: readonly PublicProjectionQualityReason[],
): PublicProjectionQualityReason[] {
  const selected = new Set(reasons);
  return PUBLIC_PROJECTION_QUALITY_REASON_CODES.filter((reason) =>
    selected.has(reason),
  );
}
