import "server-only";

import {
  getPublicDerivativeUrl,
  getQuarantineObjectBuffer,
  putPublicDerivativeObject,
} from "@/lib/storage";
import type { MediaAsset } from "@/db/schema";
import {
  MAX_COMPOSER_IMAGE_BYTES,
  meetsLaunchMediaQuality,
} from "@/lib/media/image-limits";
import { createPublicImageDerivative } from "./derivatives";
import {
  classifyLaunchMediaDerivative,
  type LaunchMediaQualityResult,
} from "./launch-media-quality";
import {
  admitSafeMediaBytes,
  SafeMediaAdmissionError,
} from "./safe-media-admission";

export class MediaLaunchQualityError extends Error {
  readonly code = "media_launch_quality_rejected" as const;
  readonly quality: LaunchMediaQualityResult;
  readonly qualityClass: LaunchMediaQualityResult["qualityClass"];

  constructor(quality: LaunchMediaQualityResult) {
    super(
      "This photo cannot be published safely. Choose another photo or save without it.",
    );
    this.name = "MediaLaunchQualityError";
    this.quality = quality;
    this.qualityClass = quality.qualityClass;
  }
}

export async function processQuarantinedImage(
  asset: MediaAsset,
  abortSignal?: AbortSignal,
) {
  const original = await getQuarantineObjectBuffer(
    asset.quarantine_key,
    MAX_COMPOSER_IMAGE_BYTES,
    abortSignal,
  );
  if (!asset.declared_media_type || !asset.public_object_id) {
    throw new Error("Media generation is missing safe admission identity.");
  }
  if (
    asset.declared_size_bytes == null ||
    Number(asset.declared_size_bytes) !== original.byteLength
  ) {
    throw new SafeMediaAdmissionError("resource_limit");
  }
  const admittedMediaType = await admitSafeMediaBytes(
    original,
    asset.declared_media_type,
  );
  const derivative = await createPublicImageDerivative(original);
  if (
    !meetsLaunchMediaQuality({
      width: derivative.width,
      height: derivative.height,
    })
  ) {
    throw new MediaLaunchQualityError({
      policyVersion: "ove231.launch-media-quality.v1",
      qualityClass: "rejected",
      reasonCodes: ["launch_dimensions"],
      metrics: {
        sampledPixels: 0,
        visibleFraction: 0,
        meanLuminance: 0,
        luminanceDeviation: 0,
        luminanceEntropy: 0,
        edgeEnergy: 0,
        occupiedColorBins: 0,
      },
    });
  }
  const quality = await classifyLaunchMediaDerivative({
    buffer: derivative.buffer,
    width: derivative.width,
    height: derivative.height,
    abortSignal,
  });
  if (quality.qualityClass !== "accepted") {
    throw new MediaLaunchQualityError(quality);
  }

  const derivativeKey = `derivatives/${asset.public_object_id}.${derivative.extension}`;

  await putPublicDerivativeObject(
    derivativeKey,
    derivative.buffer,
    derivative.contentType,
    abortSignal,
  );

  return {
    derivativeKey,
    publicUrl: getPublicDerivativeUrl(derivativeKey),
    intrinsicWidth: derivative.width,
    intrinsicHeight: derivative.height,
    admittedMediaType,
    quality,
  };
}
