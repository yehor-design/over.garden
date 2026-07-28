import path from "node:path";

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";

loadEnv({ path: ".env.local" });

assertLoopbackLocalRuntimeEnvironment(process.env);

const databaseUrl = requiredEnv("DATABASE_URL");
const pool = new Pool({ connectionString: databaseUrl });
const db = new Kysely({ dialect: new PostgresDialect({ pool }) });

const authOptions = {
  appName: "OverGarden",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  basePath: "/api/auth",
  secret: requiredEnv("BETTER_AUTH_SECRET"),
  database: {
    db,
    type: "postgres",
    casing: "snake",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  advanced: {
    cookiePrefix: "overgarden",
    database: {
      generateId: "uuid",
    },
  },
} satisfies BetterAuthOptions;

async function main() {
  const applicationSql = await loadVersionedApplicationSql(
    path.join(process.cwd(), "sql"),
  );
  await pool.query(applicationSql[0]!.sql);

  // Constructing auth validates the options against the installed Better Auth API.
  betterAuth(authOptions);
  const migrations = await getMigrations(authOptions);
  await migrations.runMigrations();

  // Re-run the base schema and then every tracked versioned migration so local
  // schema authority matches recovery and current main.
  for (const migration of applicationSql) {
    await pool.query(migration.sql);
  }

  await ensureBucket(requiredEnv("R2_QUARANTINE_BUCKET"));
  await ensureBucket(requiredEnv("R2_PUBLIC_BUCKET"));
  await allowPublicReads(requiredEnv("R2_PUBLIC_BUCKET"));

  console.log("Local walking skeleton bootstrap complete.");
}

async function ensureBucket(bucket: string) {
  const client = new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

main()
  .finally(async () => {
    await db.destroy();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

async function allowPublicReads(bucket: string) {
  const client = new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  await client
    .send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: "*",
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${bucket}/*`],
            },
          ],
        }),
      }),
    )
    .catch((error: unknown) => {
      if (isS3NotImplemented(error)) {
        console.warn(
          `Skipping bucket policy for ${bucket}; this endpoint does not support PutBucketPolicy.`,
        );
        return;
      }

      throw error;
    });
}

function isS3NotImplemented(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "Code" in error &&
    error.Code === "NotImplemented"
  );
}
