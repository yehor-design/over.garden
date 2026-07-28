export const LAUNCH_MEDIA_QUALITY_POLICY_VERSION =
  "ove231.launch-media-quality.v1" as const;

export const LAUNCH_MEDIA_QUALITY_SAMPLE_SIDE = 64;
export const LAUNCH_MEDIA_QUALITY_MAX_SAMPLED_PIXELS =
  LAUNCH_MEDIA_QUALITY_SAMPLE_SIDE * LAUNCH_MEDIA_QUALITY_SAMPLE_SIDE;
export const LAUNCH_MEDIA_QUALITY_TIMEOUT_MS = 1_000;

export type LaunchMediaQualityClass =
  | "accepted"
  | "rejected"
  | "review_required";

export type LaunchMediaQualityReason =
  | "quality_accepted"
  | "launch_dimensions"
  | "decode_failed"
  | "fully_transparent"
  | "flat_color"
  | "ambiguous_dark_low_contrast";

export interface LaunchMediaQualityMetrics {
  sampledPixels: number;
  visibleFraction: number;
  meanLuminance: number;
  luminanceDeviation: number;
  luminanceEntropy: number;
  edgeEnergy: number;
  occupiedColorBins: number;
}

export interface LaunchMediaQualityResult {
  policyVersion: typeof LAUNCH_MEDIA_QUALITY_POLICY_VERSION;
  qualityClass: LaunchMediaQualityClass;
  reasonCodes: readonly LaunchMediaQualityReason[];
  metrics: LaunchMediaQualityMetrics;
}

export function isCurrentAcceptedLaunchMediaQuality(input: {
  qualityPolicyVersion?: string | null;
  qualityClass?: string | null;
}): boolean {
  return (
    input.qualityPolicyVersion === LAUNCH_MEDIA_QUALITY_POLICY_VERSION &&
    input.qualityClass === "accepted"
  );
}
