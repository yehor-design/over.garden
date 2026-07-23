import "server-only";

import sharp from "sharp";
import { MAX_IMAGE_INPUT_PIXELS } from "@/lib/media/image-limits";

export interface PublicImageDerivativeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface PublicImageDerivative {
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
  width: number;
  height: number;
}

export async function createPublicImageDerivative(
  input: Buffer | Uint8Array | ArrayBuffer,
  {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 82,
  }: PublicImageDerivativeOptions = {},
): Promise<PublicImageDerivative> {
  const { data, info } = await sharp(input, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
  })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const width = info.width ?? 0;
  const height = info.height ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("Processed derivative is missing intrinsic dimensions.");
  }

  return {
    buffer: data,
    contentType: "image/webp",
    extension: "webp",
    width,
    height,
  };
}
