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

export class MediaLaunchQualityError extends Error {
  readonly code = "media_launch_quality_rejected" as const;

  constructor() {
    super(
      "Image is too small for launch media. Upload a clearer photo or save without it.",
    );
    this.name = "MediaLaunchQualityError";
  }
}

export async function processQuarantinedImage(asset: MediaAsset) {
  const original = await getQuarantineObjectBuffer(
    asset.quarantine_key,
    MAX_COMPOSER_IMAGE_BYTES,
  );
  const derivative = await createPublicImageDerivative(original);
  if (
    !meetsLaunchMediaQuality({
      width: derivative.width,
      height: derivative.height,
    })
  ) {
    throw new MediaLaunchQualityError();
  }

  const derivativeKey = asset.quarantine_key
    .replace(/^quarantine\//, "derivatives/")
    .replace(/\.[^.]+$/, `.${derivative.extension}`);

  await putPublicDerivativeObject(
    derivativeKey,
    derivative.buffer,
    derivative.contentType,
  );

  return {
    derivativeKey,
    publicUrl: getPublicDerivativeUrl(derivativeKey),
    intrinsicWidth: derivative.width,
    intrinsicHeight: derivative.height,
  };
}
