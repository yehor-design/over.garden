import { describe, expect, it } from "vitest";

import {
  CLIENT_WEBP_FINAL_MAX_BYTES,
  CLIENT_WEBP_LONG_EDGE,
  CLIENT_WEBP_PHOTO_QUALITY,
  CLIENT_WEBP_SOURCE_MAX_BYTES,
  CLIENT_WEBP_FALLBACK_MAX_PIXELS,
  CLIENT_WEBP_PLACEHOLDER_LONG_EDGE,
  CLIENT_WEBP_PLACEHOLDER_MAX_BYTES,
  CLIENT_WEBP_PREVIEW_LONG_EDGE,
  CLIENT_WEBP_SOURCE_MAX_PIXELS,
  planVariantLongEdges,
  scaledVariantSize,
  assertClientFinalWebp,
  createClientWebpEncodingPlan,
  parseClientImageHeader,
} from "./client-webp-policy";

describe("ADR-0019 client WebP policy", () => {
  it("sniffs the closed JPEG, PNG, WebP, HEIC, and HEIF set from bytes", () => {
    expect(parseClientImageHeader(jpegHeader(4032, 3024, 6))).toMatchObject({
      kind: "jpeg",
      width: 4032,
      height: 3024,
      orientation: 6,
    });
    expect(parseClientImageHeader(pngHeader(800, 1200, 6))).toMatchObject({
      kind: "png",
      width: 800,
      height: 1200,
      hasAlpha: true,
    });
    expect(parseClientImageHeader(webpVp8xHeader(1920, 1080, true))).toEqual({
      kind: "webp",
      width: 1920,
      height: 1080,
      orientation: 1,
      hasAlpha: true,
    });
    expect(
      parseClientImageHeader(heifHeader("heic", 3024, 4032)),
    ).toMatchObject({
      kind: "heic",
      width: 3024,
      height: 4032,
    });
    expect(
      parseClientImageHeader(heifHeader("mif1", 1440, 1080)),
    ).toMatchObject({
      kind: "heif",
      width: 1440,
      height: 1080,
    });
  });

  it("does not let a later non-EXIF APP1 segment erase the JPEG orientation", () => {
    const source = jpegHeader(4032, 3024, 6);
    const sof = findMarker(source, 0xc0);
    const xmp = new Uint8Array([
      0xff, 0xe1, 0x00, 0x06, 0x58, 0x4d, 0x50, 0x00,
    ]);
    const combined = new Uint8Array(source.length + xmp.length);
    combined.set(source.subarray(0, sof));
    combined.set(xmp, sof);
    combined.set(source.subarray(sof), sof + xmp.length);

    expect(parseClientImageHeader(combined).orientation).toBe(6);
  });

  it("rejects spoofed, oversized, and decompression-bomb sources before decode", () => {
    expect(() => parseClientImageHeader(new Uint8Array([1, 2, 3]))).toThrow(
      "unsupported_source",
    );
    expect(() =>
      createClientWebpEncodingPlan({
        source: {
          kind: "jpeg",
          width: 25_000,
          height: 20_001,
          orientation: 1,
          hasAlpha: false,
        },
        sourceBytes: CLIENT_WEBP_SOURCE_MAX_BYTES,
      }),
    ).toThrow("source_pixels_exceeded");
    // Above the fallback decoder's ceiling only the browser may decode it.
    expect(
      createClientWebpEncodingPlan({
        source: {
          kind: "jpeg",
          width: 8_001,
          height: 8_000,
          orientation: 1,
          hasAlpha: false,
        },
        sourceBytes: CLIENT_WEBP_SOURCE_MAX_BYTES,
      }),
    ).toMatchObject({ nativeDecodeRequired: true, outputWidth: 2560 });
    expect(() =>
      createClientWebpEncodingPlan({
        source: {
          kind: "jpeg",
          width: 1,
          height: 1,
          orientation: 1,
          hasAlpha: false,
        },
        sourceBytes: CLIENT_WEBP_SOURCE_MAX_BYTES + 1,
      }),
    ).toThrow("source_bytes_exceeded");
    expect(CLIENT_WEBP_SOURCE_MAX_PIXELS).toBe(500_000_000);
    expect(CLIENT_WEBP_FALLBACK_MAX_PIXELS).toBe(64_000_000);
  });

  it("uses the HEIF clean aperture for display dimensions while retaining coded bomb guards", () => {
    expect(parseClientImageHeader(heifCleanApertureHeader())).toMatchObject({
      kind: "heic",
      width: 4,
      height: 3,
      codedWidth: 4,
      codedHeight: 4,
    });
  });

  it("matches libheif display dimensions for an associated quarter-turn rotation", () => {
    expect(parseClientImageHeader(heifCleanApertureHeader(1))).toMatchObject({
      kind: "heic",
      width: 3,
      height: 4,
      codedWidth: 4,
      codedHeight: 4,
      orientation: 1,
    });
  });

  it("applies orientation, never upscales, caps the long edge, and selects the locked encoder mode", () => {
    expect(
      createClientWebpEncodingPlan({
        source: {
          kind: "jpeg",
          width: 4032,
          height: 3024,
          orientation: 6,
          hasAlpha: false,
        },
        sourceBytes: 4_000_000,
      }),
    ).toEqual({
      sourceKind: "jpeg",
      sourceWidth: 4032,
      sourceHeight: 3024,
      orientation: 6,
      outputWidth: 1920,
      outputHeight: 2560,
      lossless: false,
      quality: CLIENT_WEBP_PHOTO_QUALITY,
      variantLongEdges: [1280, 480],
      nativeDecodeRequired: false,
    });

    expect(
      createClientWebpEncodingPlan({
        source: {
          kind: "png",
          width: 640,
          height: 480,
          orientation: 1,
          hasAlpha: true,
        },
        sourceBytes: 30_000,
      }),
    ).toMatchObject({
      outputWidth: 640,
      outputHeight: 480,
      lossless: true,
      quality: 100,
    });
    expect(CLIENT_WEBP_LONG_EDGE).toBe(2560);
    expect(CLIENT_WEBP_PHOTO_QUALITY).toBe(85);
  });

  it("plans only the variants the primary is larger than, and never upscales", () => {
    expect(planVariantLongEdges(2560, 1920)).toEqual([1280, 480]);
    expect(planVariantLongEdges(1280, 960)).toEqual([480]);
    expect(planVariantLongEdges(1281, 100)).toEqual([1280, 480]);
    expect(planVariantLongEdges(480, 320)).toEqual([]);
    expect(scaledVariantSize(2560, 1920, 1280)).toEqual({
      width: 1280,
      height: 960,
    });
    expect(scaledVariantSize(1920, 2560, 480)).toEqual({
      width: 360,
      height: 480,
    });
    expect(scaledVariantSize(3, 2560, 16)).toEqual({ width: 1, height: 16 });
    expect(CLIENT_WEBP_PREVIEW_LONG_EDGE).toBe(480);
    expect(CLIENT_WEBP_PLACEHOLDER_LONG_EDGE).toBe(16);
    expect(CLIENT_WEBP_PLACEHOLDER_MAX_BYTES).toBe(400);
  });

  it("admits only one bounded final WebP artifact", () => {
    expect(() =>
      assertClientFinalWebp({
        type: "image/webp",
        size: CLIENT_WEBP_FINAL_MAX_BYTES,
        width: 2560,
        height: 1920,
      }),
    ).not.toThrow();
    expect(() =>
      assertClientFinalWebp({
        type: "image/jpeg",
        size: 100,
        width: 10,
        height: 10,
      }),
    ).toThrow("final_type_invalid");
    expect(() =>
      assertClientFinalWebp({
        type: "image/webp",
        size: CLIENT_WEBP_FINAL_MAX_BYTES + 1,
        width: 10,
        height: 10,
      }),
    ).toThrow("final_bytes_exceeded");
  });
});

