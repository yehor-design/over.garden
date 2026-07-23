import { createHash, randomBytes } from "node:crypto";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

/**
 * OVE-195 provider probe: prove canonical media.over.garden serves a synthetic
 * object, observe managed r2.dev reachability class, optionally disable r2.dev
 * when CLOUDFLARE_API_TOKEN is present, then delete the probe object.
 *
 * Evidence is class-only (no object keys printed).
 */

const ACCOUNT_ID = "cb03b15042adc74edfe2d8201636300a";
const PUBLIC_BUCKET = process.env.R2_PUBLIC_BUCKET || "overgarden-public";
const R2DEV_HOST = "pub-e913e6e4251a4ba2b132579a9b771884.r2.dev";
const CANONICAL_HOST = "media.over.garden";

async function main() {
  const endpoint = requireEnv("R2_ENDPOINT");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");

  const probeSuffix = createHash("sha256")
    .update(randomBytes(16))
    .digest("hex")
    .slice(0, 24);
  const objectKey = `ove195-lifecycle-probe/${probeSuffix}.txt`;
  const body = Buffer.from("ove195-synthetic-probe\n", "utf8");

  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: objectKey,
      Body: body,
      ContentType: "text/plain",
      CacheControl: "public, max-age=60",
    }),
  );

  const canonicalUrl = `https://${CANONICAL_HOST}/${objectKey}`;
  const r2DevUrl = `https://${R2DEV_HOST}/${objectKey}`;

  const beforeCanonical = await headStatus(canonicalUrl);
  const beforeR2Dev = await headStatus(r2DevUrl);

  if (beforeCanonical < 200 || beforeCanonical >= 300) {
    await safeDelete(client, objectKey);
    throw new Error(
      `Canonical media host did not serve synthetic probe (statusClass=${statusClass(beforeCanonical)}).`,
    );
  }

  let managedEnabledBefore: boolean | null = null;
  let managedEnabledAfter: boolean | null = null;
  let disableAttempted = false;

  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  if (cfToken) {
    managedEnabledBefore = await getManagedEnabled(cfToken);
    if (managedEnabledBefore === true) {
      disableAttempted = true;
      managedEnabledAfter = await setManagedEnabled(cfToken, false);
    } else {
      managedEnabledAfter = managedEnabledBefore;
    }
  }

  const afterDisableR2Dev = disableAttempted
    ? await headStatus(r2DevUrl)
    : beforeR2Dev;

  await client.send(
    new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: objectKey }),
  );

  // Confirm object gone from origin.
  let originGone = false;
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: PUBLIC_BUCKET, Key: objectKey }),
    );
  } catch {
    originGone = true;
  }

  const afterDeleteCanonical = await headStatus(canonicalUrl);

  console.log(
    JSON.stringify(
      {
        ok:
          beforeCanonical >= 200 &&
          beforeCanonical < 300 &&
          originGone &&
          (afterDeleteCanonical < 200 || afterDeleteCanonical >= 300) &&
          (managedEnabledAfter === false ||
            managedEnabledAfter === null ||
            !disableAttempted),
        issue: "OVE-195",
        evidenceClass: "r2-provider-probe",
        canonicalServeClass: statusClass(beforeCanonical),
        r2DevServeClassBefore: statusClass(beforeR2Dev),
        r2DevServeClassAfterDisable: statusClass(afterDisableR2Dev),
        managedEnabledBeforeClass:
          managedEnabledBefore === null
            ? "unknown_no_api_token"
            : managedEnabledBefore
              ? "enabled"
              : "disabled",
        managedEnabledAfterClass:
          managedEnabledAfter === null
            ? "unknown_no_api_token"
            : managedEnabledAfter
              ? "enabled"
              : "disabled",
        disableAttempted,
        originDeleteClass: originGone ? "gone" : "still_present",
        canonicalAfterDeleteClass: statusClass(afterDeleteCanonical),
        customDomain: CANONICAL_HOST,
        quarantineLifecycleRuleClass: "documented_1d_delete",
        publicLifecycleRuleClass: "documented_abort_multipart_7d",
      },
      null,
      2,
    ),
  );

  if (
    managedEnabledAfter === true ||
    (disableAttempted &&
      afterDisableR2Dev >= 200 &&
      afterDisableR2Dev < 300)
  ) {
    process.exitCode = 1;
  }
}

async function getManagedEnabled(token: string): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${PUBLIC_BUCKET}/domains/managed`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error("Cloudflare managed-domain read failed.");
  }
  const body = (await response.json()) as {
    success?: boolean;
    result?: { enabled?: boolean };
  };
  if (!body.success || typeof body.result?.enabled !== "boolean") {
    throw new Error("Cloudflare managed-domain read returned unexpected body.");
  }
  return body.result.enabled;
}

async function setManagedEnabled(
  token: string,
  enabled: boolean,
): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${PUBLIC_BUCKET}/domains/managed`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    },
  );
  if (!response.ok) {
    throw new Error("Cloudflare managed-domain update failed.");
  }
  const body = (await response.json()) as {
    success?: boolean;
    result?: { enabled?: boolean };
  };
  if (!body.success || typeof body.result?.enabled !== "boolean") {
    throw new Error(
      "Cloudflare managed-domain update returned unexpected body.",
    );
  }
  return body.result.enabled;
}

async function headStatus(url: string): Promise<number> {
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "manual" });
    if (head.status !== 405 && head.status !== 501) return head.status;
  } catch {
    // fall through
  }
  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { Range: "bytes=0-0" },
    });
    return get.status;
  } catch {
    return 0;
  }
}

async function safeDelete(client: S3Client, objectKey: string) {
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: objectKey }),
    );
  } catch {
    // ignore cleanup failure
  }
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500) return "5xx";
  if (status === 0) return "network_error";
  return "other";
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "provider probe failed");
  process.exitCode = 1;
});
