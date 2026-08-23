import {
  assertClientFinalWebp,
  CLIENT_WEBP_SOURCE_MAX_BYTES,
  createClientWebpEncodingPlan,
  parseClientImageHeader,
  type ClientImageHeader,
} from "./client-webp-policy";

export interface RgbaImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface JournalImageCodecResult {
  bytes: ArrayBuffer;
  width: number;
  height: number;
  sha256: string;
  sourceKind: ClientImageHeader["kind"];
  lossless: boolean;
  quality: number;
}

const HEADER_PROBE_BYTES = 4 * 1024 * 1024;

export async function encodeJournalImageToWebp(
  source: Blob,
  onPhase: (phase: "decoding" | "encoding") => void,
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

  onPhase("decoding");
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
    const { default: resize } = await import("@jsquash/resize");
    decoded = await resize(asImageData(decoded), {
      width: preOrientationWidth,
      height: preOrientationHeight,
      method: "lanczos3",
      premultiply: true,
      linearRGB: true,
    });
  }
  const oriented = orientRgbaPixels(decoded, plan.orientation);

  onPhase("encoding");
  const { default: encodeWebp } = await import("@jsquash/webp/encode.js");
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
  return {
    bytes,
    width: oriented.width,
    height: oriented.height,
    sha256: await sha256Base64(bytes),
    sourceKind: header.kind,
    lossless: plan.lossless,
    quality: plan.quality,
  };
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
