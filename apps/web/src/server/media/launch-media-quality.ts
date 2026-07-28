import "server-only";

import sharp from "sharp";

import { meetsLaunchMediaQuality } from "@/lib/media/image-limits";

export const LAUNCH_MEDIA_QUALITY_POLICY_VERSION =
  "ove231.launch-media-quality.v1" as const;

export type LaunchMediaQualityClass = "pass" | "reject" | "review_required";

export type LaunchMediaQualityReason =
  | "launch_dimensions"
  | "fully_transparent"
  | "flat_color"
  | "ambiguous_dark_low_contrast"
  | "quality_pass";

export interface LaunchMediaQualityResult {
  policyVersion: typeof LAUNCH_MEDIA_QUALITY_POLICY_VERSION;
  qualityClass: LaunchMediaQualityClass;
  reason: LaunchMediaQualityReason;
  metrics: {
    sampledPixels: number;
    visibleFraction: number;
    meanLuminance: number;
    luminanceDeviation: number;
    occupiedLuminanceBins: number;
    occupiedColorBins: number;
  };
}

const SAMPLE_SIDE = 128;
const MIN_VISIBLE_FRACTION = 0.01;
const FLAT_DEVIATION_MAX = 1.5;
const FLAT_BIN_MAX = 2;
const DARK_REVIEW_MEAN_MAX = 22;
const DARK_REVIEW_DEVIATION_MAX = 7;

export async function classifyLaunchMediaDerivative(input: {
  buffer: Buffer | Uint8Array;
  width: number;
  height: number;
  abortSignal?: AbortSignal;
}): Promise<LaunchMediaQualityResult> {
  input.abortSignal?.throwIfAborted();

  if (!meetsLaunchMediaQuality(input)) {
    return result("reject", "launch_dimensions", emptyMetrics());
  }

  const { data, info } = await sharp(input.buffer, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  })
    .resize({
      width: SAMPLE_SIDE,
      height: SAMPLE_SIDE,
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.nearest,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  input.abortSignal?.throwIfAborted();

  const channels = info.channels;
  const sampledPixels = info.width * info.height;
  let visiblePixels = 0;
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  const luminanceBins = new Set<number>();
  const colorBins = new Set<number>();

  for (let offset = 0; offset < data.length; offset += channels) {
    const alpha = data[offset + 3] ?? 255;
    if (alpha < 8) continue;

    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? red;
    const blue = data[offset + 2] ?? red;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    visiblePixels += 1;
    luminanceSum += luminance;
    luminanceSquareSum += luminance * luminance;
    luminanceBins.add(Math.min(15, Math.floor(luminance / 16)));
    colorBins.add(
      (Math.floor(red / 32) << 6) |
        (Math.floor(green / 32) << 3) |
        Math.floor(blue / 32),
    );
  }

  const visibleFraction =
    sampledPixels === 0 ? 0 : visiblePixels / sampledPixels;
  const meanLuminance = visiblePixels === 0 ? 0 : luminanceSum / visiblePixels;
  const variance =
    visiblePixels === 0
      ? 0
      : Math.max(
          0,
          luminanceSquareSum / visiblePixels - meanLuminance * meanLuminance,
        );
  const metrics = {
    sampledPixels,
    visibleFraction: rounded(visibleFraction),
    meanLuminance: rounded(meanLuminance),
    luminanceDeviation: rounded(Math.sqrt(variance)),
    occupiedLuminanceBins: luminanceBins.size,
    occupiedColorBins: colorBins.size,
  };

  if (visibleFraction < MIN_VISIBLE_FRACTION) {
    return result("reject", "fully_transparent", metrics);
  }
  if (
    metrics.meanLuminance <= DARK_REVIEW_MEAN_MAX &&
    metrics.luminanceDeviation > FLAT_DEVIATION_MAX &&
    metrics.luminanceDeviation <= DARK_REVIEW_DEVIATION_MAX
  ) {
    return result("review_required", "ambiguous_dark_low_contrast", metrics);
  }
  if (metrics.luminanceDeviation >= 80 && metrics.occupiedColorBins <= 12) {
    return result("review_required", "ambiguous_dark_low_contrast", metrics);
  }
  if (
    metrics.luminanceDeviation <= FLAT_DEVIATION_MAX ||
    metrics.occupiedLuminanceBins <= FLAT_BIN_MAX ||
    metrics.occupiedColorBins <= 4
  ) {
    return result("reject", "flat_color", metrics);
  }
  return result("pass", "quality_pass", metrics);
}

function result(
  qualityClass: LaunchMediaQualityClass,
  reason: LaunchMediaQualityReason,
  metrics: LaunchMediaQualityResult["metrics"],
): LaunchMediaQualityResult {
  return {
    policyVersion: LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
    qualityClass,
    reason,
    metrics,
  };
}

function emptyMetrics(): LaunchMediaQualityResult["metrics"] {
  return {
    sampledPixels: 0,
    visibleFraction: 0,
    meanLuminance: 0,
    luminanceDeviation: 0,
    occupiedLuminanceBins: 0,
    occupiedColorBins: 0,
  };
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
