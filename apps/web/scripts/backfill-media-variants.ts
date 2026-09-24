import "./neutralise-server-only";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";
import { chromium, type Page } from "playwright";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import {
  CLIENT_WEBP_PHOTO_QUALITY,
  CLIENT_WEBP_VARIANT_LONG_EDGES,
  scaledVariantSize,
} from "../src/lib/media/client-webp-policy";
import { variantDerivativeKey } from "../src/lib/media/derivative-keys";
import {
  getPublicDerivativeUrl,
  probePublicDerivativeObjectState,
  putPublicDerivativeObject,
} from "../src/lib/storage";

/**
 * Variants for the photographs published before the ladder existed (`OVE-469`).
 *
 *   pnpm exec tsx scripts/backfill-media-variants.ts --mode inventory \
 *     --env-file /abs/prod.env --out /abs/dir
 *   pnpm exec tsx scripts/backfill-media-variants.ts --mode apply \
 *     --env-file /abs/prod.env --out /abs/dir --confirm-environment production
 *
 * Every photograph production served on 2026-09-24 predates the 1280 and 480
 * variants, so each was sent at its only size with no `srcset`: a 224 px slot
 * got 147 kB, and below the fold those files take the link from the page's
 * LCP photograph. This makes the variants the upload path would have made, the
 * way it makes them — in a browser, from the whole photograph, smoothed at
 * "high", WebP at the same quality (ADR-0022 D2) — and puts them beside the
 * primary, where `srcset` already looks for them.
 *
 * - `inventory` reads only: the live, public photographs with no variants, and
 *   whether each primary is served.
 * - `apply` fetches each served primary, encodes the variants in headless
 *   Chromium, uploads each one unless an object already has its key, and then
 *   records which exist and the photograph's own size — `srcset` computes each
 *   candidate's width from the row's — in one statement per row, guarded so a
 *   second run changes nothing.
 *
 * Every run writes a receipt to `--out`. A database that is not the managed
 * production cluster is refused in `apply` unless it is a loopback one.
 */

type Mode = "inventory" | "apply";

interface Row {
  id: string;
  derivative_key: string;
  intrinsic_width: number | null;
  intrinsic_height: number | null;
  variant_long_edges: number[] | null;
  declared_size_bytes: number | null;
}

interface Encoded {
  width: number;
  height: number;
  variants: Array<{
    longEdge: number;
    width: number;
    height: number;
    base64: string;
  }>;
}

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hostClass(hostname: string) {
  if (/\.ondigitalocean\.com$/i.test(hostname)) return "digitalocean_managed";
  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return "loopback";
  return "other";
}

/**
 * The upload path's own steps (`journal-image-codec.ts`): the whole
 * photograph drawn once, each variant drawn from it with smoothing at "high",
 * encoded as WebP. A string, so no transpiler rewrites it for the page.
 */
const ENCODE_VARIANTS = String.raw`async ({ base64, edges, quality }) => {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/webp" }), {
    imageOrientation: "from-image",
  });
  const primary = new OffscreenCanvas(bitmap.width, bitmap.height);
  primary.getContext("2d").drawImage(bitmap, 0, 0);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const variants = [];
  for (const edge of edges) {
    if (edge >= longEdge) continue;
    const scale = edge / longEdge;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(primary, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality });
    if (blob.type !== "image/webp") throw new Error("webp_encode_unavailable");
    const out = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let index = 0; index < out.length; index += 8192)
      binary += String.fromCharCode(...out.subarray(index, index + 8192));
    variants.push({ longEdge: edge, width, height, base64: btoa(binary) });
  }
  return { width: bitmap.width, height: bitmap.height, variants };
}`;

async function encodeVariants(page: Page, primary: Buffer): Promise<Encoded> {
  return (await page.evaluate(
    `(${ENCODE_VARIANTS})(${JSON.stringify({
      base64: primary.toString("base64"),
      edges: [...CLIENT_WEBP_VARIANT_LONG_EDGES],
      quality: CLIENT_WEBP_PHOTO_QUALITY / 100,
    })})`,
  )) as Encoded;
}

