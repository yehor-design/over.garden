import "server-only";

import {
  deleteQuarantineObject,
  getPublicDerivativeUrl,
  getQuarantineObjectBuffer,
  putPublicDerivativeObject,
} from "@/lib/storage";
import type { MediaAsset } from "@/db/schema";
import { createPublicImageDerivative } from "./derivatives";

export async function processQuarantinedImage(asset: MediaAsset) {
  const original = await getQuarantineObjectBuffer(asset.quarantine_key);
  const derivative = await createPublicImageDerivative(original);
  const derivativeKey = asset.quarantine_key
    .replace(/^quarantine\//, "derivatives/")
    .replace(/\.[^.]+$/, `.${derivative.extension}`);

  await putPublicDerivativeObject(
    derivativeKey,
    derivative.buffer,
    derivative.contentType,
  );
  await deleteQuarantineObject(asset.quarantine_key);

  return {
    derivativeKey,
    publicUrl: getPublicDerivativeUrl(derivativeKey),
  };
}
