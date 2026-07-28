import "server-only";

import sharp from "sharp";

export const SAFE_MEDIA_ADMISSION_POLICY_VERSION = "ove244.safe-media.v1";
export const SAFE_MEDIA_PROCESSING_LEASE_SECONDS = 90;
export const SAFE_MEDIA_PROVIDER_TIMEOUT_MS = 5_000;
export const SAFE_MEDIA_PROCESSING_TIMEOUT_MS = 30_000;

export type SafeMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic";

export class SafeMediaAdmissionError extends Error {
  constructor(
    readonly code:
      | "unsupported_actual_type"
      | "declared_actual_mismatch"
      | "polyglot_rejected"
      | "resource_limit",
  ) {
    super("This image could not be safely admitted. Upload another photo or save without it.");
    this.name = "SafeMediaAdmissionError";
  }
}

export async function admitSafeMediaBytes(
  bytes: Buffer,
  declaredType: string,
): Promise<SafeMediaType> {
  const detected = detectSafeMediaSignature(bytes);
  if (!detected) throw new SafeMediaAdmissionError("unsupported_actual_type");
  if (detected !== declaredType) {
    throw new SafeMediaAdmissionError("declared_actual_mismatch");
  }
  if (!hasClosedContainer(bytes, detected)) {
    throw new SafeMediaAdmissionError("polyglot_rejected");
  }

  try {
    const metadata = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1 ||
      metadata.width * metadata.height > 40_000_000
    ) {
      throw new SafeMediaAdmissionError("resource_limit");
    }
  } catch (error) {
    if (error instanceof SafeMediaAdmissionError) throw error;
    throw new SafeMediaAdmissionError("resource_limit");
  }
  return detected;
}

export function detectSafeMediaType(bytes: Uint8Array): SafeMediaType | null {
  const detected = detectSafeMediaSignature(bytes);
  return detected && hasClosedContainer(bytes, detected) ? detected : null;
}

function detectSafeMediaSignature(
  bytes: Uint8Array,
): SafeMediaType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP"
  ) return "image/webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

function hasClosedContainer(
  bytes: Uint8Array,
  mediaType: SafeMediaType,
): boolean {
  switch (mediaType) {
    case "image/jpeg":
      return (
        bytes.length >= 4 &&
        bytes[bytes.length - 2] === 0xff &&
        bytes[bytes.length - 1] === 0xd9
      );
    case "image/png":
      return (
        bytes.length >= 20 &&
        readUint32Be(bytes, bytes.length - 12) === 0 &&
        ascii(bytes, bytes.length - 8, bytes.length - 4) === "IEND" &&
        readUint32Be(bytes, bytes.length - 4) === 0xae426082
      );
    case "image/webp":
      return (
        bytes.length >= 12 &&
        readUint32Le(bytes, 4) + 8 === bytes.length
      );
    case "image/heic":
      return hasClosedIsoBmffContainer(bytes);
  }
}

function hasClosedIsoBmffContainer(bytes: Uint8Array): boolean {
  let offset = 0;
  let boxCount = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) return false;
    const size32 = readUint32Be(bytes, offset);
    const type = ascii(bytes, offset + 4, offset + 8);
    let size = size32;
    let headerSize = 8;
    if (size32 === 1) {
      if (bytes.length - offset < 16) return false;
      const high = readUint32Be(bytes, offset + 8);
      const low = readUint32Be(bytes, offset + 12);
      const extended = high * 2 ** 32 + low;
      if (!Number.isSafeInteger(extended)) return false;
      size = extended;
      headerSize = 16;
    } else if (size32 === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || offset + size > bytes.length) return false;
    if (boxCount === 0 && type !== "ftyp") return false;
    offset += size;
    boxCount += 1;
  }
  return boxCount > 0 && offset === bytes.length;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 2 ** 24 +
    bytes[offset + 1] * 2 ** 16 +
    bytes[offset + 2] * 2 ** 8 +
    bytes[offset + 3]
  );
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 2 ** 8 +
    bytes[offset + 2] * 2 ** 16 +
    bytes[offset + 3] * 2 ** 24
  );
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
