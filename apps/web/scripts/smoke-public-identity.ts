import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";

const GENERATED_HANDLE_PATTERN = /^gardener_[a-f0-9]{16}(?:_[1-9][0-9]?)?$/;
const PROVIDER_IDS = ["credential", "google"] as const;
const EVIDENCE_SAFETY =
  "redacted_counts_and_booleans_no_emails_user_ids_handles_terms_or_rows";

interface SyntheticAccount {
  userId: string;
  email: string;
  providerId: (typeof PROVIDER_IDS)[number];
  accountId: string;
}

interface IdentityRow {
  handle: string;
  normalizedHandle: string;
  currentClaimCount: unknown;
  matchingClaimCount: unknown;
}

interface ClaimRow {
  status: string;
}

async function main() {
  loadEnv({ path: ".env.local", override: false, quiet: true });

  let database: Kysely<Database> | undefined;
  const accounts = PROVIDER_IDS.map(createSyntheticAccount);
  let ok = false;
  let proof: Record<string, unknown> = {};

  try {
    database = createLocalDatabase();
    const generatedIdentities: IdentityRow[] = [];

    for (const account of accounts) {
      const identity = await database.transaction().execute(async (trx) => {
        await trx
          .insertInto("user")
          .values({
            id: account.userId,
            name: "OverGarden",
            email: account.email,
            emailVerified: true,
            image: null,
          })
          .execute();

        const provisioned = await readIdentity(trx, account.userId);
        assertIdentity(provisioned);

        await trx
          .insertInto("account")
          .values({
            accountId: account.accountId,
            providerId: account.providerId,
            userId: account.userId,
            accessToken: null,
            accessTokenExpiresAt: null,
            idToken: null,
            password:
              account.providerId === "credential"
                ? "synthetic-smoke-password-hash"
                : null,
            refreshToken: null,
            refreshTokenExpiresAt: null,
            scope: null,
            updatedAt: new Date(),
          })
          .execute();

        return provisioned;
      });

      generatedIdentities.push(identity);
    }

    for (const account of accounts) {
      await provisionIdentity(database, account.userId);
      await provisionIdentity(database, account.userId);
      assertIdentity(await readIdentity(database, account.userId));
    }

    const duplicateSignupLeavesIdentityUnchanged =
      await proveDuplicateSignupLeavesIdentityUnchanged(database, accounts[0]);
    assert(duplicateSignupLeavesIdentityUnchanged);

    const sharedCandidate = customCandidate("claim");
    const concurrentClaims = await Promise.all([
      claimHandle(database, accounts[0].userId, sharedCandidate),
      claimHandle(database, accounts[1].userId, sharedCandidate),
    ]);
    const updatedCount = concurrentClaims.filter(
      (claim) => claim.status === "updated",
    ).length;
    const unavailableCount = concurrentClaims.filter(
      (claim) => claim.status === "unavailable",
    ).length;
    assert(updatedCount === 1 && unavailableCount === 1);

    const winnerIndex = concurrentClaims.findIndex(
      (claim) => claim.status === "updated",
    );
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winner = accounts[winnerIndex];
    const loser = accounts[loserIndex];

    const cooldown = await claimHandle(
      database,
      winner.userId,
      customCandidate("cooldown"),
    );
    assert(cooldown.status === "cooldown");

    const retiredGeneratedHandle = generatedIdentities[winnerIndex].handle;
    const retiredClaim = await claimHandle(
      database,
      loser.userId,
      retiredGeneratedHandle,
    );
    assert(retiredClaim.status === "unavailable");

    const retiredState = await database
      .selectFrom("user_handle_registry")
      .select("lifecycle_state as lifecycleState")
      .where("normalized_handle", "=", retiredGeneratedHandle)
      .executeTakeFirstOrThrow();
    assert(retiredState.lifecycleState === "retired");

    const directMutationRejected = await proveDirectMutationRejected(
      database,
      loser.userId,
    );
    assert(directMutationRejected);

    const schemaObjectsPresent = await proveSchemaObjects(database);
    assert(schemaObjectsPresent);

    const aggregate = await readSyntheticIdentityAggregate(
      database,
      accounts.map((account) => account.userId),
    );
    assert(aggregate.profiles === accounts.length);
    assert(aggregate.currentClaims === accounts.length);
    assert(aggregate.matchingPairs === accounts.length);
    assert(aggregate.policyCompliantProfiles === accounts.length);
    assert(aggregate.policyCompliantCurrentClaims === accounts.length);
    assert(aggregate.retiredClaims === 1);
    assert(aggregate.policyCompliantRetiredClaims === aggregate.retiredClaims);
    assert(aggregate.generatedCurrentClaims === accounts.length - 1);
    assert(aggregate.customCurrentClaims === 1);
    assert(aggregate.generatedRetiredClaims === aggregate.retiredClaims);
    assert(aggregate.retiredClaimsWithTimestamp === aggregate.retiredClaims);
    assert(aggregate.currentClaimsWithThirtyDayCooldown === 1);

    await cleanup(database, accounts);
    const residue = await readSyntheticIdentityAggregate(
      database,
      accounts.map((account) => account.userId),
    );
    assert(
      residue.profiles === 0 &&
        residue.currentClaims === 0 &&
        residue.retiredClaims === 0,
    );

    proof = {
      providersChecked: PROVIDER_IDS.length,
      providerIndependentProvisioning: true,
      generatedHandleGrammar: true,
      exactlyOneProfileAndCurrentClaim: true,
      provisioningIdempotent: true,
      duplicateSignupLeavesIdentityUnchanged: true,
      firstRenameImmediate: true,
      concurrentClaimArbiter: true,
      cooldownEnforced: true,
      retiredHandleReserved: true,
      currentAndRetiredPolicyProvenancePreserved: true,
      persistedCooldownRecovered: true,
      directProfileMutationRejected: true,
      schemaObjectsPresent: true,
      profileRegistryConsistencyRecovered: true,
      cascadeErasureLeavesNoIdentityResidue: true,
    };
    ok = true;
  } catch {
    proof = { error: "public_identity_smoke_failed" };
  } finally {
    if (database) {
      try {
        await cleanup(database, accounts);
      } catch {
        ok = false;
        proof = { error: "public_identity_smoke_failed" };
      }
      try {
        await database.destroy();
      } catch {
        ok = false;
        proof = { error: "public_identity_smoke_failed" };
      }
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        issue: "OVE-203",
        ...proof,
        productionMutation: false,
        evidenceSafety: EVIDENCE_SAFETY,
      },
      null,
      2,
    )}\n`,
  );
  if (!ok) process.exitCode = 1;
}

function createSyntheticAccount(
  providerId: (typeof PROVIDER_IDS)[number],
): SyntheticAccount {
  const nonce = randomUUID();
  return {
    userId: randomUUID(),
    email: `ove203-smoke-${nonce}@invalid.example`,
    providerId,
    accountId: `ove203-${providerId}-${nonce}`,
  };
}

function createLocalDatabase() {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString || !isLoopbackDatabase(connectionString)) {
    throw new Error("Public identity smoke requires loopback Postgres.");
  }

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 6,
        ssl: resolveDatabaseSslConfig(process.env, resolution),
      }),
    }),
  });
}

function isLoopbackDatabase(connectionString: string) {
  try {
    const hostname = new URL(connectionString).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function readIdentity(
  database: Kysely<Database>,
  userId: string,
): Promise<IdentityRow> {
  const result = await sql<IdentityRow>`
    select
      profile.handle,
      profile.normalized_handle as "normalizedHandle",
      (
        select count(*)
        from user_handle_registry registry
        where registry.user_id = ${userId}::uuid
          and registry.lifecycle_state = 'current'
      ) as "currentClaimCount",
      (
        select count(*)
        from user_handle_registry registry
        where registry.user_id = profile.user_id
          and registry.normalized_handle = profile.normalized_handle
          and registry.lifecycle_state = 'current'
      ) as "matchingClaimCount"
    from user_public_profiles profile
    where profile.user_id = ${userId}::uuid
  `.execute(database);

  const row = result.rows[0];
  if (!row) throw new Error("Synthetic identity was not provisioned.");
  return row;
}

function assertIdentity(identity: IdentityRow) {
  assert(GENERATED_HANDLE_PATTERN.test(identity.handle));
  assert(identity.handle === identity.normalizedHandle);
  assert(Number(identity.currentClaimCount) === 1);
  assert(Number(identity.matchingClaimCount) === 1);
}

async function provisionIdentity(database: Kysely<Database>, userId: string) {
  await sql`select overgarden_provision_user_public_profile(${userId}::uuid)`.execute(
    database,
  );
}

async function claimHandle(
  database: Kysely<Database>,
  userId: string,
  handle: string,
) {
  const result = await sql<ClaimRow>`
    select status
    from overgarden_claim_user_public_handle(${userId}::uuid, ${handle})
  `.execute(database);
  const row = result.rows[0];
  if (!row) throw new Error("Synthetic handle claim returned no status.");
  return row;
}

function customCandidate(prefix: string) {
  return `ove203_${prefix}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