function jpegHeader(width: number, height: number, orientation: number) {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    0x00,
    0x22,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    0x49,
    0x49,
    0x2a,
    0x00,
    0x08,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x12,
    0x01,
    0x03,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}

function pngHeader(width: number, height: number, colorType: number) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes;
}

function webpVp8xHeader(width: number, height: number, alpha: boolean) {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  bytes[20] = alpha ? 0x10 : 0;
  writeUint24Le(bytes, 24, width - 1);
  writeUint24Le(bytes, 27, height - 1);
  return bytes;
}

function heifHeader(brand: string, width: number, height: number) {
  const bytes = new Uint8Array(44);
  new DataView(bytes.buffer).setUint32(0, 24);
  bytes.set(new TextEncoder().encode("ftyp"), 4);
  bytes.set(new TextEncoder().encode(brand), 8);
  bytes.set(new TextEncoder().encode(brand), 16);
  new DataView(bytes.buffer).setUint32(24, 20);
  bytes.set(new TextEncoder().encode("ispe"), 28);
  new DataView(bytes.buffer).setUint32(36, width);
  new DataView(bytes.buffer).setUint32(40, height);
  return bytes;
}

function heifCleanApertureHeader(rotation = 0) {
  const bytes = heifHeader("heic", 4, 4);
  const expanded = new Uint8Array(bytes.length + 36 + (rotation ? 9 : 0));
  expanded.set(bytes);
  const offset = bytes.length;
  new DataView(expanded.buffer).setUint32(offset, 36);
  expanded.set(new TextEncoder().encode("clap"), offset + 4);
  const view = new DataView(expanded.buffer);
  view.setUint32(offset + 8, 4);
  view.setUint32(offset + 12, 1);
  view.setUint32(offset + 16, 3);
  view.setUint32(offset + 20, 1);
  view.setUint32(offset + 24, 0);
  view.setUint32(offset + 28, 1);
  view.setUint32(offset + 32, 0);
  if (rotation) {
    const rotationOffset = offset + 36;
    view.setUint32(rotationOffset, 9);
    expanded.set(new TextEncoder().encode("irot"), rotationOffset + 4);
    expanded[rotationOffset + 8] = rotation;
  }
  return expanded;
}

function writeUint24Le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function findMarker(bytes: Uint8Array, marker: number) {
  for (let index = 0; index + 1 < bytes.length; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === marker) return index;
  }
  throw new Error(`JPEG marker ${marker} was not found.`);
}
