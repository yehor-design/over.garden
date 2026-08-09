import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

const DEFAULT_BASE_URL = "http://localhost:3000";
const SYNTHETIC_EMAIL_PREFIX = "ove204-sign-out-";
const SYNTHETIC_EMAIL_SUFFIX = "@over.garden";
const PRIVATE_GARDEN_MARKER = "OVE 204 synthetic private garden";
const EVIDENCE_SAFETY =
  "bounded_counts_and_booleans_no_identifiers_or_private_content";

export const SIGN_OUT_PATH = "/api/auth/sign-out";
export const SESSION_CONFIRMATION_PATH =
  "/api/auth/get-session?disableCookieCache=true";
export const PROTECTED_MUTATION_PATH = "/api/garden/entries";
export const CURRENT_SESSION_BINDING_HEADER =
  "x-overgarden-current-session-binding";

const SIGN_UP_PATH = "/api/auth/sign-up/email";
const SIGN_IN_PATH = "/api/auth/sign-in/email";
const LINKED_PROVIDER_IDS = ["credential", "google"] as const;

const ALLOWED_EVIDENCE_KEYS = new Set([
  "ok",
  "issue",
  "evidenceClass",
  "runtimeClass",
  "deploymentEvidence",
  "class",
  "expectedCommitSha",
  "deployedCommitSha",
  "independentlyResolvedFromRuntime",
  "accountCreation",
  "verified",
  "signupAccessReset",
  "serverAggregateBefore",
  "serverAggregateAfter",
  "users",
  "publicProfiles",
  "currentClaims",
  "linkedAccounts",
  "syntheticRoles",
  "ownerRoleRows",
  "gardenRows",
  "providerNeutrality",
  "structuralLinkClasses",
  "structuralLinksPreserved",
  "realSocialOAuthExecuted",
  "concurrency",
  "independentClients",
  "accessRowsBefore",
  "accessRowsAfterRevocation",
  "accessRowsAfterReauthentication",
  "firstAccessRevoked",
  "secondAccessPreserved",
  "continuity",
  "privateGardenReadbackPreserved",
  "serverAggregateUnchanged",
  "identityRecordsPreserved",
  "providerLinksPreserved",
  "roleRecordsPreserved",
  "gardenRecordsPreserved",
  "identityDuplicates",
  "revocationBoundary",
  "canonicalSameOriginPost",
  "bindingRequired",
  "staleBindingRejected",
  "getMethodRejected",
  "hostileOriginRejected",
  "accessPreservedBeforeCanonicalPost",
  "capturedOldSessionNull",
  "oldClientGardenDenied",
  "oldClientProfileDenied",
  "oldClientAdminDenied",
  "oldClientMutationDenied",
  "otherClientAuthorized",
  "reauthenticationRestored",
  "cleanup",
  "syntheticResidueRows",
  "syntheticResidueAbsent",
  "evidenceSafety",
  "error",
]);

const ALLOWED_EVIDENCE_STRINGS = new Set([
  "OVE-204",
  "synthetic_current_access_sign_out",
  "local",
  "remote",
  "caller_asserted_exact_sha_match",
  "not_asserted_local",
  EVIDENCE_SAFETY,
  "account_sign_out_smoke_failed",
]);

type DB = Kysely<Database>;

interface CliOptions {
  baseUrl: string;
  envFile: string;
  envFileExplicit: boolean;
  expectedCommitSha?: string;
  deployedCommitSha?: string;
}

export type DeploymentEvidence =
  | {
      class: "not_asserted_local";
      independentlyResolvedFromRuntime: false;
    }
  | {
      class: "caller_asserted_exact_sha_match";
      expectedCommitSha: string;
      deployedCommitSha: string;
      independentlyResolvedFromRuntime: false;
    };

interface AuthenticatedIdentity {
  sessionId: string;
  userId: string;
}

interface ServerAggregate {
  users: number;
  publicProfiles: number;
  currentClaims: number;
  linkedAccounts: number;
  syntheticRoles: number;
  ownerRoleRows: number;
  gardenRows: number;
}

export interface SyntheticState {
  email: string;
  userId?: string;
}

type ContinuityScalar = boolean | number | string | null;
type ContinuityRecord = Readonly<Record<string, ContinuityScalar>>;

export interface ImmutableContinuitySnapshot {
  identityRecords: readonly ContinuityRecord[];
  providerLinks: readonly ContinuityRecord[];
  roleRecords: readonly ContinuityRecord[];
  gardenRecords: readonly ContinuityRecord[];
}

export interface ImmutableContinuityComparison {
  identityRecordsPreserved: boolean;
  providerLinksPreserved: boolean;
  roleRecordsPreserved: boolean;
  gardenRecordsPreserved: boolean;
  identityDuplicates: number;
}

export interface SyntheticCleanupIdentity {
  id: string;
  email: string;
}

export type OldSessionGuestRoute = "garden" | "profile" | "admin";

export interface TwoClientRevocationInvariant {
  beforeAccessIds: readonly string[];
  firstAccessId: string;
  secondAccessId: string;
  afterRevocationAccessIds: readonly string[];
  reauthenticatedAccessId: string;
  afterReauthenticationAccessIds: readonly string[];
}

export interface AccountSignOutEvidenceReport {
  ok: true;
  issue: "OVE-204";
  evidenceClass: "synthetic_current_access_sign_out";
  runtimeClass: "local" | "remote";
  deploymentEvidence: DeploymentEvidence;
  accountCreation: {
    verified: true;
    signupAccessReset: true;
  };
  serverAggregateBefore: ServerAggregate;
  serverAggregateAfter: ServerAggregate;
  providerNeutrality: {
    structuralLinkClasses: number;
    structuralLinksPreserved: boolean;
    realSocialOAuthExecuted: false;
  };
  concurrency: {
    independentClients: 2;
    accessRowsBefore: 2;
    accessRowsAfterRevocation: 1;
    accessRowsAfterReauthentication: 2;
    firstAccessRevoked: true;
    secondAccessPreserved: true;
  };
  continuity: {
    privateGardenReadbackPreserved: boolean;
    serverAggregateUnchanged: boolean;
    identityRecordsPreserved: boolean;
    providerLinksPreserved: boolean;
    roleRecordsPreserved: boolean;
    gardenRecordsPreserved: boolean;
    identityDuplicates: number;
  };
  revocationBoundary: {
    canonicalSameOriginPost: true;
    bindingRequired: true;
    staleBindingRejected: true;
    getMethodRejected: true;
    hostileOriginRejected: true;
    accessPreservedBeforeCanonicalPost: true;
    capturedOldSessionNull: true;
    oldClientGardenDenied: true;
    oldClientProfileDenied: true;
    oldClientAdminDenied: true;
    oldClientMutationDenied: true;
    otherClientAuthorized: true;
    reauthenticationRestored: true;
  };
  cleanup: {
    syntheticResidueRows: 0;
    syntheticResidueAbsent: true;
  };
  evidenceSafety: typeof EVIDENCE_SAFETY;
}

