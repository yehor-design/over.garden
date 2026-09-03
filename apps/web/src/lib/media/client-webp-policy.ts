export const CLIENT_WEBP_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
/**
 * A source larger than this is refused outright; anything between the
 * fallback ceiling and this cap must be decoded natively, where the browser
 * downscales during decode instead of materialising the full bitmap.
 */
export const CLIENT_WEBP_SOURCE_MAX_PIXELS = 500_000_000;
/** The JS fallback decoders materialise the whole bitmap; bound them. */
export const CLIENT_WEBP_FALLBACK_MAX_PIXELS = 64_000_000;
export const CLIENT_WEBP_FINAL_MAX_BYTES = 32 * 1024 * 1024;
export const CLIENT_WEBP_LONG_EDGE = 2560;
/** ADR-0022, D2: quality 85, long edge 2560, variants 1280 and 480. */
export const CLIENT_WEBP_PHOTO_QUALITY = 85;
export const CLIENT_WEBP_VARIANT_LONG_EDGES = [1280, 480] as const;
export const CLIENT_WEBP_PREVIEW_LONG_EDGE = 480;
export const CLIENT_WEBP_PREVIEW_QUALITY = 70;
export const CLIENT_WEBP_PLACEHOLDER_LONG_EDGE = 16;
export const CLIENT_WEBP_PLACEHOLDER_MAX_BYTES = 400;
export const CLIENT_WEBP_ENCODE_TIMEOUT_MS = 30_000;
export const CLIENT_WEBP_MEASURED_12MP_BUDGET_MS = 20_000;

export type ClientWebpVariantLongEdge =
  (typeof CLIENT_WEBP_VARIANT_LONG_EDGES)[number];

export type ClientImageSourceKind = "jpeg" | "png" | "webp" | "heic" | "heif";

export interface ClientImageHeader {
  kind: ClientImageSourceKind;
  width: number;
  height: number;
  codedWidth?: number;
  codedHeight?: number;
  orientation: number;
  hasAlpha: boolean;
}

export interface ClientWebpEncodingPlan {
  sourceKind: ClientImageSourceKind;
  sourceWidth: number;
  sourceHeight: number;
  orientation: number;
  outputWidth: number;
  outputHeight: number;
  lossless: boolean;
  quality: number;
  /** Long edges of the smaller variants the source is large enough for. */
  variantLongEdges: ClientWebpVariantLongEdge[];
  /** True above the fallback ceiling: only native decode may handle it. */
  nativeDecodeRequired: boolean;
}

export class ClientWebpPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ClientWebpPolicyError";
  }
}

export function parseClientImageHeader(bytes: Uint8Array): ClientImageHeader {
  if (isJpeg(bytes)) return parseJpegHeader(bytes);
  if (isPng(bytes)) return parsePngHeader(bytes);
  if (isWebp(bytes)) return parseWebpHeader(bytes);
  const heif = parseHeifHeader(bytes);
  if (heif) return heif;
  throw new ClientWebpPolicyError("unsupported_source");
}

export function createClientWebpEncodingPlan(input: {
  source: ClientImageHeader;
  sourceBytes: number;
}): ClientWebpEncodingPlan {
  if (
    !Number.isSafeInteger(input.sourceBytes) ||
    input.sourceBytes <= 0 ||
    input.sourceBytes > CLIENT_WEBP_SOURCE_MAX_BYTES
  ) {
    throw new ClientWebpPolicyError("source_bytes_exceeded");
  }
  const { width, height, orientation } = input.source;
  const codedWidth = input.source.codedWidth ?? width;
  const codedHeight = input.source.codedHeight ?? height;
  if (
    !positiveDimension(width) ||
    !positiveDimension(height) ||
    !positiveDimension(codedWidth) ||
    !positiveDimension(codedHeight) ||
    codedWidth * codedHeight > CLIENT_WEBP_SOURCE_MAX_PIXELS
  ) {
    throw new ClientWebpPolicyError("source_pixels_exceeded");
  }
  const nativeDecodeRequired =
    codedWidth * codedHeight > CLIENT_WEBP_FALLBACK_MAX_PIXELS;
  if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8) {
    throw new ClientWebpPolicyError("source_orientation_invalid");
  }

  const swapsAxes = orientation >= 5 && orientation <= 8;
  const orientedWidth = swapsAxes ? height : width;
  const orientedHeight = swapsAxes ? width : height;
  const scale = Math.min(
    1,
    CLIENT_WEBP_LONG_EDGE / Math.max(orientedWidth, orientedHeight),
  );
  const outputWidth = Math.max(1, Math.round(orientedWidth * scale));
  const outputHeight = Math.max(1, Math.round(orientedHeight * scale));
  const lossless = input.source.kind === "png" || input.source.hasAlpha;
  return {
    sourceKind: input.source.kind,
    sourceWidth: width,
    sourceHeight: height,
    orientation,
    outputWidth,
    outputHeight,
    lossless,
    quality: lossless ? 100 : CLIENT_WEBP_PHOTO_QUALITY,
    variantLongEdges: planVariantLongEdges(outputWidth, outputHeight),
    nativeDecodeRequired,
  };
}

