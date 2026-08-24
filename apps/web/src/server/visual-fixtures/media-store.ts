import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { booleanServerEnv, requiredServerEnv } from "@/lib/env";
import type { VisualFixtureManifest } from "@/lib/visual-fixtures/manifest";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export interface VisualFixturePutObjectInput {
  key: string;
  body: Buffer;
  contentType: "image/webp";
  cacheControl: string;
  sha256: string;
}

export interface VisualFixtureObjectStore {
  putObject(input: VisualFixturePutObjectInput): Promise<void>;
  deletePublicObject(key: string): Promise<void>;
  hasPublicObject(key: string): Promise<boolean>;
}

export async function uploadVisualFixtureMedia(
  store: VisualFixtureObjectStore,
  manifest: VisualFixtureManifest,
  rootDirectory: string,
): Promise<number> {
  const prepared = await Promise.all(
    manifest.media.map(async (item) => {
      assertCanonicalFixtureDerivativeKey(item.derivativeKey, item.id);
      const source = await readFile(
        path.resolve(rootDirectory, item.localPath),
      );
      const digest = createHash("sha256").update(source).digest("hex");
      if (digest !== item.sha256) {
        throw new Error(
          `Visual fixture media digest mismatch: ${item.fileName}`,
        );
      }
      if (
        source.subarray(0, 4).toString("ascii") !== "RIFF" ||
        source.subarray(8, 12).toString("ascii") !== "WEBP"
      ) {
        throw new Error(`Visual fixture is not a final WebP: ${item.fileName}`);
      }
      return { item, body: source };
    }),
  );

  // Keep provider effects ordered even though local CPU preparation is
  // parallel across the fixed 16-item manifest.
  for (const { item, body } of prepared) {
    await store.putObject({
      key: item.derivativeKey,
      body,
      contentType: "image/webp",
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      sha256: item.sha256,
    });
  }

  return manifest.media.length;
}

export async function deleteVisualFixtureMedia(
  store: VisualFixtureObjectStore,
  manifest: VisualFixtureManifest,
): Promise<number> {
  for (const item of manifest.media) {
    assertCanonicalFixtureDerivativeKey(item.derivativeKey, item.id);
    await store.deletePublicObject(item.derivativeKey);
  }

  return manifest.media.length;
}

export function createVisualFixtureObjectStore(
  env: NodeJS.ProcessEnv = process.env,
): VisualFixtureObjectStore {
  const endpoint = requiredFrom(env, "R2_ENDPOINT");
  const publicBucket = requiredFrom(env, "R2_PUBLIC_BUCKET");
  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle:
      env === process.env
        ? booleanServerEnv("R2_FORCE_PATH_STYLE")
        : env.R2_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredFrom(env, "R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredFrom(env, "R2_SECRET_ACCESS_KEY"),
    },
  });

  return {
    async putObject(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: publicBucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
          Metadata: {
            fixture_sha256: input.sha256,
          },
        }),
      );
    },
    async deletePublicObject(key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: publicBucket,
          Key: key,
        }),
      );
    },
    async hasPublicObject(key) {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: publicBucket,
            Key: key,
          }),
        );
        return true;
      } catch (error) {
        if (isMissingObject(error)) return false;
        throw error;
      }
    },
  };
}

function assertCanonicalFixtureDerivativeKey(key: string, mediaId: string) {
  if (key !== `derivatives/${mediaId}.webp`) {
    throw new Error(
      "Refusing visual fixture media access outside its exact derivative identity.",
    );
  }
}

function requiredFrom(env: NodeJS.ProcessEnv, name: string): string {
  if (env === process.env) return requiredServerEnv(name);
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404
  );
}
