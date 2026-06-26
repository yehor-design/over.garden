import "server-only";

import sharp from "sharp";

export interface PublicImageDerivativeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface PublicImageDerivative {
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
}

export async function createPublicImageDerivative(
  input: Buffer | Uint8Array | ArrayBuffer,
  {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 82,
  }: PublicImageDerivativeOptions = {},
): Promise<PublicImageDerivative> {
  const buffer = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer();

  return {
    buffer,
    contentType: "image/webp",
    extension: "webp",
  };
}