/** Smaller variants only: never upscale, skip a width the source lacks. */
export function planVariantLongEdges(
  outputWidth: number,
  outputHeight: number,
): ClientWebpVariantLongEdge[] {
  const longEdge = Math.max(outputWidth, outputHeight);
  return CLIENT_WEBP_VARIANT_LONG_EDGES.filter((edge) => edge < longEdge);
}

/** The pixel size of an output whose long edge is scaled to `longEdge`. */
export function scaledVariantSize(
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function assertClientFinalWebp(input: {
  type: string;
  size: number;
  width: number;
  height: number;
}): void {
  if (input.type !== "image/webp") {
    throw new ClientWebpPolicyError("final_type_invalid");
  }
  if (
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > CLIENT_WEBP_FINAL_MAX_BYTES
  ) {
    throw new ClientWebpPolicyError("final_bytes_exceeded");
  }
  if (
    !positiveDimension(input.width) ||
    !positiveDimension(input.height) ||
    Math.max(input.width, input.height) > CLIENT_WEBP_LONG_EDGE
  ) {
    throw new ClientWebpPolicyError("final_dimensions_invalid");
  }
}

function parseJpegHeader(bytes: Uint8Array): ClientImageHeader {
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++]!;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 1 >= bytes.length) break;
    const length = readUint16Be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    const segmentStart = offset + 2;
    if (marker === 0xe1) {
      const parsedOrientation = parseExifOrientation(
        bytes.subarray(segmentStart, offset + length),
      );
      if (parsedOrientation !== null) orientation = parsedOrientation;
    }
    if (isJpegStartOfFrame(marker) && length >= 7) {
      height = readUint16Be(bytes, segmentStart + 1);
      width = readUint16Be(bytes, segmentStart + 3);
      break;
    }
    offset += length;
  }
  if (!positiveDimension(width) || !positiveDimension(height)) {
    throw new ClientWebpPolicyError("source_dimensions_unknown");
  }
  return { kind: "jpeg", width, height, orientation, hasAlpha: false };
}