interface AccountSignOutFailureReport {
  ok: false;
  issue: "OVE-204";
  evidenceClass: "synthetic_current_access_sign_out";
  error: "account_sign_out_smoke_failed";
  evidenceSafety: typeof EVIDENCE_SAFETY;
}

class CookieJar {
  private readonly values = new Map<string, string>();

  addFromResponse(response: Response) {
    for (const cookie of getSetCookieHeaders(response.headers)) {
      const pair = cookie.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
  }

  header() {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

export async function runAccountSignOutSmoke(
  options: CliOptions,
): Promise<AccountSignOutEvidenceReport> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const deploymentEvidence = resolveDeploymentEvidence(options, baseUrl);
  const database = createDatabase(baseUrl);
  const state: SyntheticState = {
    email: `${SYNTHETIC_EMAIL_PREFIX}${randomUUID()}${SYNTHETIC_EMAIL_SUFFIX}`,
  };
  const password = `ove-204-${randomUUID()}-${Date.now()}`;
  const signupClient = new CookieJar();
  const firstClient = new CookieJar();
  const secondClient = new CookieJar();
  let reportWithoutCleanup:
    | Omit<AccountSignOutEvidenceReport, "cleanup">
    | undefined;

  try {
    await assertSyntheticBaseline(database, state.email);
    await createVerifiedSyntheticAccount(
      database,
      baseUrl,
      signupClient,
      state,
      password,
    );
    const userId = requiredSyntheticUserId(state);

    await resetSignupAccessRows(database, userId);
    await signIn(baseUrl, firstClient, state.email, password);
    await signIn(baseUrl, secondClient, state.email, password);

    const [firstIdentity, secondIdentity] = await Promise.all([
      readAuthenticatedIdentity(baseUrl, firstClient),
      readAuthenticatedIdentity(baseUrl, secondClient),
    ]);
    assertEqual(firstIdentity.userId, userId, "first client identity");
    assertEqual(secondIdentity.userId, userId, "second client identity");
    assert(
      firstIdentity.sessionId !== secondIdentity.sessionId,
      "concurrent clients must have independent access rows",
    );

    await linkSyntheticProviderAccounts(database, userId);
    await createPrivateGardenRecord(database, userId);

    const beforeAccessIds = await readAccessRowIds(database, userId);
    assertExactlyTwoConcurrentAccessRows(
      beforeAccessIds,
      firstIdentity.sessionId,
      secondIdentity.sessionId,
    );
    const serverAggregateBefore = await readServerAggregate(database, userId);
    assertExpectedSyntheticAggregate(serverAggregateBefore);
    const continuitySnapshotBefore = await readImmutableContinuitySnapshot(
      database,
      userId,
    );
    const structuralLinkClasses = countProviderClasses(
      continuitySnapshotBefore,
    );
    assertEqual(
      structuralLinkClasses,
      LINKED_PROVIDER_IDS.length,
      "provider-link classes before sign-out",
    );

    await assertMethodAndOriginProtection(
      database,
      baseUrl,
      firstClient,
      firstIdentity,
      secondClient,
      secondIdentity,
    );
    const revokedCookieHeader = firstClient.header();
    await postCanonicalSignOut(baseUrl, firstClient, firstIdentity.sessionId);
    await assertAuthoritativelySignedOut(baseUrl, firstClient);

    const afterRevocationAccessIds = await readAccessRowIds(database, userId);
    assertEqual(
      await countAccessRow(database, firstIdentity.sessionId),
      0,
      "revoked current access row",
    );
    assertEqual(
      await countAccessRow(database, secondIdentity.sessionId),
      1,
      "other client access row",
    );
    await assertRawOldCookieSessionIsNull(baseUrl, revokedCookieHeader);

    const deniedMutation = await fetch(`${baseUrl}${PROTECTED_MUTATION_PATH}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: baseUrl,
        Cookie: revokedCookieHeader,
      },
      body: "{}",
      redirect: "manual",
    });
    assertEqual(deniedMutation.status, 401, "old client protected mutation");
    await assertOldSessionCannotReadPrivateRoutes(baseUrl, revokedCookieHeader);

    const secondIdentityAfterSignOut = await readAuthenticatedIdentity(
      baseUrl,
      secondClient,
    );
    assertEqual(
      secondIdentityAfterSignOut.sessionId,
      secondIdentity.sessionId,
      "other client session continuity",
    );
    const gardenReadback = await fetch(`${baseUrl}/garden`, {
      headers: { Accept: "text/html", Cookie: secondClient.header() },
      redirect: "manual",
    });
    assertEqual(gardenReadback.status, 200, "other client garden readback");
    const privateGardenReadbackPreserved = (
      await gardenReadback.text()
    ).includes(PRIVATE_GARDEN_MARKER);
    assert(
      privateGardenReadbackPreserved,
      "other client private garden readback",
    );

    await signIn(baseUrl, firstClient, state.email, password);
    const reauthenticatedIdentity = await readAuthenticatedIdentity(
      baseUrl,
      firstClient,
    );
    assertEqual(
      reauthenticatedIdentity.userId,
      userId,
      "reauthenticated identity continuity",
    );

    const afterReauthenticationAccessIds = await readAccessRowIds(
      database,
      userId,
    );
    assertTwoClientRevocationInvariant({
      beforeAccessIds,
      firstAccessId: firstIdentity.sessionId,
      secondAccessId: secondIdentity.sessionId,
      afterRevocationAccessIds,
      reauthenticatedAccessId: reauthenticatedIdentity.sessionId,
      afterReauthenticationAccessIds,
    });

    const serverAggregateAfter = await readServerAggregate(database, userId);
    const serverAggregateUnchanged =
      JSON.stringify(serverAggregateAfter) ===
      JSON.stringify(serverAggregateBefore);
    assert(serverAggregateUnchanged, "server aggregate continuity");
    const continuitySnapshotAfter = await readImmutableContinuitySnapshot(
      database,
      userId,
    );
    const continuityComparison = compareImmutableContinuitySnapshots(
      continuitySnapshotBefore,
      continuitySnapshotAfter,
    );
    assertImmutableContinuityPreserved(continuityComparison);

    reportWithoutCleanup = {
      ok: true,
      issue: "OVE-204",
      evidenceClass: "synthetic_current_access_sign_out",
      runtimeClass: isLoopbackHost(new URL(baseUrl).hostname)
        ? "local"
        : "remote",
      deploymentEvidence,
      accountCreation: {
        verified: true,
        signupAccessReset: true,
      },
      serverAggregateBefore,
      serverAggregateAfter,
      providerNeutrality: {
        structuralLinkClasses,
        structuralLinksPreserved: continuityComparison.providerLinksPreserved,
        realSocialOAuthExecuted: false,
      },
      concurrency: {
        independentClients: 2,
        accessRowsBefore: 2,
        accessRowsAfterRevocation: 1,
        accessRowsAfterReauthentication: 2,
        firstAccessRevoked: true,
        secondAccessPreserved: true,
      },
      continuity: {
        privateGardenReadbackPreserved,
        serverAggregateUnchanged,
        ...continuityComparison,
      },
      revocationBoundary: {
        canonicalSameOriginPost: true,
        bindingRequired: true,
        staleBindingRejected: true,
        getMethodRejected: true,
        hostileOriginRejected: true,
        accessPreservedBeforeCanonicalPost: true,
        capturedOldSessionNull: true,
        oldClientGardenDenied: true,
        oldClientProfileDenied: true,
        oldClientAdminDenied: true,
        oldClientMutationDenied: true,
        otherClientAuthorized: true,
        reauthenticationRestored: true,
      },
      evidenceSafety: EVIDENCE_SAFETY,
    };
  } finally {
    try {
      await cleanupSyntheticAccount(database, state);
    } finally {
      await database.destroy();
    }
  }

  assert(reportWithoutCleanup, "account sign-out evidence was not completed");
  const cleanupResidue = await readCleanupResidueFromFreshConnection(
    baseUrl,
    state,
  );
  assertEqual(cleanupResidue, 0, "synthetic cleanup residue");

  const report: AccountSignOutEvidenceReport = {
    ...reportWithoutCleanup,
    cleanup: {
      syntheticResidueRows: 0,
      syntheticResidueAbsent: true,
    },
  };
  assertAccountSignOutEvidenceSafe(report);
  return report;
}

export function assertTwoClientRevocationInvariant(
  input: TwoClientRevocationInvariant,
) {
  const before = new Set(input.beforeAccessIds);
  const afterRevocation = new Set(input.afterRevocationAccessIds);
  const afterReauthentication = new Set(input.afterReauthenticationAccessIds);

  assertEqual(before.size, 2, "access rows before revocation");
  assert(before.has(input.firstAccessId), "first access row before revocation");
  assert(
    before.has(input.secondAccessId),
    "second access row before revocation",
  );
  assert(
    input.firstAccessId !== input.secondAccessId,
    "concurrent access rows must differ",
  );

  assertEqual(afterRevocation.size, 1, "access rows after revocation");
  assert(
    !afterRevocation.has(input.firstAccessId),
    "first access row must be revoked",
  );
  assert(
    afterRevocation.has(input.secondAccessId),
    "second access row must remain",
  );

  assertEqual(
    afterReauthentication.size,
    2,
    "access rows after reauthentication",
  );
  assert(
    !afterReauthentication.has(input.firstAccessId),
    "revoked access row must not return",
  );
  assert(
    afterReauthentication.has(input.secondAccessId),
    "second access row must survive reauthentication",
  );
  assert(
    afterReauthentication.has(input.reauthenticatedAccessId),
    "reauthenticated access row must exist",
  );
  assert(
    input.reauthenticatedAccessId !== input.secondAccessId,
    "reauthenticated and second access rows must differ",
  );
}

export function assertAccountSignOutEvidenceSafe(value: unknown) {
  assert(isRecord(value), "sign-out evidence must be an object");
  assertSafeEvidenceNode(value);

  const serialized = JSON.stringify(value);
  assert(!serialized.includes("@"), "sign-out evidence cannot contain email");
  assert(
    !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(
      serialized,
    ),
    "sign-out evidence cannot contain UUIDs",
  );
  assert(
    !/cookie|password|secret|bearer|private garden|quarantine|latitude|longitude|coordinates/i.test(
      serialized,
    ),
    "sign-out evidence cannot contain secret or private payload markers",
  );
}

async function createVerifiedSyntheticAccount(
  database: DB,
  baseUrl: string,
  signupClient: CookieJar,
  state: SyntheticState,
  password: string,
) {
  await authRequest(baseUrl, signupClient, SIGN_UP_PATH, {
    email: state.email,
    password,
    name: PRIVATE_AUTH_COMPATIBILITY_NAME,
    callbackURL: "/garden",
  });

  const user = await database
    .selectFrom("user")
    .select("id")
    .where("email", "=", state.email)
    .executeTakeFirstOrThrow();
  state.userId = user.id;

  await database
    .updateTable("user")
    .set({ emailVerified: true, updatedAt: new Date() })
    .where("id", "=", user.id)
    .where("email", "=", state.email)
    .execute();

  const verified = await database
    .selectFrom("user")
    .select("emailVerified")
    .where("id", "=", user.id)
    .executeTakeFirstOrThrow();
  assertEqual(verified.emailVerified, true, "synthetic verification state");
}

async function resetSignupAccessRows(database: DB, userId: string) {
  await database.deleteFrom("session").where("userId", "=", userId).execute();
  assertEqual(
    await countUserAccessRows(database, userId),
    0,
    "signup access reset",
  );
}

async function signIn(
  baseUrl: string,
  client: CookieJar,
  email: string,
  password: string,
) {
  await authRequest(baseUrl, client, SIGN_IN_PATH, {
    email,
    password,
    callbackURL: "/garden",
    rememberMe: false,
  });
}

async function linkSyntheticProviderAccounts(database: DB, userId: string) {
  const existing = await database
    .selectFrom("account")
    .select("providerId")
    .where("userId", "=", userId)
    .execute();
  assertEqual(existing.length, 1, "credential account count");
  assertEqual(existing[0]?.providerId, "credential", "credential account type");

  for (const providerId of LINKED_PROVIDER_IDS.slice(1)) {
    await database
      .insertInto("account")
      .values({
        accountId: `ove204-${providerId}-${randomUUID()}`,
        providerId,
        userId,
        accessToken: null,
        accessTokenExpiresAt: null,
        idToken: null,
        password: null,
        refreshToken: null,
        refreshTokenExpiresAt: null,
        scope: null,
        updatedAt: new Date(),
      })
      .execute();
  }

  const providerRows = await database
    .selectFrom("account")
    .select("providerId")
    .where("userId", "=", userId)
    .execute();
  assertEqual(
    providerRows.length,
    LINKED_PROVIDER_IDS.length,
    "linked accounts",
  );
  assertEqual(
    [...new Set(providerRows.map((row) => row.providerId))].sort().join(","),
    [...LINKED_PROVIDER_IDS].sort().join(","),
    "provider-neutral linked account classes",
  );
}

async function createPrivateGardenRecord(database: DB, userId: string) {
  const spaceId = randomUUID();
  const objectId = randomUUID();
  const entryId = randomUUID();

  await database.transaction().execute(async (trx) => {
    await trx
      .insertInto("spaces")
      .values({
        id: spaceId,
        owner_user_id: userId,
        display_name: PRIVATE_GARDEN_MARKER,
        location_visibility: "hidden",
        coarse_region_code: null,
      })
      .execute();
    await trx
      .insertInto("plant_objects")
      .values({
        id: objectId,
        owner_user_id: userId,
        space_id: spaceId,
        display_name: "OVE 204 synthetic private plant",
        object_kind: "plant",
        catalog_item_id: null,
        variety_text: null,
        variety_state: "unknown",
        location_visibility: "hidden",
        coarse_region_code: null,
      })
      .execute();
    await trx
      .insertInto("journal_entries")
      .values({
        id: entryId,
        owner_user_id: userId,
        space_id: spaceId,
        plant_object_id: objectId,
        title: "OVE 204 synthetic private entry",
        body: "Synthetic private continuity record for the OVE-204 smoke.",
        entry_scope: "object",
        entry_date: "2026-07-18",
        visibility: "private",
        lifecycle_state: "active",
        public_slug: null,
        public_noindex: true,
        published_at: null,
        client_mutation_id: `ove204-${randomUUID()}`,
      })
      .execute();
  });
}

async function readAuthenticatedIdentity(
  baseUrl: string,
  client: CookieJar,
): Promise<AuthenticatedIdentity> {
  const response = await fetch(`${baseUrl}${SESSION_CONFIRMATION_PATH}`, {
    headers: {
      Accept: "application/json",
      Cookie: client.header(),
    },
    cache: "no-store",
    redirect: "manual",
  });
  client.addFromResponse(response);
  assertEqual(response.status, 200, "authenticated session readback");
  const body = (await response.json()) as unknown;
  assert(isRecord(body), "authenticated session response");
  assert(isRecord(body.session), "authenticated session payload");
  assert(isRecord(body.user), "authenticated user payload");
  assert(typeof body.session.id === "string", "authenticated session id");
  assert(typeof body.user.id === "string", "authenticated user id");
  return { sessionId: body.session.id, userId: body.user.id };
}

async function postCanonicalSignOut(
  baseUrl: string,
  client: CookieJar,
  sessionId: string,
) {
  const response = await fetch(`${baseUrl}${SIGN_OUT_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      [CURRENT_SESSION_BINDING_HEADER]: deriveCurrentSessionBinding(sessionId),
      Origin: baseUrl,
      Cookie: client.header(),
    },
    body: "{}",
    redirect: "manual",
  });
  client.addFromResponse(response);
  assertEqual(response.status, 200, "canonical sign-out response");
  const body = (await response.json()) as unknown;
  assert(
    isRecord(body) && body.success === true,
    "canonical sign-out success response",
  );
}

async function assertMethodAndOriginProtection(
  database: DB,
  baseUrl: string,
  client: CookieJar,
  identity: AuthenticatedIdentity,
  otherClient: CookieJar,
  otherIdentity: AuthenticatedIdentity,
) {
  const getResponse = await fetch(`${baseUrl}${SIGN_OUT_PATH}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Cookie: client.header(),
    },
    redirect: "manual",
  });
  assert(
    getResponse.status >= 400 && getResponse.status < 500,
    "GET sign-out must be rejected",
  );
  assertEqual(
    await countAccessRow(database, identity.sessionId),
    1,
    "GET sign-out access preservation",
  );

  const missingBindingResponse = await fetch(`${baseUrl}${SIGN_OUT_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: client.header(),
    },
    body: "{}",
    redirect: "manual",
  });
  assertEqual(
    missingBindingResponse.status,
    409,
    "missing current-session binding",
  );
  assertEqual(
    await countAccessRow(database, identity.sessionId),
    1,
    "missing-binding access preservation",
  );

  const staleBindingResponse = await fetch(`${baseUrl}${SIGN_OUT_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      [CURRENT_SESSION_BINDING_HEADER]: deriveCurrentSessionBinding(
        identity.sessionId,
      ),
      Origin: baseUrl,
      Cookie: otherClient.header(),
    },
    body: "{}",
    redirect: "manual",
  });
  assertEqual(
    staleBindingResponse.status,
    409,
    "stale current-session binding",
  );
  assertEqual(
    await countAccessRow(database, otherIdentity.sessionId),
    1,
    "stale-binding other access preservation",
  );

  const hostileOriginResponse = await fetch(`${baseUrl}${SIGN_OUT_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      [CURRENT_SESSION_BINDING_HEADER]: deriveCurrentSessionBinding(
        identity.sessionId,
      ),
      Origin: "https://ove204-hostile-origin.invalid",
      Cookie: client.header(),
    },
    body: "{}",
    redirect: "manual",
  });
  assert(
    hostileOriginResponse.status >= 400 && hostileOriginResponse.status < 500,
    "hostile-origin sign-out must be rejected",
  );
  assertEqual(
    await countAccessRow(database, identity.sessionId),
    1,
    "hostile-origin access preservation",
  );
  const stillAuthenticated = await readAuthenticatedIdentity(baseUrl, client);
  assertEqual(
    stillAuthenticated.sessionId,
    identity.sessionId,
    "protected sign-out access continuity",
  );
}

