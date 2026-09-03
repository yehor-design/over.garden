import {
  assertClientFinalWebp,
  CLIENT_WEBP_FALLBACK_MAX_PIXELS,
  CLIENT_WEBP_PLACEHOLDER_LONG_EDGE,
  CLIENT_WEBP_PLACEHOLDER_MAX_BYTES,
  CLIENT_WEBP_PREVIEW_LONG_EDGE,
  CLIENT_WEBP_PREVIEW_QUALITY,
  CLIENT_WEBP_SOURCE_MAX_BYTES,
  createClientWebpEncodingPlan,
  parseClientImageHeader,
  scaledVariantSize,
  type ClientImageHeader,
  type ClientWebpEncodingPlan,
} from "./client-webp-policy";

export interface RgbaImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface EncodedJournalImageVariant {
  longEdge: number;
  width: number;
  height: number;
  bytes: ArrayBuffer;
  sha256: string;
}

export interface JournalImageCodecResult {
  /** The primary WebP: long edge 2560 (or the source size below that). */
  bytes: ArrayBuffer;
  width: number;
  height: number;
  sha256: string;
  /** Smaller variants the source was large enough for, largest first. */
  variants: EncodedJournalImageVariant[];
  /** A 16 px WebP as a data URI (≤ 400 bytes), or null when none fit. */
  placeholderDataUri: string | null;
  sourceKind: ClientImageHeader["kind"];
  lossless: boolean;
  quality: number;
  codecPath: "native" | "fallback";
}

