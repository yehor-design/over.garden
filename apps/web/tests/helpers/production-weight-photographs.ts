import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Page } from "playwright/test";

/**
 * Photographs of the weight production's are (`OVE-469`).
 *
 * A light fixture flatters a page: a 56 kB cover with variants beside cards
 * with nothing in them measured 1.90 s where production, same page, measured
 * 5.74 s. Production's photographs predate the variants, so each is served at
 * its only size with no `srcset`, and the ones the feed shows first weighed
 * these on 2026-09-23: a 94 kB cover, then 103, 147, 209 and 453 kB
 * (`/`, Lighthouse's `network-requests`). These are the same weights, at a
 * photograph's size, made by the browser the way the upload path makes them
 * (ADR-0022 D2) — no private photograph and nothing downloaded.
 */
export const PRODUCTION_WEIGHT_PHOTOGRAPHS = [
  { width: 1600, height: 1200, targetBytes: 94_000 },
  { width: 1600, height: 1200, targetBytes: 103_000 },
  { width: 1600, height: 1200, targetBytes: 147_000 },
  { width: 1600, height: 1200, targetBytes: 209_000 },
  { width: 1600, height: 1200, targetBytes: 453_000 },
] as const;

export interface WeighedPhotograph {
  width: number;
  height: number;
  bytes: number;
  body: Buffer;
}

/**
 * Runs in the page. It is a string so that no transpiler touches it: `tsx`
 * wraps a named inner function in `__name(…)`, which does not exist in a page.
 *
 * A photograph's structure — soft light and shapes, which WebP keeps small —
 * with grain on top, which it cannot. The grain is bisected until the file
 * lands within 5 % of the weight asked for.
 */
const MAKE_PHOTOGRAPH = String.raw`async ({ width, height, targetBytes }) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const paint = (grain) => {
    let seed = 469;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const light = context.createLinearGradient(0, 0, width, height);
    light.addColorStop(0, "#3d6b2e");
    light.addColorStop(0.5, "#8fb35a");
    light.addColorStop(1, "#2f4a24");
    context.fillStyle = light;
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 60; index += 1) {
      context.fillStyle =
        "hsla(" + (80 + random() * 60) + ", 50%, " + (30 + random() * 40) + "%, 0.5)";
      context.beginPath();
      context.arc(random() * width, random() * height, 20 + random() * 220, 0, Math.PI * 2);
      context.fill();
    }
    if (grain === 0) return;
    const pixels = context.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const noise = (random() - 0.5) * grain;
      pixels.data[index] += noise;
      pixels.data[index + 1] += noise;
      pixels.data[index + 2] += noise;
    }
    context.putImageData(pixels, 0, 0);
  };
  const encode = async () =>
    new Uint8Array(
      await (
        await new Promise((resolve) =>
          canvas.toBlob((blob) => resolve(blob), "image/webp", 0.85),
        )
      ).arrayBuffer(),
    );
  let low = 0;
  let high = 160;
  let best = null;
  for (let step = 0; step < 14; step += 1) {
    const grain = (low + high) / 2;
    paint(grain);
    const bytes = await encode();
    if (!best || Math.abs(bytes.length - targetBytes) < Math.abs(best.length - targetBytes))
      best = bytes;
    if (Math.abs(bytes.length - targetBytes) / targetBytes < 0.05) break;
    if (bytes.length < targetBytes) low = grain;
    else high = grain;
  }
  let binary = "";
  for (let index = 0; index < best.length; index += 8192)
    binary += String.fromCharCode(...best.subarray(index, index + 8192));
  return { width, height, bytes: best.length, base64: btoa(binary) };
}`;

export async function makePhotographOfWeight(
  page: Page,
  target: { width: number; height: number; targetBytes: number },
): Promise<WeighedPhotograph> {
  const result = (await page.evaluate(
    `(${MAKE_PHOTOGRAPH})(${JSON.stringify(target)})`,
  )) as { width: number; height: number; bytes: number; base64: string };
  return {
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    body: Buffer.from(result.base64, "base64"),
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for local media fixtures`);
  return value;
}

/** The local media store (MinIO), which the app reads photographs from. */
function localMediaClient() {
  const endpoint = requiredEnv("R2_ENDPOINT");
  if (!["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname))
    throw new Error("Media fixtures write to a loopback store only");
  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function putLocalMediaObject(key: string, body: Buffer) {
  await localMediaClient().send(
    new PutObjectCommand({
      Bucket: requiredEnv("R2_PUBLIC_BUCKET"),
      Key: key,
      Body: body,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function deleteLocalMediaObjects(keys: readonly string[]) {
  const client = localMediaClient();
  for (const key of keys)
    await client
      .send(
        new DeleteObjectCommand({
          Bucket: requiredEnv("R2_PUBLIC_BUCKET"),
          Key: key,
        }),
      )
      .catch(() => undefined);
}
