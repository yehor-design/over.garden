import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

/**
 * Production-safe synthetic proof for OVE-195:
 * put a synthetic public derivative, enqueue+drain revoke through the shared
 * helper, prove canonical non-2xx, and delete residue. No user content.
 */

function requireEnvironment(argv: string[]) {
  const environment = readFlag(argv, "--environment");
  const confirm = readFlag(argv, "--confirm-environment");
  if (!environment || environment !== confirm) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (environment !== "production" && environment !== "local") {
    throw new Error("Environment must be local or production.");
  }
  return environment;
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

async function headStatus(url: string): Promise<number> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { Range: "bytes=0-0" },
  });
  return res.status;
}

async function main() {
  const argv = process.argv.slice(2);
  const environment = requireEnvironment(argv);

  const bucket = process.env.R2_PUBLIC_BUCKET || "overgarden-public";
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBase =
    process.env.R2_PUBLIC_BASE_URL || "https://media.over.garden";
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are required.");
  }

  const objectKey = `ove195-lifecycle-probe/${createHash("sha256")
    .update(randomBytes(16))
    .digest("hex")
    .slice(0, 24)}.txt`;
  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: Buffer.from(`ove195-${randomUUID()}\n`),
      ContentType: "text/plain",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const canonicalUrl = `${publicBase.replace(/\/$/, "")}/${objectKey}`;
  const before = await headStatus(canonicalUrl);
  if (before < 200 || before >= 300) {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
    throw new Error("Synthetic derivative was not reachable before revoke.");
  }

  const { revokeMediaObjectBytes } = await import(
    "../src/server/media/lifecycle-revoke"
  );
  await revokeMediaObjectBytes({
    bucket: "public_derivative",
    objectKey,
  });

  const after = await headStatus(canonicalUrl);
  const r2Dev = await headStatus(
    `https://pub-e913e6e4251a4ba2b132579a9b771884.r2.dev/${objectKey}`,
  );

  console.log(
    JSON.stringify(
      {
        ok: after < 200 || after >= 300,
        environment,
        issue: "OVE-195",
        evidenceClass: "synthetic-media-revoke-prove",
        beforeClass: "2xx",
        afterClass: after < 200 || after >= 300 ? "non2xx" : "2xx",
        r2DevAfterClass: r2Dev < 200 || r2Dev >= 300 ? "non2xx" : "2xx",
        customDomain: "media.over.garden",
      },
      null,
      2,
    ),
  );

  if (after >= 200 && after < 300) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "synthetic media revoke failed",
  );
  process.exitCode = 1;
});