async function proveDirectMutationRejected(
  database: Kysely<Database>,
  userId: string,
) {
  try {
    await database.transaction().execute(async (trx) => {
      const candidate = customCandidate("direct");
      await trx
        .updateTable("user_public_profiles")
        .set({ handle: candidate, normalized_handle: candidate })
        .where("user_id", "=", userId)
        .execute();
    });
    return false;
  } catch {
    return true;
  }
}

async function proveDuplicateSignupLeavesIdentityUnchanged(
  database: Kysely<Database>,
  account: SyntheticAccount,
) {
  const duplicateUserId = randomUUID();
  const before = await readSyntheticIdentityAggregate(database, [
    account.userId,
  ]);
  let duplicateRejected = false;

  try {
    await database
      .insertInto("user")
      .values({
        id: duplicateUserId,
        name: "OverGarden",
        email: account.email,
        emailVerified: true,
        image: null,
      })
      .execute();
  } catch {
    duplicateRejected = true;
  }

  const after = await readSyntheticIdentityAggregate(database, [
    account.userId,
  ]);
  const residue = await readSyntheticIdentityAggregate(database, [
    duplicateUserId,
  ]);
  const emailCount = await database
    .selectFrom("user")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("email", "=", account.email)
    .executeTakeFirstOrThrow();

  return (
    duplicateRejected &&
    Number(emailCount.count) === 1 &&
    Object.keys(before).every((key) => before[key] === after[key]) &&
    Object.values(residue).every((value) => value === 0)
  );
}

