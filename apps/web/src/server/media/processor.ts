import "server-only";

import {
  getPublicDerivativeUrl,
  getQuarantineObjectBuffer,
  putPublicDerivativeObject,
} from "@/lib/storage";
import type { MediaAsset } from "@/db/schema";
import { MAX_COMPOSER_IMAGE_BYTES } from "@/lib/media/image-limits";
import { createPublicImageDerivative } from "./derivatives";

export async function processQuarantinedImage(asset: MediaAsset) {
  const original = await getQuarantineObjectBuffer(
    asset.quarantine_key,
    MAX_COMPOSER_IMAGE_BYTES,
  );
  const derivative = await createPublicImageDerivative(original);
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
  };
}
