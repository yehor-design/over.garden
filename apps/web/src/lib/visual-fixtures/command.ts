import { readFile } from "node:fs/promises";
import path from "node:path";

import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "@/db/connection";
import type { Database } from "@/db/schema";
import {
  resolveVisualFixtureEnvironment,
  type VisualFixtureEnvironment,
} from "@/lib/visual-fixtures/environment";
import {
  VISUAL_FIXTURE_MANIFEST,
  VISUAL_FIXTURE_MANIFEST_HASH,
} from "@/lib/visual-fixtures/manifest";
import {
  createVisualFixtureObjectStore,
  deleteVisualFixtureMedia,
  uploadVisualFixtureMedia,
  type VisualFixtureObjectStore,
} from "@/server/visual-fixtures/media-store";
import {
  resetVisualFixtures,
  seedVisualFixtures,
  type VisualFixtureCounts,
  type VisualFixtureStatus,
} from "@/server/visual-fixtures/repository";
import { verifyVisualFixtureJournalDirectoryEvidence } from "@/server/visual-fixtures/journal-directory-evidence";
import { verifyVisualFixtureKnowledgeEvidence } from "@/server/visual-fixtures/knowledge-evidence";
import { verifyVisualFixturePassportEvidence } from "@/server/visual-fixtures/passport-evidence";
import { verifyVisualFixtureJournalEntryEvidence } from "@/server/visual-fixtures/journal-entry-evidence";
import { verifyVisualFixtureProfileEvidence } from "@/server/visual-fixtures/profile-evidence";
import { verifyVisualFixtureGardenWorkspaceEvidence } from "@/server/visual-fixtures/garden-workspace-evidence";
import { verifyVisualFixtureSocialReturnEvidence } from "@/server/visual-fixtures/social-return-evidence";
import { verifyVisualFixtureCommunityEvidence } from "@/server/visual-fixtures/community-evidence";

export type VisualFixtureCommand = "seed" | "reset" | "verify";

export interface VisualFixtureVerification {
  rerunStable: boolean;
  resetEmpty: boolean;
  sentinelSurvived: boolean;
  mediaSentinelSurvived: boolean;
  mediaReachable: number;
  journalDirectoryCases: number;
  knowledgeEvidenceCases: number;
  passportEvidenceCases: number;
  journalEntryEvidenceCases: number;
  profileEvidenceCases: number;
  workspaceEvidenceCases: number;
  socialEvidenceCases: number;
  communityEvidenceCases: number;
}

export interface VisualFixtureCommandSummary {
  ok: true;
  command: VisualFixtureCommand;
  version: string;
  manifestHash: string;
  environment: Pick<
    VisualFixtureEnvironment,
    "target" | "databaseHostClass" | "objectStoreHostClass"
  >;
  counts: VisualFixtureCounts;
  seeded: boolean;
  mediaObjects: number;
  verification?: VisualFixtureVerification;
}

interface VisualFixtureRuntime {
  database: Kysely<Database>;
  store: VisualFixtureObjectStore;
  close(): Promise<void>;
}

interface RunVisualFixtureCommandOptions {
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  rootDirectory: string;
  createRuntime?: (
    env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  ) => Promise<VisualFixtureRuntime>;
}

interface CreateSummaryInput {
  command: VisualFixtureCommand;
  environment: VisualFixtureEnvironment;
  status: VisualFixtureStatus;
  mediaObjects: number;
  verification?: VisualFixtureVerification;
}

const SENTINEL_ID = "18799999-0000-4000-8000-999999999999";
const SENTINEL_TIMESTAMP = "2026-07-10T00:00:00.000Z";
const SENTINEL_MEDIA_KEY =
  "visual-fixture-reset-sentinel/ove187-non-fixture.png";

export async function runVisualFixtureCommand(
  command: VisualFixtureCommand,
  options: RunVisualFixtureCommandOptions,
): Promise<VisualFixtureCommandSummary> {
  const environment = resolveVisualFixtureEnvironment(options.env);
  const createRuntime = options.createRuntime ?? createDefaultRuntime;
  const runtime = await createRuntime(options.env);

  try {
    if (command === "seed") {
      const mediaObjects = await uploadVisualFixtureMedia(
        runtime.store,
        VISUAL_FIXTURE_MANIFEST,
        options.rootDirectory,
      );
      const status = await seedVisualFixtures(runtime.database);
      assertSeeded(status);
      return createVisualFixtureCommandSummary({
        command,
        environment,
        status,
        mediaObjects,
      });
    }

    if (command === "reset") {
      const status = await resetVisualFixtures(runtime.database);
      await deleteVisualFixtureMedia(runtime.store, VISUAL_FIXTURE_MANIFEST);
      assertEmpty(status);
      return createVisualFixtureCommandSummary({
        command,
        environment,
        status,
        mediaObjects: VISUAL_FIXTURE_MANIFEST.media.length,
      });
    }

    return verifyVisualFixtures(
      runtime,
      environment,
      options.rootDirectory,
      options.env,
    );
  } finally {
    await runtime.close();
  }
}