export interface JournalImagePreview {
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

export interface JournalImageCodecCallbacks {
  onPhase(phase: "decoding" | "encoding"): void;
  onPreview?(preview: JournalImagePreview): void;
}

const HEADER_PROBE_BYTES = 4 * 1024 * 1024;
const PLACEHOLDER_QUALITIES = [0.5, 0.3, 0.1] as const;

/**
 * ADR-0022, D2. Native first: the browser decodes (downscaling while it
 * decodes, so a 200 MP source never materialises) and encodes WebP through
 * `OffscreenCanvas`; the jsquash/libheif path remains only for browsers
 * without native WebP encoding, for lossless plans (PNG or alpha), and for
 * HEIC where the browser cannot decode it. The preview is posted from the
 * decoded bitmap before the final encode starts.
 */
export async function encodeJournalImage(
  source: Blob,
  callbacks: JournalImageCodecCallbacks,
): Promise<JournalImageCodecResult> {
  if (source.size <= 0 || source.size > CLIENT_WEBP_SOURCE_MAX_BYTES) {
    throw new Error("source_bytes_exceeded");
  }
  const headerBytes = new Uint8Array(
    await source.slice(0, HEADER_PROBE_BYTES).arrayBuffer(),
  );
  const header = parseClientImageHeader(headerBytes);
  const plan = createClientWebpEncodingPlan({
    source: header,
    sourceBytes: source.size,
  });

  callbacks.onPhase("decoding");
  const native = await encodeNatively(source, header, plan, callbacks).catch(
    () => null,
  );
  if (native) return native;
  if (plan.nativeDecodeRequired) throw new Error("native_decode_unavailable");
  return encodeWithFallback(source, header, plan, callbacks);
}

/** @deprecated Kept for the codec smoke script; prefer `encodeJournalImage`. */
export async function encodeJournalImageToWebp(
  source: Blob,
  onPhase: (phase: "decoding" | "encoding") => void,
): Promise<JournalImageCodecResult> {
  return encodeJournalImage(source, { onPhase });
}

let nativeWebpProbe: Promise<boolean> | null = null;

/** One 1×1 probe per worker: the browser must really return `image/webp`. */
export function canEncodeWebpNatively(): Promise<boolean> {
  nativeWebpProbe ??= (async () => {
    if (
      typeof OffscreenCanvas === "undefined" ||
      typeof createImageBitmap !== "function"
    ) {
      return false;
    }
    try {
      const canvas = new OffscreenCanvas(1, 1);
      const context = canvas.getContext("2d");
      if (!context) return false;
      context.fillStyle = "black";
      context.fillRect(0, 0, 1, 1);
      const blob = await canvas.convertToBlob({
        type: "image/webp",
        quality: 0.8,
      });
      return blob.type === "image/webp" && blob.size > 0;
    } catch {
      return false;
    }
  })();
  return nativeWebpProbe;
}

/** Test seam: forget the probe result. */
export function resetNativeWebpProbeForTests() {
  nativeWebpProbe = null;
}

async function encodeNatively(
  source: Blob,
  header: ClientImageHeader,
  plan: ClientWebpEncodingPlan,
  callbacks: JournalImageCodecCallbacks,
): Promise<JournalImageCodecResult | null> {
  if (plan.lossless) return null;
  if (!(await canEncodeWebpNatively())) return null;
  const bitmap = await createImageBitmap(source, {
    imageOrientation: "from-image",
    resizeWidth: plan.outputWidth,
    resizeHeight: plan.outputHeight,
    resizeQuality: "high",
  });
  try {
    if (bitmap.width !== plan.outputWidth || bitmap.height !== plan.outputHeight) {
      return null;
    }
    const primary = new OffscreenCanvas(plan.outputWidth, plan.outputHeight);
    const context = primary.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);

    if (callbacks.onPreview) {
      const previewSize = scaledVariantSize(
        plan.outputWidth,
        plan.outputHeight,
        CLIENT_WEBP_PREVIEW_LONG_EDGE,
      );
      const preview = await drawScaled(primary, previewSize).convertToBlob({
        type: "image/webp",
        quality: CLIENT_WEBP_PREVIEW_QUALITY / 100,
      });
      if (preview.type === "image/webp") {
        callbacks.onPreview({
          bytes: await preview.arrayBuffer(),
          width: previewSize.width,
          height: previewSize.height,
        });
      }
    }

    callbacks.onPhase("encoding");
    const primaryBlob = await primary.convertToBlob({
      type: "image/webp",
      quality: plan.quality / 100,
    });
    if (primaryBlob.type !== "image/webp") return null;
    const bytes = await primaryBlob.arrayBuffer();
    assertClientFinalWebp({
      type: "image/webp",
      size: bytes.byteLength,
      width: plan.outputWidth,
      height: plan.outputHeight,
    });

    const variants: EncodedJournalImageVariant[] = [];
    for (const longEdge of plan.variantLongEdges) {
      const size = scaledVariantSize(plan.outputWidth, plan.outputHeight, longEdge);
      const blob = await drawScaled(primary, size).convertToBlob({
        type: "image/webp",
        quality: plan.quality / 100,
      });
      if (blob.type !== "image/webp") return null;
      const variantBytes = await blob.arrayBuffer();
      variants.push({
        longEdge,
        width: size.width,
        height: size.height,
        bytes: variantBytes,
        sha256: await sha256Base64(variantBytes),
      });
    }

    return {
      bytes,
      width: plan.outputWidth,
      height: plan.outputHeight,
      sha256: await sha256Base64(bytes),
      variants,
      placeholderDataUri: await encodePlaceholderNatively(primary),
      sourceKind: header.kind,
      lossless: false,
      quality: plan.quality,
      codecPath: "native",
    };
  } finally {
    bitmap.close();
  }
}

function drawScaled(
  source: OffscreenCanvas,
  size: { width: number; height: number },
) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("native_canvas_unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

async function encodePlaceholderNatively(primary: OffscreenCanvas) {
  const size = scaledVariantSize(
    primary.width,
    primary.height,
    CLIENT_WEBP_PLACEHOLDER_LONG_EDGE,
  );
  const canvas = drawScaled(primary, size);
  for (const quality of PLACEHOLDER_QUALITIES) {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality });
    if (blob.type !== "image/webp") return null;
    const bytes = await blob.arrayBuffer();
    if (bytes.byteLength <= CLIENT_WEBP_PLACEHOLDER_MAX_BYTES) {
      return toWebpDataUri(bytes);
    }
  }
  return null;
}