async function assertOldSessionCannotReadPrivateRoutes(
  baseUrl: string,
  revokedCookieHeader: string,
) {
  const garden = await fetch(`${baseUrl}/garden`, {
    headers: { Accept: "text/html", Cookie: revokedCookieHeader },
    redirect: "manual",
  });
  const gardenHtml = await garden.text();
  assertOldSessionGuestRouteContract("garden", garden.status, gardenHtml);

  const profile = await fetch(`${baseUrl}/garden/profile`, {
    headers: { Accept: "text/html", Cookie: revokedCookieHeader },
    redirect: "manual",
  });
  const profileHtml = await profile.text();
  assertOldSessionGuestRouteContract("profile", profile.status, profileHtml);

  const admin = await fetch(`${baseUrl}/admin`, {
    headers: { Accept: "text/html", Cookie: revokedCookieHeader },
    redirect: "manual",
  });
  const adminHtml = await admin.text();
  assertOldSessionGuestRouteContract("admin", admin.status, adminHtml);
}

export function assertOldSessionGuestRouteContract(
  route: OldSessionGuestRoute,
  status: number,
  html: string,
) {
  assertEqual(status, 200, `old session ${route} boundary`);
  assert(
    html.includes('data-testid="garden-auth-panel"'),
    `old session ${route} must render the guest auth boundary`,
  );
  assert(
    !html.includes('data-authenticated-utility-region="true"'),
    `old session ${route} cannot render authenticated utility controls`,
  );
  assert(
    !html.includes(PRIVATE_GARDEN_MARKER),
    `old session ${route} cannot render private garden content`,
  );

  if (route === "profile") {
    assert(
      !html.includes("data-owner-profile-editor="),
      "old session profile cannot render the owner editor",
    );
  }

  if (route === "admin") {
    assert(
      html.includes('data-operator-access-state="sign-in-required"'),
      "old session admin must render the sign-in-required boundary",
    );
  }
}