export function createVisualFixtureCommandSummary({
  command,
  environment,
  status,
  mediaObjects,
  verification,
}: CreateSummaryInput): VisualFixtureCommandSummary {
  return {
    ok: true,
    command,
    version: status.version,
    manifestHash: VISUAL_FIXTURE_MANIFEST_HASH,
    environment: {
      target: environment.target,
      databaseHostClass: environment.databaseHostClass,
      objectStoreHostClass: environment.objectStoreHostClass,
    },
    counts: status.actual,
    seeded: status.seeded,
    mediaObjects,
    ...(verification ? { verification } : {}),
  };
}

async function verifyVisualFixtures(
  runtime: VisualFixtureRuntime,
  environment: VisualFixtureEnvironment,
  rootDirectory: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Promise<VisualFixtureCommandSummary> {
  await uploadVisualFixtureMedia(
    runtime.store,
    VISUAL_FIXTURE_MANIFEST,
    rootDirectory,
  );
  const firstSeed = await seedVisualFixtures(runtime.database);
  const secondSeed = await seedVisualFixtures(runtime.database);
  assertSeeded(firstSeed);
  assertSeeded(secondSeed);
  const rerunStable = countsEqual(firstSeed.actual, secondSeed.actual);
  if (!rerunStable) {
    throw new Error("Visual fixture seed is not idempotent.");
  }
  await verifyVisualFixtureJournalDirectoryEvidence(runtime.database);
  await verifyVisualFixtureKnowledgeEvidence(runtime.database);
  await verifyVisualFixturePassportEvidence(runtime.database);
  await verifyVisualFixtureJournalEntryEvidence(runtime.database);
  await verifyVisualFixtureProfileEvidence(runtime.database);
  await verifyVisualFixtureGardenWorkspaceEvidence(runtime.database);
  await verifyVisualFixtureSocialReturnEvidence(runtime.database);
  await verifyVisualFixtureCommunityEvidence(runtime.database);

  await upsertVerificationSentinel(runtime.database);
  let sentinelSurvived = false;
  let mediaSentinelSurvived = false;

  try {
    await upsertVerificationMediaSentinel(runtime.store, rootDirectory);
    const resetStatus = await resetVisualFixtures(runtime.database);
    await deleteVisualFixtureMedia(runtime.store, VISUAL_FIXTURE_MANIFEST);
    const resetEmpty = countsAreZero(resetStatus.actual);
    if (!resetEmpty) {
      throw new Error("Visual fixture reset left fixture rows behind.");
    }

    sentinelSurvived = await verificationSentinelExists(runtime.database);
    if (!sentinelSurvived) {
      throw new Error("Visual fixture reset deleted the non-fixture sentinel.");
    }
    mediaSentinelSurvived =
      await runtime.store.hasPublicObject(SENTINEL_MEDIA_KEY);
    if (!mediaSentinelSurvived) {
      throw new Error(
        "Visual fixture reset deleted the non-fixture media sentinel.",
      );
    }

    await uploadVisualFixtureMedia(
      runtime.store,
      VISUAL_FIXTURE_MANIFEST,
      rootDirectory,
    );
    const finalStatus = await seedVisualFixtures(runtime.database);
    assertSeeded(finalStatus);
    const journalDirectoryCases =
      await verifyVisualFixtureJournalDirectoryEvidence(runtime.database);
    const knowledgeEvidenceCases = await verifyVisualFixtureKnowledgeEvidence(
      runtime.database,
    );
    const passportEvidenceCases = await verifyVisualFixturePassportEvidence(
      runtime.database,
    );
    const journalEntryEvidenceCases =
      await verifyVisualFixtureJournalEntryEvidence(runtime.database);
    const profileEvidenceCases = await verifyVisualFixtureProfileEvidence(
      runtime.database,
    );
    const workspaceEvidenceCases =
      await verifyVisualFixtureGardenWorkspaceEvidence(runtime.database);
    const socialEvidenceCases = await verifyVisualFixtureSocialReturnEvidence(
      runtime.database,
    );
    const communityEvidenceCases = await verifyVisualFixtureCommunityEvidence(
      runtime.database,
    );

    const mediaReachability = await Promise.all(
      VISUAL_FIXTURE_MANIFEST.media.map(async (item) => {
        assertFixtureStorageKey(item.derivativeKey);
        return canReadPublicFixtureMedia(
          publicFixtureMediaUrl(env, item.derivativeKey),
        );
      }),
    );
    const mediaReachable = mediaReachability.filter(Boolean).length;
    if (mediaReachable !== VISUAL_FIXTURE_MANIFEST.media.length) {
      throw new Error(
        "One or more visual fixture media objects are unreachable.",
      );
    }

    return createVisualFixtureCommandSummary({
      command: "verify",
      environment,
      status: finalStatus,
      mediaObjects: VISUAL_FIXTURE_MANIFEST.media.length,
      verification: {
        rerunStable,
        resetEmpty,
        sentinelSurvived,
        mediaSentinelSurvived,
        mediaReachable,
        journalDirectoryCases,
        knowledgeEvidenceCases,
        passportEvidenceCases,
        journalEntryEvidenceCases,
        profileEvidenceCases,
        workspaceEvidenceCases,
        socialEvidenceCases,
        communityEvidenceCases,
      },
    });
  } finally {
    await Promise.all([
      deleteVerificationSentinel(runtime.database),
      runtime.store.deletePublicObject(SENTINEL_MEDIA_KEY),
    ]);
  }
}

function publicFixtureMediaUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): URL {
  assertFixtureStorageKey(key);
  const base = new URL(requiredFixtureEnv(env, "R2_PUBLIC_BASE_URL"));
  base.pathname = `${base.pathname.replace(/\/$/u, "")}/${key}`;
  return base;
}