async function encodeWithFallback(
  source: Blob,
  header: ClientImageHeader,
  plan: ClientWebpEncodingPlan,
  callbacks: JournalImageCodecCallbacks,
): Promise<JournalImageCodecResult> {
  const codedWidth = header.codedWidth ?? header.width;
  const codedHeight = header.codedHeight ?? header.height;
  if (codedWidth * codedHeight > CLIENT_WEBP_FALLBACK_MAX_PIXELS) {
    throw new Error("source_pixels_exceeded");
  }
  let decoded = await decodeSource(await source.arrayBuffer(), header.kind);
  if (decoded.width !== header.width || decoded.height !== header.height) {
    throw new Error("decoded_dimensions_mismatch");
  }

  const swapsAxes = plan.orientation >= 5 && plan.orientation <= 8;
  const preOrientationWidth = swapsAxes ? plan.outputHeight : plan.outputWidth;
  const preOrientationHeight = swapsAxes ? plan.outputWidth : plan.outputHeight;
  if (
    decoded.width !== preOrientationWidth ||
    decoded.height !== preOrientationHeight
  ) {
    decoded = await resizeRgba(decoded, preOrientationWidth, preOrientationHeight);
  }
  const oriented = orientRgbaPixels(decoded, plan.orientation);
  const { default: encodeWebp } = await import("@jsquash/webp/encode.js");

  if (callbacks.onPreview) {
    const previewSize = scaledVariantSize(
      oriented.width,
      oriented.height,
      CLIENT_WEBP_PREVIEW_LONG_EDGE,
    );
    const previewPixels =
      previewSize.width === oriented.width
        ? oriented
        : await resizeRgba(oriented, previewSize.width, previewSize.height);
    const previewBytes = await encodeWebp(asImageData(previewPixels), {
      quality: CLIENT_WEBP_PREVIEW_QUALITY,
      lossless: 0,
      alpha_quality: 100,
      exact: 0,
      method: 2,
    });
    callbacks.onPreview({
      bytes: previewBytes,
      width: previewPixels.width,
      height: previewPixels.height,
    });
  }

  callbacks.onPhase("encoding");
  const bytes = await encodeWebp(asImageData(oriented), {
    quality: plan.quality,
    lossless: plan.lossless ? 1 : 0,
    alpha_quality: 100,
    exact: plan.lossless ? 1 : 0,
    method: 4,
  });
  assertClientFinalWebp({
    type: "image/webp",
    size: bytes.byteLength,
    width: oriented.width,
    height: oriented.height,
  });

  const variants: EncodedJournalImageVariant[] = [];
  for (const longEdge of plan.variantLongEdges) {
    const size = scaledVariantSize(oriented.width, oriented.height, longEdge);
    const pixels = await resizeRgba(oriented, size.width, size.height);
    const variantBytes = await encodeWebp(asImageData(pixels), {
      quality: plan.quality,
      lossless: plan.lossless ? 1 : 0,
      alpha_quality: 100,
      exact: plan.lossless ? 1 : 0,
      method: 4,
    });
    variants.push({
      longEdge,
      width: size.width,
      height: size.height,
      bytes: variantBytes,
      sha256: await sha256Base64(variantBytes),
    });
  }

  let placeholderDataUri: string | null = null;
  const placeholderSize = scaledVariantSize(
    oriented.width,
    oriented.height,
    CLIENT_WEBP_PLACEHOLDER_LONG_EDGE,
  );
  const placeholderPixels = await resizeRgba(
    oriented,
    placeholderSize.width,
    placeholderSize.height,
  );
  for (const quality of PLACEHOLDER_QUALITIES) {
    const placeholderBytes = await encodeWebp(asImageData(placeholderPixels), {
      quality: Math.round(quality * 100),
      lossless: 0,
      alpha_quality: 50,
      exact: 0,
      method: 2,
    });
    if (placeholderBytes.byteLength <= CLIENT_WEBP_PLACEHOLDER_MAX_BYTES) {
      placeholderDataUri = toWebpDataUri(placeholderBytes);
      break;
    }
  }

  return {
    bytes,
    width: oriented.width,
    height: oriented.height,
    sha256: await sha256Base64(bytes),
    variants,
    placeholderDataUri,
    sourceKind: header.kind,
    lossless: plan.lossless,
    quality: plan.quality,
    codecPath: "fallback",
  };
}