function deriveCurrentSessionBinding(sessionId: string) {
  assert(sessionId.length > 0 && sessionId.length <= 256, "bounded session id");
  return createHash("sha256").update(sessionId, "utf8").digest("base64url");
}

async function assertAuthoritativelySignedOut(
  baseUrl: string,
  client: CookieJar,
) {
  const response = await fetch(`${baseUrl}${SESSION_CONFIRMATION_PATH}`, {
    headers: {
      Accept: "application/json",
      Cookie: client.header(),
    },
    cache: "no-store",
    redirect: "manual",
  });
  client.addFromResponse(response);
  assertEqual(response.status, 200, "signed-out session confirmation");
  const body = (await response.json()) as unknown;
  assert(body === null, "signed-out session confirmation must be null");
}

async function assertRawOldCookieSessionIsNull(
  baseUrl: string,
  revokedCookieHeader: string,
) {
  const response = await fetch(`${baseUrl}${SESSION_CONFIRMATION_PATH}`, {
    headers: {
      Accept: "application/json",
      Cookie: revokedCookieHeader,
    },
    cache: "no-store",
    redirect: "manual",
  });
  const body = (await response.json().catch(() => undefined)) as unknown;
  assertOldCookieSessionNull(response.status, body);
}

export function assertOldCookieSessionNull(status: number, body: unknown) {
  assertEqual(status, 200, "old-cookie session confirmation");
  assert(body === null, "old-cookie session confirmation must be null");
}

