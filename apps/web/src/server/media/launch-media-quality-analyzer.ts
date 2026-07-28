import "server-only";

import sharp from "sharp";

import { meetsLaunchMediaQuality } from "@/lib/media/image-limits";
import {
  LAUNCH_MEDIA_QUALITY_MAX_SAMPLED_PIXELS,
  LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
  LAUNCH_MEDIA_QUALITY_SAMPLE_SIDE,
  type LaunchMediaQualityMetrics,
  type LaunchMediaQualityReason,
  type LaunchMediaQualityResult,
} from "@/lib/media/launch-media-quality";

const MIN_VISIBLE_FRACTION = 0.01;
const FLAT_DEVIATION_MAX = 1.5;
const FLAT_ENTROPY_MAX = 0.3;
const FLAT_COLOR_BIN_MAX = 4;
const DARK_REVIEW_MEAN_MAX = 22;
const DARK_REVIEW_DEVIATION_MAX = 5;
const DARK_REVIEW_ENTROPY_MAX = 1.4;

export async function classifyLaunchMediaDerivative(input: {
  buffer: Buffer | Uint8Array;
  width: number;
  height: number;
  abortSignal?: AbortSignal;
}): Promise<LaunchMediaQualityResult> {
  input.abortSignal?.throwIfAborted();
  if (!meetsLaunchMediaQuality(input)) {
    return result("rejected", "launch_dimensions", emptyMetrics());
  }

  let data: Buffer;
  let width: number;
  let height: number;
  let channels: number;
  try {
    const sampled = await sharp(input.buffer, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .resize({
        width: LAUNCH_MEDIA_QUALITY_SAMPLE_SIDE,
        height: LAUNCH_MEDIA_QUALITY_SAMPLE_SIDE,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = sampled.data;
    width = sampled.info.width;
    height = sampled.info.height;
    channels = sampled.info.channels;
  } catch {
    input.abortSignal?.throwIfAborted();
    return result("rejected", "decode_failed", emptyMetrics());
  }
  input.abortSignal?.throwIfAborted();

  const sampledPixels = width * height;
  if (sampledPixels > LAUNCH_MEDIA_QUALITY_MAX_SAMPLED_PIXELS) {
    throw new Error("Launch media sample exceeded its closed pixel budget.");
  }

  let visiblePixels = 0;
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  const luminanceHistogram = Array<number>(16).fill(0);
  const colorBins = new Set<number>();
  const luminances = new Float64Array(sampledPixels);

  for (let pixel = 0; pixel < sampledPixels; pixel += 1) {
    const offset = pixel * channels;
    const alpha = data[offset + 3] ?? 255;
    if (alpha < 8) {
      luminances[pixel] = Number.NaN;
      continue;
    }
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? red;
    const blue = data[offset + 2] ?? red;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminances[pixel] = luminance;
    visiblePixels += 1;
    luminanceSum += luminance;
    luminanceSquareSum += luminance * luminance;
    luminanceHistogram[Math.min(15, Math.floor(luminance / 16))] += 1;
    colorBins.add(
      (Math.floor(red / 32) << 6) |
        (Math.floor(green / 32) << 3) |
        Math.floor(blue / 32),
    );
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = luminances[index]!;
      if (!Number.isFinite(value)) continue;
      if (x > 0 && Number.isFinite(luminances[index - 1])) {
        edgeSum += Math.abs(value - luminances[index - 1]!);
        edgeCount += 1;
      }
      if (y > 0 && Number.isFinite(luminances[index - width])) {
        edgeSum += Math.abs(value - luminances[index - width]!);
        edgeCount += 1;
      }
    }
  }

  const meanLuminance = visiblePixels === 0 ? 0 : luminanceSum / visiblePixels;
  const variance =
    visiblePixels === 0
      ? 0
      : Math.max(
          0,
          luminanceSquareSum / visiblePixels - meanLuminance * meanLuminance,
        );
  const luminanceEntropy = luminanceHistogram.reduce((entropy, count) => {
    if (count === 0 || visiblePixels === 0) return entropy;
    const probability = count / visiblePixels;
    return entropy - probability * Math.log2(probability);
  }, 0);
  const metrics: LaunchMediaQualityMetrics = {
    sampledPixels,
    visibleFraction: rounded(sampledPixels === 0 ? 0 : visiblePixels / sampledPixels),
    meanLuminance: rounded(meanLuminance),
    luminanceDeviation: rounded(Math.sqrt(variance)),
    luminanceEntropy: rounded(luminanceEntropy),
    edgeEnergy: rounded(edgeCount === 0 ? 0 : edgeSum / edgeCount),
    occupiedColorBins: colorBins.size,
  };

  if (metrics.visibleFraction < MIN_VISIBLE_FRACTION) {
    return result("rejected", "fully_transparent", metrics);
  }
  if (
    metrics.luminanceDeviation <= FLAT_DEVIATION_MAX ||
    metrics.luminanceEntropy <= FLAT_ENTROPY_MAX
  ) {
    return result("rejected", "flat_color", metrics);
  }
  if (
    metrics.meanLuminance <= DARK_REVIEW_MEAN_MAX &&
    metrics.luminanceDeviation <= DARK_REVIEW_DEVIATION_MAX &&
    metrics.luminanceEntropy <= DARK_REVIEW_ENTROPY_MAX
  ) {
    return result("review_required", "ambiguous_dark_low_contrast", metrics);
  }
  if (
    metrics.luminanceDeviation >= 80 &&
    metrics.occupiedColorBins <= 12
  ) {
    return result("review_required", "ambiguous_dark_low_contrast", metrics);
  }
  if (metrics.occupiedColorBins <= FLAT_COLOR_BIN_MAX) {
    return result("rejected", "flat_color", metrics);
  }
  return result("accepted", "quality_accepted", metrics);
}

function result(
  qualityClass: LaunchMediaQualityResult["qualityClass"],
  reason: LaunchMediaQualityReason,
  metrics: LaunchMediaQualityMetrics,
): LaunchMediaQualityResult {
  return {
    policyVersion: LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
    qualityClass,
    reasonCodes: [reason],
    metrics,
  };
}

function emptyMetrics(): LaunchMediaQualityMetrics {
  return {
    sampledPixels: 0,
    visibleFraction: 0,
    meanLuminance: 0,
    luminanceDeviation: 0,
    luminanceEntropy: 0,
    edgeEnergy: 0,
    occupiedColorBins: 0,
  };
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