function parsePngHeader(bytes: Uint8Array): ClientImageHeader {
  if (bytes.length < 26 || ascii(bytes, 12, 16) !== "IHDR") {
    throw new ClientWebpPolicyError("source_dimensions_unknown");
  }
  const width = readUint32Be(bytes, 16);
  const height = readUint32Be(bytes, 20);
  if (!positiveDimension(width) || !positiveDimension(height)) {
    throw new ClientWebpPolicyError("source_dimensions_unknown");
  }
  const colorType = bytes[25];
  return {
    kind: "png",
    width,
    height,
    orientation: 1,
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

function parseWebpHeader(bytes: Uint8Array): ClientImageHeader {
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      kind: "webp",
      width: readUint24Le(bytes, 24) + 1,
      height: readUint24Le(bytes, 27) + 1,
      orientation: 1,
      hasAlpha: Boolean(bytes[20]! & 0x10),
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    const width = readUint16Le(bytes, 26) & 0x3fff;
    const height = readUint16Le(bytes, 28) & 0x3fff;
    return {
      kind: "webp",
      width,
      height,
      orientation: 1,
      hasAlpha: false,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits =
      bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return {
      kind: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      orientation: 1,
      hasAlpha: true,
    };
  }
  throw new ClientWebpPolicyError("source_dimensions_unknown");
}

function parseHeifHeader(bytes: Uint8Array): ClientImageHeader | null {
  if (bytes.length < 20 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const brands: string[] = [];
  for (let offset = 8; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
    brands.push(ascii(bytes, offset, offset + 4));
  }
  const heicBrands = new Set(["heic", "heix", "hevc", "hevx"]);
  const heifBrands = new Set(["mif1", "msf1"]);
  const kind = brands.some((brand) => heicBrands.has(brand))
    ? "heic"
    : brands.some((brand) => heifBrands.has(brand))
      ? "heif"
      : null;
  if (!kind) return null;
  let codedWidth = 0;
  let codedHeight = 0;
  for (let offset = 4; offset + 16 <= bytes.length; offset += 1) {
    if (ascii(bytes, offset, offset + 4) !== "ispe") continue;
    codedWidth = readUint32Be(bytes, offset + 8);
    codedHeight = readUint32Be(bytes, offset + 12);
    if (positiveDimension(codedWidth) && positiveDimension(codedHeight)) {
      break;
    }
  }
  if (!positiveDimension(codedWidth) || !positiveDimension(codedHeight)) {
    throw new ClientWebpPolicyError("source_dimensions_unknown");
  }
  let width = codedWidth;
  let height = codedHeight;
  for (let offset = 4; offset + 20 <= bytes.length; offset += 1) {
    if (ascii(bytes, offset, offset + 4) !== "clap") continue;
    const cleanWidth = cleanApertureDimension(
      readUint32Be(bytes, offset + 4),
      readUint32Be(bytes, offset + 8),
    );
    const cleanHeight = cleanApertureDimension(
      readUint32Be(bytes, offset + 12),
      readUint32Be(bytes, offset + 16),
    );
    if (cleanWidth && cleanHeight) {
      width = cleanWidth;
      height = cleanHeight;
      break;
    }
  }
  // libheif applies the HEIF `irot` item transformation while decoding. Keep
  // the policy orientation at 1 (so pixels are not rotated twice), but match
  // the decoded display dimensions before the post-decode consistency check.
  if (heifQuarterTurns(bytes) % 2 === 1) {
    [width, height] = [height, width];
  }
  return {
    kind,
    width,
    height,
    codedWidth,
    codedHeight,
    orientation: 1,
    hasAlpha: false,
  };
}

function heifQuarterTurns(bytes: Uint8Array) {
  for (let offset = 4; offset + 5 <= bytes.length; offset += 1) {
    if (ascii(bytes, offset, offset + 4) !== "irot") continue;
    const boxSize = readUint32Be(bytes, offset - 4);
    if (boxSize >= 9 && offset - 4 + boxSize <= bytes.length) {
      return bytes[offset + 4]! & 0x03;
    }
  }
  return 0;
}

function cleanApertureDimension(numerator: number, denominator: number) {
  if (!positiveDimension(numerator) || !positiveDimension(denominator)) {
    return null;
  }
  const value = numerator / denominator;
  return positiveDimension(value) ? value : null;
}

function parseExifOrientation(segment: Uint8Array): number | null {
  if (
    segment.length < 14 ||
    ascii(segment, 0, 4) !== "Exif" ||
    segment[4] !== 0 ||
    segment[5] !== 0
  )
    return null;
  const tiff = 6;
  const little = ascii(segment, tiff, tiff + 2) === "II";
  const big = ascii(segment, tiff, tiff + 2) === "MM";
  if (!little && !big) return null;
  const view = new DataView(
    segment.buffer,
    segment.byteOffset,
    segment.byteLength,
  );
  const ifdOffset = view.getUint32(tiff + 4, little);
  const start = tiff + ifdOffset;
  if (start + 2 > segment.length) return null;
  const count = view.getUint16(start, little);
  for (let index = 0; index < count; index += 1) {
    const offset = start + 2 + index * 12;
    if (offset + 12 > segment.length) break;
    if (view.getUint16(offset, little) !== 0x0112) continue;
    const value = view.getUint16(offset + 8, little);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return null;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  );
}

function isWebp(bytes: Uint8Array) {
  return (
    bytes.length >= 16 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  );
}

function isJpegStartOfFrame(marker: number) {
  return (
    marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

function positiveDimension(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function readUint16Be(bytes: Uint8Array, offset: number) {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint16Le(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

function readUint32Be(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}