async function authRequest(
  baseUrl: string,
  client: CookieJar,
  requestPath: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: client.header(),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  client.addFromResponse(response);
  assertEqual(response.status, 200, `auth request ${requestPath}`);
}

async function readServerAggregate(
  database: DB,
  userId: string,
): Promise<ServerAggregate> {
  const [
    users,
    publicProfiles,
    currentClaims,
    linkedAccounts,
    syntheticRoles,
    ownerRoleRows,
    spaces,
    objects,
    entries,
  ] = await Promise.all([
    countWhereUserId(database, "user", "id", userId),
    countWhereUserId(database, "user_public_profiles", "user_id", userId),
    countCurrentClaims(database, userId),
    countWhereUserId(database, "account", "userId", userId),
    countWhereUserId(database, "admin_user_roles", "user_id", userId),
    countGlobalOwnerRoleRows(database),
    countWhereUserId(database, "spaces", "owner_user_id", userId),
    countWhereUserId(database, "plant_objects", "owner_user_id", userId),
    countWhereUserId(database, "journal_entries", "owner_user_id", userId),
  ]);

  return {
    users,
    publicProfiles,
    currentClaims,
    linkedAccounts,
    syntheticRoles,
    ownerRoleRows,
    gardenRows: spaces + objects + entries,
  };
}