async function resizeRgba(
  source: RgbaImageLike,
  width: number,
  height: number,
): Promise<RgbaImageLike> {
  const { default: resize } = await import("@jsquash/resize");
  return resize(asImageData(source), {
    width,
    height,
    method: "lanczos3",
    premultiply: true,
    linearRGB: true,
  });
}

export function orientRgbaPixels(
  source: RgbaImageLike,
  orientation: number,
): RgbaImageLike {
  if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8) {
    throw new Error("source_orientation_invalid");
  }
  if (orientation === 1) return source;

  const swapsAxes = orientation >= 5;
  const width = swapsAxes ? source.height : source.width;
  const height = swapsAxes ? source.width : source.height;
  const data = new Uint8ClampedArray(source.data.length);
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const [targetX, targetY] = orientedCoordinate(
        sourceX,
        sourceY,
        source.width,
        source.height,
        orientation,
      );
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (targetY * width + targetX) * 4;
      data.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { data, width, height };
}

function orientedCoordinate(
  x: number,
  y: number,
  width: number,
  height: number,
  orientation: number,
): [number, number] {
  switch (orientation) {
    case 2:
      return [width - 1 - x, y];
    case 3:
      return [width - 1 - x, height - 1 - y];
    case 4:
      return [x, height - 1 - y];
    case 5:
      return [y, x];
    case 6:
      return [height - 1 - y, x];
    case 7:
      return [height - 1 - y, width - 1 - x];
    case 8:
      return [y, width - 1 - x];
    default:
      return [x, y];
  }
}

async function decodeSource(
  bytes: ArrayBuffer,
  kind: ClientImageHeader["kind"],
): Promise<RgbaImageLike> {
  if (kind === "jpeg") {
    const { default: decodeJpeg } = await import("@jsquash/jpeg/decode.js");
    return decodeJpeg(bytes, { preserveOrientation: false });
  }
  if (kind === "png") {
    const { default: decodePng } = await import("@jsquash/png/decode.js");
    return decodePng(bytes);
  }
  if (kind === "webp") {
    const { default: decodeWebp } = await import("@jsquash/webp/decode.js");
    return decodeWebp(bytes);
  }
  return decodeHeif(bytes);
}

async function decodeHeif(bytes: ArrayBuffer): Promise<RgbaImageLike> {
  const { default: createLibheif } = await import(
    "libheif-js/libheif-wasm/libheif-bundle.mjs"
  );
  const libheif = await createLibheif();
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(bytes));
  const image = images[0];
  if (!image) throw new Error("heif_decode_failed");
  const width = image.get_width();
  const height = image.get_height();
  const output = new ImageData(width, height);
  await new Promise<void>((resolve, reject) => {
    image.display(output, (displayed) => {
      if (!displayed) reject(new Error("heif_decode_failed"));
      else resolve();
    });
  });
  image.free?.();
  return output;
}

function asImageData(value: RgbaImageLike): ImageData {
  if (value instanceof ImageData) return value;
  return new ImageData(
    new Uint8ClampedArray(value.data),
    value.width,
    value.height,
  );
}

async function sha256Base64(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function toWebpDataUri(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return `data:image/webp;base64,${btoa(binary)}`;
}