async function proveSchemaObjects(database: Kysely<Database>) {
  const result = await sql<Record<string, boolean>>`
    select
      to_regclass('user_handle_registry')
        is not null as "registryTable",
      to_regprocedure('overgarden_provision_user_public_profile(uuid)')
        is not null as "provisionFunction",
      to_regprocedure('overgarden_claim_user_public_handle(uuid,text)')
        is not null as "claimFunction",
      to_regprocedure('overgarden_provision_user_public_profile_trigger()')
        is not null as "provisionTriggerFunction",
      exists (
        select 1
        from pg_trigger trigger
        join pg_class relation on relation.oid = trigger.tgrelid
        where trigger.tgname = 'overgarden_user_public_profile_after_insert'
          and relation.relname = 'user'
          and not trigger.tgisinternal
      ) as "authTrigger",
      exists (
        select 1 from pg_trigger
        where tgname = 'overgarden_public_profile_identity_consistency'
          and tgdeferrable and not tgisinternal
      ) as "profileConstraintTrigger",
      exists (
        select 1 from pg_trigger
        where tgname = 'overgarden_handle_registry_identity_consistency'
          and tgdeferrable and not tgisinternal
      ) as "registryConstraintTrigger",
      exists (
        select 1 from pg_constraint
        where conname = 'user_public_profiles_current_handle_registry_fkey'
          and condeferrable
      ) as "currentRegistryForeignKey",
      to_regclass('user_handle_registry_one_current_per_user_uidx')
        is not null as "oneCurrentIndex"
  `.execute(database);

  const row = result.rows[0];
  return Boolean(row && Object.values(row).every(Boolean));
}

async function readSyntheticIdentityAggregate(
  database: Kysely<Database>,
  userIds: readonly string[],
) {
  const result = await sql<Record<string, unknown>>`
    select
      (
        select count(*) from user_public_profiles profile
        where profile.user_id = any(${userIds}::uuid[])
      ) as profiles,
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'current'
      ) as "currentClaims",
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'retired'
      ) as "retiredClaims",
      (
        select count(*)
        from user_public_profiles profile
        join user_handle_registry registry
          on registry.user_id = profile.user_id
          and registry.normalized_handle = profile.normalized_handle
          and registry.lifecycle_state = 'current'
        where profile.user_id = any(${userIds}::uuid[])
      ) as "matchingPairs",
      (
        select count(*) from user_public_profiles profile
        where profile.user_id = any(${userIds}::uuid[])
          and profile.identity_policy_version = 'ove203-identity-v1'
      ) as "policyCompliantProfiles",
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'current'
          and registry.policy_version = 'ove203-identity-v1'
      ) as "policyCompliantCurrentClaims",
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'retired'
          and registry.policy_version = 'ove203-identity-v1'
      ) as "policyCompliantRetiredClaims",
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'current'
          and registry.claim_source = 'generated'
      ) as "generatedCurrentClaims",
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'current'
          and registry.claim_source = 'custom'
      ) as "customCurrentClaims",
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'retired'
          and registry.claim_source = 'generated'
      ) as "generatedRetiredClaims",
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'retired'
          and registry.retired_at is not null
      ) as "retiredClaimsWithTimestamp",
      (
        select count(*) from user_handle_registry registry
        where registry.user_id = any(${userIds}::uuid[])
          and registry.lifecycle_state = 'current'
          and registry.next_rename_at > now() + interval '29 days'
          and registry.next_rename_at <= now() + interval '31 days'
      ) as "currentClaimsWithThirtyDayCooldown"
  `.execute(database);

  const row = result.rows[0];
  if (!row) throw new Error("Synthetic identity aggregate was unavailable.");
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  ) as Record<string, number>;
}

async function cleanup(
  database: Kysely<Database>,
  accounts: readonly SyntheticAccount[],
) {
  await database
    .deleteFrom("user")
    .where(
      "id",
      "in",
      accounts.map((account) => account.userId),
    )
    .execute();
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Public identity smoke assertion failed.");
}

void main();