async function readImmutableContinuitySnapshot(
  database: DB,
  userId: string,
): Promise<ImmutableContinuitySnapshot> {
  const [
    user,
    profiles,
    claims,
    providerLinks,
    ownerRoles,
    spaces,
    objects,
    entries,
  ] = await Promise.all([
    database
      .selectFrom("user")
      .select(["id", "email", "emailVerified", "name", "image"])
      .where("id", "=", userId)
      .executeTakeFirst(),
    database
      .selectFrom("user_public_profiles")
      .select([
        "user_id",
        "handle",
        "normalized_handle",
        "display_name",
        "bio",
        "avatar_media_asset_id",
        "avatar_url",
        "profile_visibility",
        "profile_lifecycle_state",
        "handle_registry_state",
        "identity_policy_version",
        "location_visibility",
        "coarse_region_code",
        "languages",
        "relationship_visibility",
      ])
      .where("user_id", "=", userId)
      .execute(),
    database
      .selectFrom("user_handle_registry")
      .select([
        "user_id",
        "normalized_handle",
        "lifecycle_state",
        "claim_source",
        "policy_version",
      ])
      .where("user_id", "=", userId)
      .execute(),
    database
      .selectFrom("account")
      .select(["id", "accountId", "providerId", "userId"])
      .where("userId", "=", userId)
      .execute(),
    database
      .selectFrom("admin_user_roles")
      .select(["user_id", "role", "granted_by_user_id", "grant_reason"])
      .where("role", "=", "owner")
      .execute(),
    database
      .selectFrom("spaces")
      .select([
        "id",
        "owner_user_id",
        "display_name",
        "location_visibility",
        "coarse_region_code",
      ])
      .where("owner_user_id", "=", userId)
      .execute(),
    database
      .selectFrom("plant_objects")
      .select([
        "id",
        "owner_user_id",
        "space_id",
        "display_name",
        "object_kind",
        "catalog_item_id",
        "variety_text",
        "variety_state",
        "location_visibility",
        "coarse_region_code",
      ])
      .where("owner_user_id", "=", userId)
      .execute(),
    database
      .selectFrom("journal_entries")
      .select([
        "id",
        "owner_user_id",
        "space_id",
        "plant_object_id",
        "title",
        "body",
        "entry_scope",
        "entry_date",
        "visibility",
        "lifecycle_state",
        "public_slug",
        "public_noindex",
        "published_at",
        "client_mutation_id",
      ])
      .where("owner_user_id", "=", userId)
      .execute(),
  ]);

  const identityRecords: ContinuityRecord[] = [];
  if (user) {
    identityRecords.push(
      continuityRecord("user", {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        image: user.image,
      }),
    );
  }
  for (const profile of profiles) {
    identityRecords.push(
      continuityRecord("profile", {
        ...profile,
        languages: JSON.stringify([...profile.languages].sort()),
      }),
    );
  }
  for (const claim of claims) {
    identityRecords.push(continuityRecord("handle_claim", claim));
  }

  return {
    identityRecords,
    providerLinks: providerLinks.map((row) =>
      continuityRecord("provider_link", row),
    ),
    roleRecords: ownerRoles.map((row) => continuityRecord("owner_role", row)),
    gardenRecords: [
      ...spaces.map((row) => continuityRecord("space", row)),
      ...objects.map((row) => continuityRecord("plant_object", row)),
      ...entries.map((row) => continuityRecord("journal_entry", row)),
    ],
  };
}

export function compareImmutableContinuitySnapshots(
  before: ImmutableContinuitySnapshot,
  after: ImmutableContinuitySnapshot,
): ImmutableContinuityComparison {
  return {
    identityRecordsPreserved: continuityRecordSetsEqual(
      before.identityRecords,
      after.identityRecords,
    ),
    providerLinksPreserved: continuityRecordSetsEqual(
      before.providerLinks,
      after.providerLinks,
    ),
    roleRecordsPreserved: continuityRecordSetsEqual(
      before.roleRecords,
      after.roleRecords,
    ),
    gardenRecordsPreserved: continuityRecordSetsEqual(
      before.gardenRecords,
      after.gardenRecords,
    ),
    identityDuplicates: Math.max(
      countIdentityDuplicates(before),
      countIdentityDuplicates(after),
    ),
  };
}

export function assertImmutableContinuityPreserved(
  comparison: ImmutableContinuityComparison,
) {
  assert(comparison.identityRecordsPreserved, "identity records changed");
  assert(comparison.providerLinksPreserved, "provider links changed");
  assert(comparison.roleRecordsPreserved, "owner role record changed");
  assert(comparison.gardenRecordsPreserved, "private garden records changed");
  assertEqual(comparison.identityDuplicates, 0, "identity duplicate count");
}

function continuityRecord(
  recordType: string,
  values: Record<string, unknown>,
): ContinuityRecord {
  const record: Record<string, ContinuityScalar> = { recordType };
  for (const [key, value] of Object.entries(values)) {
    record[key] = normalizeContinuityScalar(value);
  }
  return record;
}

function normalizeContinuityScalar(value: unknown): ContinuityScalar {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  throw new TypeError("Unsupported continuity snapshot value.");
}

function continuityRecordSetsEqual(
  before: readonly ContinuityRecord[],
  after: readonly ContinuityRecord[],
) {
  return (
    canonicalContinuityRecords(before) === canonicalContinuityRecords(after)
  );
}