async function canReadPublicFixtureMedia(url: URL): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok && response.headers.get("content-type") === "image/webp";
  } catch {
    return false;
  }
}

function requiredFixtureEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for visual fixtures.`);
  return value;
}

async function upsertVerificationMediaSentinel(
  store: VisualFixtureObjectStore,
  rootDirectory: string,
) {
  const source = VISUAL_FIXTURE_MANIFEST.media[0];
  const body = await readFile(path.resolve(rootDirectory, source.localPath));

  await store.putObject({
    key: SENTINEL_MEDIA_KEY,
    body,
    contentType: "image/webp",
    cacheControl: "private, no-store",
    sha256: source.sha256,
  });
}

async function createDefaultRuntime(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Promise<VisualFixtureRuntime> {
  const resolution = resolveDatabaseConnection(env);
  const connectionString = resolvePgConnectionString(env, resolution);
  if (!connectionString) {
    throw new Error("Missing supported database connection env.");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(env, resolution),
  });
  const database = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  return {
    database,
    store: createVisualFixtureObjectStore(env as NodeJS.ProcessEnv),
    async close() {
      await database.destroy();
    },
  };
}

async function upsertVerificationSentinel(database: Kysely<Database>) {
  await database
    .insertInto("user")
    .values({
      id: SENTINEL_ID,
      name: "Visual fixture reset sentinel",
      email: "reset-sentinel@visual-fixtures.invalid",
      emailVerified: true,
      image: null,
      createdAt: SENTINEL_TIMESTAMP,
      updatedAt: SENTINEL_TIMESTAMP,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        name: sql`excluded.name`,
        email: sql`excluded.email`,
        emailVerified: sql`excluded."emailVerified"`,
        image: sql`excluded.image`,
        updatedAt: sql`excluded."updatedAt"`,
      }),
    )
    .execute();
}

async function verificationSentinelExists(database: Kysely<Database>) {
  const row = await database
    .selectFrom("user")
    .select("id")
    .where("id", "=", SENTINEL_ID)
    .executeTakeFirst();
  return row?.id === SENTINEL_ID;
}

async function deleteVerificationSentinel(database: Kysely<Database>) {
  await database.deleteFrom("user").where("id", "=", SENTINEL_ID).execute();
}

function assertSeeded(status: VisualFixtureStatus) {
  if (!status.seeded) {
    throw new Error("Visual fixture row counts do not match the manifest.");
  }
}

function assertEmpty(status: VisualFixtureStatus) {
  if (!countsAreZero(status.actual)) {
    throw new Error("Visual fixture reset left fixture rows behind.");
  }
}

function countsAreZero(counts: VisualFixtureCounts) {
  return (Object.keys(counts) as (keyof VisualFixtureCounts)[]).every(
    (key) => counts[key] === 0,
  );
}

function countsEqual(left: VisualFixtureCounts, right: VisualFixtureCounts) {
  return (Object.keys(left) as (keyof VisualFixtureCounts)[]).every(
    (key) => left[key] === right[key],
  );
}

function assertFixtureStorageKey(key: string) {
  if (
    !VISUAL_FIXTURE_MANIFEST.media.some((item) => item.derivativeKey === key)
  ) {
    throw new Error("Visual fixture storage key escaped its namespace.");
  }
}