async function main() {
  const mode = option("mode") as Mode | undefined;
  const envFile = option("env-file");
  const out = option("out");
  if ((mode !== "inventory" && mode !== "apply") || !out)
    throw new Error(
      "Usage: backfill-media-variants --mode inventory|apply --out <dir> [--env-file <file>] [--confirm-environment production]",
    );
  if (envFile) loadEnv({ path: envFile, override: true });
  // A pulled file writes DATABASE_SSL as a quoted "true\n"; the CA is what
  // says the connection needs TLS.
  if (process.env.DATABASE_SSL_CA) process.env.DATABASE_SSL = "true";

  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("database_url_missing");
  const databaseHost = hostClass(new URL(connectionString).hostname);
  if (
    mode === "apply" &&
    databaseHost === "digitalocean_managed" &&
    option("confirm-environment") !== "production"
  )
    throw new Error(
      "apply_on_production_needs_--confirm-environment_production",
    );
  if (mode === "apply" && databaseHost === "other")
    throw new Error("apply_refused_unknown_database_host");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  const client = await pool.connect();
  const receipt: Record<string, unknown> = {
    issue: "OVE-469",
    mode,
    databaseHost,
    mediaBase: new URL(getPublicDerivativeUrl("x")).origin,
    at: new Date().toISOString(),
  };
  const rows: Array<Record<string, unknown>> = [];
  receipt.rows = rows;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await client.query("set statement_timeout = '15s'");
    const found = await client.query<Row>(
      `select asset.id::text as id, asset.derivative_key, asset.intrinsic_width,
              asset.intrinsic_height, asset.variant_long_edges, asset.declared_size_bytes
         from media_assets as asset
         join journal_entries as entry on entry.id = asset.journal_entry_id
        where entry.visibility = 'public'
          and entry.lifecycle_state = 'active'
          and entry.published_at is not null
          and asset.derivative_key is not null
          and coalesce(cardinality(asset.variant_long_edges), 0) = 0
        order by asset.id`,
    );
    receipt.candidates = found.rows.length;

    const page =
      mode === "apply"
        ? await (browser = await chromium.launch()).newPage()
        : null;
    for (const row of found.rows) {
      const url = getPublicDerivativeUrl(row.derivative_key);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });
      const primary = response.ok
        ? Buffer.from(await response.arrayBuffer())
        : null;
      const record: Record<string, unknown> = {
        id: row.id,
        key: row.derivative_key,
        served: response.status,
        primaryBytes: primary?.length ?? null,
        rowIntrinsic:
          row.intrinsic_width && row.intrinsic_height
            ? [row.intrinsic_width, row.intrinsic_height]
            : null,
      };
      rows.push(record);
      if (!page || !primary) continue;

      const encoded = await encodeVariants(page, primary);
      record.actualIntrinsic = [encoded.width, encoded.height];
      // The row's size is what `srcset` computes each candidate's width from,
      // so it has to be the file's.
      const expected = encoded.variants.map((variant) =>
        scaledVariantSize(encoded.width, encoded.height, variant.longEdge),
      );
      const uploads: Array<Record<string, unknown>> = [];
      for (const [index, variant] of encoded.variants.entries()) {
        if (
          expected[index]!.width !== variant.width ||
          expected[index]!.height !== variant.height
        )
          throw new Error(
            `variant_size_mismatch_${row.id}_${variant.longEdge}`,
          );
        const key = variantDerivativeKey(row.derivative_key, variant.longEdge);
        const state = await probePublicDerivativeObjectState(key);
        const body = Buffer.from(variant.base64, "base64");
        if (state === "not_found")
          await putPublicDerivativeObject(key, body, "image/webp");
        else if (state !== "present")
          throw new Error(`variant_probe_${state}_${key}`);
        uploads.push({
          longEdge: variant.longEdge,
          key,
          bytes: body.length,
          action: state === "present" ? "kept_existing" : "uploaded",
        });
      }
      record.variants = uploads;

      const recorded = await client.query(
        `update media_assets
            set variant_long_edges = $2::integer[],
                intrinsic_width = $3,
                intrinsic_height = $4
          where id = $1::uuid
            and coalesce(cardinality(variant_long_edges), 0) = 0`,
        [
          row.id,
          encoded.variants.map((variant) => variant.longEdge),
          encoded.width,
          encoded.height,
        ],
      );
      record.rowUpdated = recorded.rowCount === 1;
    }
  } finally {
    await client.query("reset statement_timeout").catch(() => undefined);
    client.release();
    await pool.end();
    await browser?.close();
    mkdirSync(out, { recursive: true });
    const file = path.join(out, `media-variants-${mode}.json`);
    writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n");
    console.log(file);
  }
  console.log(
    JSON.stringify({ mode, candidates: receipt.candidates, databaseHost }),
  );
}

void main();