function canonicalContinuityRecords(records: readonly ContinuityRecord[]) {
  return JSON.stringify(
    records
      .map((record) =>
        JSON.stringify(
          Object.fromEntries(
            Object.entries(record).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
        ),
      )
      .sort(),
  );
}

function countIdentityDuplicates(snapshot: ImmutableContinuitySnapshot) {
  const typeCounts = new Map<string, number>();
  for (const record of snapshot.identityRecords) {
    const recordType = record.recordType;
    if (typeof recordType !== "string") continue;
    if (recordType === "handle_claim" && record.lifecycle_state !== "current") {
      continue;
    }
    typeCounts.set(recordType, (typeCounts.get(recordType) ?? 0) + 1);
  }
  return ["user", "profile", "handle_claim"].reduce(
    (total, recordType) =>
      total + Math.max(0, (typeCounts.get(recordType) ?? 0) - 1),
    0,
  );
}

function countProviderClasses(snapshot: ImmutableContinuitySnapshot) {
  return new Set(
    snapshot.providerLinks
      .map((record) => record.providerId)
      .filter((value): value is string => typeof value === "string"),
  ).size;
}

function assertExpectedSyntheticAggregate(aggregate: ServerAggregate) {
  assertEqual(aggregate.users, 1, "synthetic user count");
  assertEqual(aggregate.publicProfiles, 1, "synthetic profile count");
  assertEqual(aggregate.currentClaims, 1, "synthetic current claim count");
  assertEqual(aggregate.linkedAccounts, 3, "synthetic linked account count");
  assertEqual(aggregate.syntheticRoles, 0, "synthetic role count");
  assertEqual(aggregate.ownerRoleRows, 1, "global owner role count");
  assertEqual(aggregate.gardenRows, 3, "synthetic private garden row count");
}

async function countWhereUserId<
  TTable extends
    | "user"
    | "user_public_profiles"
    | "account"
    | "admin_user_roles"
    | "spaces"
    | "plant_objects"
    | "journal_entries",
>(
  database: DB,
  table: TTable,
  column: "id" | "user_id" | "userId" | "owner_user_id",
  userId: string,
) {
  const result = await sql<{ count: number }>`
    select count(*)::int as count
    from ${sql.table(table)}
    where ${sql.ref(column)} = ${userId}
  `.execute(database);
  const row = result.rows[0];
  assert(row, "aggregate count row");
  return Number(row.count);
}

async function countCurrentClaims(database: DB, userId: string) {
  const result = await database
    .selectFrom("user_handle_registry")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("user_id", "=", userId)
    .where("lifecycle_state", "=", "current")
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

async function countGlobalOwnerRoleRows(database: DB) {
  const result = await database
    .selectFrom("admin_user_roles")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("role", "=", "owner")
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

async function readAccessRowIds(database: DB, userId: string) {
  const rows = await database
    .selectFrom("session")
    .select("id")
    .where("userId", "=", userId)
    .execute();
  return rows.map((row) => row.id);
}

function assertExactlyTwoConcurrentAccessRows(
  accessIds: readonly string[],
  firstAccessId: string,
  secondAccessId: string,
) {
  const ids = new Set(accessIds);
  assertEqual(ids.size, 2, "exact concurrent access row count");
  assert(ids.has(firstAccessId), "first client access row");
  assert(ids.has(secondAccessId), "second client access row");
}

async function countAccessRow(database: DB, accessId: string) {
  const result = await database
    .selectFrom("session")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("id", "=", accessId)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

async function countUserAccessRows(database: DB, userId: string) {
  const result = await database
    .selectFrom("session")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("userId", "=", userId)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

async function assertSyntheticBaseline(database: DB, email: string) {
  const result = await database
    .selectFrom("user")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("email", "=", email)
    .executeTakeFirstOrThrow();
  assertEqual(Number(result.count), 0, "synthetic baseline");
}

export async function cleanupSyntheticAccount(
  database: DB,
  state: SyntheticState,
) {
  await database.transaction().execute(async (trx) => {
    const persisted = state.userId
      ? await trx
          .selectFrom("user")
          .select(["id", "email"])
          .where("id", "=", state.userId)
          .where("email", "=", state.email)
          .forUpdate()
          .executeTakeFirst()
      : await trx
          .selectFrom("user")
          .select(["id", "email"])
          .where("email", "=", state.email)
          .forUpdate()
          .executeTakeFirst();

    // Better Auth can leave an email-bound verification row when signup fails
    // before the user row becomes observable. This residue is safe to remove
    // without a user UUID only because the smoke email is freshly randomized,
    // synthetically namespaced, and matched exactly (never with LIKE).
    assertSyntheticVerificationBoundary(state.email);
    await trx
      .deleteFrom("verification")
      .where("identifier", "=", state.email)
      .execute();

    if (!persisted && !state.userId) return;
    assertSyntheticCleanupIdentityBound(
      { id: state.userId ?? persisted?.id ?? "", email: state.email },
      persisted ?? null,
    );
    const syntheticUserId = persisted!.id;
    state.userId = syntheticUserId;

    await trx
      .deleteFrom("analytics_events")
      .where("owner_user_id", "=", syntheticUserId)
      .execute();
    await trx
      .deleteFrom("journal_entries")
      .where("owner_user_id", "=", syntheticUserId)
      .execute();
    await trx
      .deleteFrom("plant_objects")
      .where("owner_user_id", "=", syntheticUserId)
      .execute();
    await trx
      .deleteFrom("spaces")
      .where("owner_user_id", "=", syntheticUserId)
      .execute();
    await trx
      .deleteFrom("pilot_invite_grants")
      .where("user_id", "=", syntheticUserId)
      .execute();
    await trx
      .deleteFrom("admin_user_roles")
      .where("user_id", "=", syntheticUserId)
      .execute();
    await trx
      .deleteFrom("session")
      .where("userId", "=", syntheticUserId)
      .execute();
    await trx
      .deleteFrom("account")
      .where("userId", "=", syntheticUserId)
      .execute();
    const deletedUser = await trx
      .deleteFrom("user")
      .where("id", "=", syntheticUserId)
      .where("email", "=", state.email)
      .executeTakeFirst();
    assertEqual(
      Number(deletedUser.numDeletedRows),
      1,
      "synthetic cleanup user row",
    );
  });
}

export function assertSyntheticCleanupIdentityBound(
  expected: SyntheticCleanupIdentity,
  persisted: SyntheticCleanupIdentity | null,
) {
  assertSyntheticBoundary(expected.id, expected.email);
  assert(persisted, "synthetic cleanup identity was not found");
  assert(
    persisted.id === expected.id && persisted.email === expected.email,
    "synthetic cleanup identity binding mismatch",
  );
  assertSyntheticBoundary(persisted.id, persisted.email);
}

async function readCleanupResidueFromFreshConnection(
  baseUrl: string,
  state: SyntheticState,
) {
  const database = createDatabase(baseUrl);
  try {
    const userCount = await database
      .selectFrom("user")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("email", "=", state.email)
      .executeTakeFirstOrThrow();
    if (!state.userId) {
      return (
        Number(userCount.count) +
        (await countVerificationRows(database, state.email))
      );
    }

    const [
      accessRows,
      accountRows,
      profileRows,
      claimRows,
      spaceRows,
      analyticsRows,
      entryRows,
      objectRows,
      pilotRows,
      syntheticRoleRows,
      verificationRows,
    ] = await Promise.all([
      countUserAccessRows(database, state.userId),
      countWhereUserId(database, "account", "userId", state.userId),
      countWhereUserId(
        database,
        "user_public_profiles",
        "user_id",
        state.userId,
      ),
      countHandleRows(database, state.userId),
      countWhereUserId(database, "spaces", "owner_user_id", state.userId),
      countOwnedRows(database, "analytics_events", state.userId),
      countWhereUserId(
        database,
        "journal_entries",
        "owner_user_id",
        state.userId,
      ),
      countWhereUserId(
        database,
        "plant_objects",
        "owner_user_id",
        state.userId,
      ),
      countOwnedRows(database, "pilot_invite_grants", state.userId),
      countWhereUserId(database, "admin_user_roles", "user_id", state.userId),
      countVerificationRows(database, state.email),
    ]);
    return (
      Number(userCount.count) +
      accessRows +
      accountRows +
      profileRows +
      claimRows +
      spaceRows +
      analyticsRows +
      entryRows +
      objectRows +
      pilotRows +
      syntheticRoleRows +
      verificationRows
    );
  } finally {
    await database.destroy();
  }
}

async function countOwnedRows(
  database: DB,
  table: "analytics_events" | "pilot_invite_grants",
  userId: string,
) {
  const column = table === "analytics_events" ? "owner_user_id" : "user_id";
  const result = await sql<{ count: number }>`
    select count(*)::int as count
    from ${sql.table(table)}
    where ${sql.ref(column)} = ${userId}
  `.execute(database);
  return Number(result.rows[0]?.count ?? 0);
}

async function countHandleRows(database: DB, userId: string) {
  const result = await database
    .selectFrom("user_handle_registry")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("user_id", "=", userId)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

async function countVerificationRows(database: DB, email: string) {
  assertSyntheticVerificationBoundary(email);
  const result = await database
    .selectFrom("verification")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("identifier", "=", email)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

function createDatabase(baseUrl: string) {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  assert(connectionString, "database connection is required");
  assertRuntimeDatabaseTopology(baseUrl, connectionString);

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 4,
        ssl: resolveDatabaseSslConfig(process.env, resolution),
      }),
    }),
  });
}

function assertRuntimeDatabaseTopology(
  baseUrl: string,
  connectionString: string,
) {
  const runtimeIsLocal = isLoopbackHost(new URL(baseUrl).hostname);
  const databaseIsLocal = isLoopbackHost(new URL(connectionString).hostname);
  assert(
    runtimeIsLocal === databaseIsLocal,
    "runtime and database topology must both be local or both be remote",
  );
}

export function resolveDeploymentEvidence(
  options: Pick<CliOptions, "expectedCommitSha" | "deployedCommitSha">,
  baseUrl: string,
): DeploymentEvidence {
  const expected = options.expectedCommitSha?.trim();
  const deployed = options.deployedCommitSha?.trim();
  const isLocal = isLoopbackHost(new URL(baseUrl).hostname);
  if (!expected && !deployed) {
    assert(isLocal, "remote smoke requires both exact commit SHAs");
    return {
      class: "not_asserted_local",
      independentlyResolvedFromRuntime: false,
    };
  }
  assertExactCommit(expected, "expected commit");
  assertExactCommit(deployed, "deployed commit");
  assertEqual(expected, deployed, "exact deployed commit");
  return {
    class: "caller_asserted_exact_sha_match",
    expectedCommitSha: expected!,
    deployedCommitSha: deployed!,
    independentlyResolvedFromRuntime: false,
  };
}

function parseCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const filtered = argv.filter((value) => value !== "--");
  for (let index = 0; index < filtered.length; index += 2) {
    const key = filtered[index];
    const value = filtered[index + 1];
    assert(
      key?.startsWith("--") && value,
      "smoke options are --name value pairs",
    );
    values.set(key, value);
  }
  const allowed = new Set([
    "--base-url",
    "--env-file",
    "--expected-commit",
    "--deployed-commit",
  ]);
  for (const key of values.keys()) {
    assert(allowed.has(key), "unsupported smoke option");
  }

  const envFile = values.get("--env-file") ?? ".env.local";
  return {
    baseUrl:
      values.get("--base-url") ??
      process.env.OVE204_SMOKE_BASE_URL ??
      process.env.PUBLIC_SITE_URL ??
      process.env.BETTER_AUTH_URL ??
      DEFAULT_BASE_URL,
    envFile,
    envFileExplicit: values.has("--env-file"),
    expectedCommitSha:
      values.get("--expected-commit") ?? process.env.OVE204_EXPECTED_COMMIT_SHA,
    deployedCommitSha:
      values.get("--deployed-commit") ?? process.env.OVE204_DEPLOYED_COMMIT_SHA,
  };
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  assert(
    url.protocol === "http:" || url.protocol === "https:",
    "HTTP base URL required",
  );
  assert(!url.username && !url.password, "base URL cannot include credentials");
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function assertSyntheticBoundary(userId: string, email: string) {
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      userId,
    ),
    "synthetic user boundary",
  );
  assertSyntheticVerificationBoundary(email);
}

