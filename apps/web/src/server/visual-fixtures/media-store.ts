import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

import { booleanServerEnv, requiredServerEnv } from "@/lib/env";
import type { VisualFixtureManifest } from "@/lib/visual-fixtures/manifest";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const RETIRED_VISUAL_FIXTURE_MEDIA_NAMESPACES = [
  "visual-fixtures/ove187-v5",
  "visual-fixtures/ove187-v6",
  "visual-fixtures/ove187-v7",
] as const;

export interface VisualFixturePutObjectInput {
  key: string;
  body: Buffer;
  contentType: "image/png" | "image/webp";
  cacheControl: string;
  sha256: string;
}

export interface VisualFixtureObjectStore {
  putObject(input: VisualFixturePutObjectInput): Promise<void>;
  deletePublicObject(key: string): Promise<void>;
  deleteQuarantineObject(key: string): Promise<void>;
  hasPublicObject(key: string): Promise<boolean>;
}

export async function uploadVisualFixtureMedia(
  store: VisualFixtureObjectStore,
  manifest: VisualFixtureManifest,
  rootDirectory: string,
): Promise<number> {
  for (const item of manifest.media) {
    assertCanonicalFixtureDerivativeKey(item.derivativeKey, item.id);
    const source = await readFile(path.resolve(rootDirectory, item.localPath));
    const digest = createHash("sha256").update(source).digest("hex");
    if (digest !== item.sha256) {
      throw new Error(`Visual fixture media digest mismatch: ${item.fileName}`);
    }

    await store.putObject({
      key: item.derivativeKey,
      body: await sharp(source).rotate().webp({ quality: 88 }).toBuffer(),
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
  const namespaces = [
    manifest.namespace,
    ...RETIRED_VISUAL_FIXTURE_MEDIA_NAMESPACES,
  ];

  for (const namespace of namespaces) {
    for (const item of manifest.media) {
      const derivativeKey =
        namespace === manifest.namespace
          ? item.derivativeKey
          : `${namespace}/${item.fileName}`;
      const quarantineKey =
        namespace === manifest.namespace
          ? item.quarantineKey
          : `${namespace}/quarantine/${item.fileName}`;
      if (namespace === manifest.namespace) {
        assertCanonicalFixtureDerivativeKey(derivativeKey, item.id);
      } else {
        assertNamespaceKey(derivativeKey, namespace);
      }
      assertNamespaceKey(quarantineKey, namespace);
      await store.deletePublicObject(derivativeKey);
      await store.deleteQuarantineObject(quarantineKey);
    }
  }

  return manifest.media.length * namespaces.length * 2;
}

export function createVisualFixtureObjectStore(
  env: NodeJS.ProcessEnv = process.env,
): VisualFixtureObjectStore {
  const endpoint = requiredFrom(env, "R2_ENDPOINT");
  const publicBucket = requiredFrom(env, "R2_PUBLIC_BUCKET");
  const quarantineBucket = requiredFrom(env, "R2_QUARANTINE_BUCKET");
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
    async deleteQuarantineObject(key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: quarantineBucket,
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

function assertNamespaceKey(key: string, namespace: string) {
  if (!key.startsWith(`${namespace}/`)) {
    throw new Error(
      "Refusing visual fixture media access outside its namespace.",
    );
  }
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