export function assertSyntheticVerificationBoundary(email: string) {
  assert(
    email.startsWith(SYNTHETIC_EMAIL_PREFIX) &&
      email.endsWith(SYNTHETIC_EMAIL_SUFFIX),
    "synthetic email boundary",
  );
}

function requiredSyntheticUserId(state: SyntheticState) {
  assert(state.userId, "synthetic user was not created");
  assertSyntheticBoundary(state.userId, state.email);
  return state.userId;
}

function assertSafeEvidenceNode(value: unknown, key?: string) {
  if (typeof value === "boolean") return;
  if (typeof value === "number") {
    assert(
      Number.isInteger(value) && value >= 0 && value <= 20,
      "unsafe count",
    );
    return;
  }
  if (typeof value === "string") {
    if (key === "expectedCommitSha" || key === "deployedCommitSha") {
      assertExactCommit(value, key);
      return;
    }
    assert(ALLOWED_EVIDENCE_STRINGS.has(value), "unsafe evidence string");
    return;
  }
  assert(isRecord(value), "unsafe evidence value");
  for (const [key, nested] of Object.entries(value)) {
    assert(ALLOWED_EVIDENCE_KEYS.has(key), "unsafe evidence key");
    assertSafeEvidenceNode(nested, key);
  }
}

function assertExactCommit(value: string | undefined, label: string) {
  assert(
    Boolean(value && /^[0-9a-f]{40}$/.test(value)),
    `${label} must be exact SHA`,
  );
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  const fromGetter = withGetter.getSetCookie?.();
  if (fromGetter && fromGetter.length > 0) return fromGetter;
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,]+=)/) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label} mismatch`);
}

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

async function main() {
  const preliminary = parseCliOptions(process.argv.slice(2));
  loadEnv({
    path: preliminary.envFile,
    override: preliminary.envFileExplicit,
    quiet: true,
  });
  const options = parseCliOptions(process.argv.slice(2));

  let report: AccountSignOutEvidenceReport | AccountSignOutFailureReport;
  try {
    report = await runAccountSignOutSmoke(options);
  } catch {
    report = {
      ok: false,
      issue: "OVE-204",
      evidenceClass: "synthetic_current_access_sign_out",
      error: "account_sign_out_smoke_failed",
      evidenceSafety: EVIDENCE_SAFETY,
    };
    process.exitCode = 1;
  }
  assertAccountSignOutEvidenceSafe(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) void main();
