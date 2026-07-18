import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertAccountSignOutEvidenceSafe,
  assertImmutableContinuityPreserved,
  assertOldCookieSessionNull,
  assertOldSessionGuestRouteContract,
  assertSyntheticCleanupIdentityBound,
  cleanupSyntheticAccount,
  assertTwoClientRevocationInvariant,
  compareImmutableContinuitySnapshots,
  CURRENT_SESSION_BINDING_HEADER,
  PROTECTED_MUTATION_PATH,
  resolveDeploymentEvidence,
  SESSION_CONFIRMATION_PATH,
  SIGN_OUT_PATH,
  type AccountSignOutEvidenceReport,
  type ImmutableContinuitySnapshot,
} from "./smoke-account-sign-out";

const SYNTHETIC_USER_ID = "00000000-0000-4000-8000-000000002040";
const FORGED_USER_ID = "00000000-0000-4000-8000-000000002041";
const SYNTHETIC_EMAIL = "ove204-sign-out-contract@over.garden";
const EXACT_SHA = "a".repeat(40);

const source = readFileSync(
  path.join(process.cwd(), "scripts", "smoke-account-sign-out.ts"),
  "utf8",
);

function safeReport(): AccountSignOutEvidenceReport {
  const aggregate = {
    users: 1,
    publicProfiles: 1,
    currentClaims: 1,
    linkedAccounts: 3,
    syntheticRoles: 0,
    ownerRoleRows: 1,
    gardenRows: 3,
  };
  return {
    ok: true,
    issue: "OVE-204",
    evidenceClass: "synthetic_current_access_sign_out",
    runtimeClass: "local",
    deploymentEvidence: {
      class: "not_asserted_local",
      independentlyResolvedFromRuntime: false,
    },
    accountCreation: { verified: true, signupAccessReset: true },
    serverAggregateBefore: aggregate,
    serverAggregateAfter: aggregate,
    providerNeutrality: {
      structuralLinkClasses: 3,
      structuralLinksPreserved: true,
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
      privateGardenReadbackPreserved: true,
      serverAggregateUnchanged: true,
      identityRecordsPreserved: true,
      providerLinksPreserved: true,
      roleRecordsPreserved: true,
      gardenRecordsPreserved: true,
      identityDuplicates: 0,
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
    cleanup: { syntheticResidueRows: 0, syntheticResidueAbsent: true },
    evidenceSafety:
      "bounded_counts_and_booleans_no_identifiers_or_private_content",
  };
}

describe("OVE-204 account sign-out smoke", () => {
  it("uses only the canonical same-origin Better Auth POST boundary", () => {
    expect(SIGN_OUT_PATH).toBe("/api/auth/sign-out");
    expect(SESSION_CONFIRMATION_PATH).toContain("disableCookieCache=true");
    expect(PROTECTED_MUTATION_PATH).toBe("/api/garden/entries");
    expect(CURRENT_SESSION_BINDING_HEADER).toBe(
      "x-overgarden-current-session-binding",
    );
    expect(source).toContain("fetch(`${baseUrl}${SIGN_OUT_PATH}`");
    expect(source).toMatch(
      /fetch\(`\$\{baseUrl\}\$\{SIGN_OUT_PATH\}`,[\s\S]*?method: "POST"/,
    );
    expect(source).toMatch(
      /fetch\(`\$\{baseUrl\}\$\{SIGN_OUT_PATH\}`,[\s\S]*?Origin: baseUrl/,
    );
    expect(source).toContain('method: "GET"');
    expect(source).toContain('Origin: "https://ove204-hostile-origin.invalid"');
    expect(source).toContain("await assertMethodAndOriginProtection(");
    expect(source).toContain("deriveCurrentSessionBinding(sessionId)");
    expect(source).toContain("await assertOldSessionCannotReadPrivateRoutes(");
    expect(source).not.toMatch(/document\.cookie|cookies?\.delete\(/);
  });

  it("proves the exact two-client revocation lifecycle", () => {
    expect(() =>
      assertTwoClientRevocationInvariant({
        beforeAccessIds: ["first", "second"],
        firstAccessId: "first",
        secondAccessId: "second",
        afterRevocationAccessIds: ["second"],
        reauthenticatedAccessId: "replacement",
        afterReauthenticationAccessIds: ["second", "replacement"],
      }),
    ).not.toThrow();
  });

  it.each([
    {
      label: "both clients revoked",
      afterRevocationAccessIds: [] as string[],
      afterReauthenticationAccessIds: ["replacement"],
    },
    {
      label: "first client remains",
      afterRevocationAccessIds: ["first", "second"],
      afterReauthenticationAccessIds: ["first", "second"],
    },
    {
      label: "revoked row returns",
      afterRevocationAccessIds: ["second"],
      afterReauthenticationAccessIds: ["first", "second"],
    },
  ])(
    "rejects $label",
    ({ afterRevocationAccessIds, afterReauthenticationAccessIds }) => {
      expect(() =>
        assertTwoClientRevocationInvariant({
          beforeAccessIds: ["first", "second"],
          firstAccessId: "first",
          secondAccessId: "second",
          afterRevocationAccessIds,
          reauthenticatedAccessId: "replacement",
          afterReauthenticationAccessIds,
        }),
      ).toThrow();
    },
  );

  it("requires caller-supplied exact SHA equality for every non-loopback run without claiming runtime discovery", () => {
    expect(resolveDeploymentEvidence({}, "http://localhost:3000")).toEqual({
      class: "not_asserted_local",
      independentlyResolvedFromRuntime: false,
    });
    expect(() =>
      resolveDeploymentEvidence({}, "https://over.garden"),
    ).toThrow();
    expect(() =>
      resolveDeploymentEvidence(
        { expectedCommitSha: EXACT_SHA },
        "https://over.garden",
      ),
    ).toThrow();
    expect(() =>
      resolveDeploymentEvidence(
        {
          expectedCommitSha: EXACT_SHA,
          deployedCommitSha: "b".repeat(40),
        },
        "https://over.garden",
      ),
    ).toThrow();
    expect(
      resolveDeploymentEvidence(
        {
          expectedCommitSha: EXACT_SHA,
          deployedCommitSha: EXACT_SHA,
        },
        "https://over.garden",
      ),
    ).toEqual({
      class: "caller_asserted_exact_sha_match",
      expectedCommitSha: EXACT_SHA,
      deployedCommitSha: EXACT_SHA,
      independentlyResolvedFromRuntime: false,
    });
  });

  it("fails closed unless cleanup rebinds the exact synthetic id and email", () => {
    const expected = { id: SYNTHETIC_USER_ID, email: SYNTHETIC_EMAIL };
    expect(() =>
      assertSyntheticCleanupIdentityBound(expected, expected),
    ).not.toThrow();
    expect(() =>
      assertSyntheticCleanupIdentityBound(expected, {
        id: FORGED_USER_ID,
        email: SYNTHETIC_EMAIL,
      }),
    ).toThrow();
    expect(() =>
      assertSyntheticCleanupIdentityBound(expected, {
        id: SYNTHETIC_USER_ID,
        email: "ove204-sign-out-other@over.garden",
      }),
    ).toThrow();
    expect(() => assertSyntheticCleanupIdentityBound(expected, null)).toThrow();

    const bindingIndex = source.indexOf("assertSyntheticCleanupIdentityBound(");
    const firstDeleteIndex = source.indexOf('.deleteFrom("analytics_events")');
    expect(source).toContain(".forUpdate()");
    expect(bindingIndex).toBeGreaterThan(0);
    expect(firstDeleteIndex).toBeGreaterThan(bindingIndex);
  });

  it("deletes exact verification-only residue after signup fails before creating a user", async () => {
    const adjacentIdentifier = `email-verification:${SYNTHETIC_EMAIL}`;
    const fake = createVerificationOnlyCleanupDatabase([
      SYNTHETIC_EMAIL,
      adjacentIdentifier,
    ]);

    await cleanupSyntheticAccount(
      fake.database as unknown as Parameters<typeof cleanupSyntheticAccount>[0],
      { email: SYNTHETIC_EMAIL },
    );

    expect([...fake.verificationIdentifiers]).toEqual([adjacentIdentifier]);
    expect(fake.deletedTables).toEqual(["verification"]);
    expect(source).toContain('.where("identifier", "=", state.email)');
    expect(source).not.toContain('.where("identifier", "like"');
    expect(source.indexOf('.deleteFrom("verification")')).toBeLessThan(
      source.indexOf("if (!persisted && !state.userId) return"),
    );
  });

  it("requires exact guest contracts for every old-cookie page", () => {
    const guest = '<section data-testid="garden-auth-panel"></section>';
    expect(() =>
      assertOldSessionGuestRouteContract("garden", 200, guest),
    ).not.toThrow();
    expect(() =>
      assertOldSessionGuestRouteContract("profile", 200, guest),
    ).not.toThrow();
    expect(() =>
      assertOldSessionGuestRouteContract(
        "admin",
        200,
        `${guest}<main data-operator-access-state="sign-in-required"></main>`,
      ),
    ).not.toThrow();

    expect(() =>
      assertOldSessionGuestRouteContract("admin", 500, ""),
    ).toThrow();
    expect(() =>
      assertOldSessionGuestRouteContract(
        "profile",
        200,
        `${guest}<div data-owner-profile-editor="v3"></div>`,
      ),
    ).toThrow();
    expect(() =>
      assertOldSessionGuestRouteContract(
        "admin",
        200,
        `${guest}<main data-operator-access-state="denied"></main>`,
      ),
    ).toThrow();
    expect(() =>
      assertOldSessionGuestRouteContract(
        "garden",
        200,
        '<aside data-authenticated-utility-region="true"></aside>',
      ),
    ).toThrow();
  });

  it("requires the pre-signout cookie snapshot itself to resolve null", () => {
    expect(() => assertOldCookieSessionNull(200, null)).not.toThrow();
    expect(() =>
      assertOldCookieSessionNull(200, { session: { id: "stale" } }),
    ).toThrow();
    expect(() => assertOldCookieSessionNull(500, null)).toThrow();

    expect(
      source.indexOf("const revokedCookieHeader = firstClient.header()"),
    ).toBeLessThan(source.indexOf("await postCanonicalSignOut("));
    expect(source).toContain(
      "await assertRawOldCookieSessionIsNull(baseUrl, revokedCookieHeader)",
    );
  });

  it("detects exact identity, provider, role, and garden snapshot mutations", () => {
    const snapshot: ImmutableContinuitySnapshot = {
      identityRecords: [
        { recordType: "user", id: "user-a" },
        { recordType: "profile", handle: "gardener-a" },
        {
          recordType: "handle_claim",
          normalized_handle: "gardener-a",
          lifecycle_state: "current",
        },
      ],
      providerLinks: [
        { recordType: "provider_link", id: "link-a", providerId: "google" },
      ],
      roleRecords: [
        { recordType: "owner_role", userId: "owner-a", role: "owner" },
      ],
      gardenRecords: [
        { recordType: "space", id: "space-a", displayName: "Garden" },
        { recordType: "plant_object", id: "object-a", spaceId: "space-a" },
        { recordType: "journal_entry", id: "entry-a", body: "Private" },
      ],
    };
    const equalComparison = compareImmutableContinuitySnapshots(
      snapshot,
      structuredClone(snapshot),
    );
    expect(equalComparison).toEqual({
      identityRecordsPreserved: true,
      providerLinksPreserved: true,
      roleRecordsPreserved: true,
      gardenRecordsPreserved: true,
      identityDuplicates: 0,
    });
    expect(() =>
      assertImmutableContinuityPreserved(equalComparison),
    ).not.toThrow();

    const changedProvider = structuredClone(snapshot);
    changedProvider.providerLinks = [
      { recordType: "provider_link", id: "link-b", providerId: "google" },
    ];
    const providerComparison = compareImmutableContinuitySnapshots(
      snapshot,
      changedProvider,
    );
    expect(providerComparison.providerLinksPreserved).toBe(false);
    expect(() =>
      assertImmutableContinuityPreserved(providerComparison),
    ).toThrow();

    const changedGarden = structuredClone(snapshot);
    changedGarden.gardenRecords = changedGarden.gardenRecords.slice(0, 2);
    const gardenComparison = compareImmutableContinuitySnapshots(
      snapshot,
      changedGarden,
    );
    expect(gardenComparison.gardenRecordsPreserved).toBe(false);
    expect(() =>
      assertImmutableContinuityPreserved(gardenComparison),
    ).toThrow();

    const duplicateIdentity = structuredClone(snapshot);
    duplicateIdentity.identityRecords = [
      ...duplicateIdentity.identityRecords,
      { recordType: "profile", handle: "duplicate" },
    ];
    const duplicateComparison = compareImmutableContinuitySnapshots(
      snapshot,
      duplicateIdentity,
    );
    expect(duplicateComparison.identityDuplicates).toBe(1);
    expect(() =>
      assertImmutableContinuityPreserved(duplicateComparison),
    ).toThrow();
  });

  it("enforces a closed evidence allowlist without identifiers or private content", () => {
    expect(() => assertAccountSignOutEvidenceSafe(safeReport())).not.toThrow();
    expect(() =>
      assertAccountSignOutEvidenceSafe({
        ...safeReport(),
        runtimeClass: "remote",
        deploymentEvidence: {
          class: "caller_asserted_exact_sha_match",
          expectedCommitSha: EXACT_SHA,
          deployedCommitSha: EXACT_SHA,
          independentlyResolvedFromRuntime: false,
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertAccountSignOutEvidenceSafe({
        ...safeReport(),
        unexpected: "safe-looking-but-not-allowed",
      }),
    ).toThrow();
    expect(() =>
      assertAccountSignOutEvidenceSafe({
        ...safeReport(),
        error: "person@example.test",
      }),
    ).toThrow();
    expect(() =>
      assertAccountSignOutEvidenceSafe({
        ...safeReport(),
        error: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      assertAccountSignOutEvidenceSafe({
        ...safeReport(),
        error: "private garden payload",
      }),
    ).toThrow();
  });

  it("structurally resets signup access, uses independent jars, and proves cleanup", () => {
    expect(source).toContain("const firstClient = new CookieJar()");
    expect(source).toContain("const secondClient = new CookieJar()");
    expect(source).toContain("await resetSignupAccessRows(database, userId)");
    expect(source).toContain("assertExactlyTwoConcurrentAccessRows(");
    expect(source).toContain(
      "await countAccessRow(database, firstIdentity.sessionId)",
    );
    expect(source).toContain("await assertAuthoritativelySignedOut(");
    expect(source).toContain("await cleanupSyntheticAccount(database, state)");
    expect(source).toContain("readCleanupResidueFromFreshConnection");
    expect(source).toContain("countVerificationRows(database, state.email)");
    expect(source).toContain("countGlobalOwnerRoleRows(database)");
    expect(source).toContain("readImmutableContinuitySnapshot(");
    expect(source).toContain('insertInto("plant_objects")');
    expect(source).toContain('insertInto("journal_entries")');
    expect(source).toContain('error: "account_sign_out_smoke_failed"');
  });

  it("is wired as the supported package command", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["smoke:account-sign-out"]).toBe(
      "NODE_OPTIONS=--conditions=react-server tsx scripts/smoke-account-sign-out.ts",
    );
  });
});

interface FakeCleanupQuery {
  select(...selection: unknown[]): FakeCleanupQuery;
  where(...filter: unknown[]): FakeCleanupQuery;
  forUpdate(): FakeCleanupQuery;
  executeTakeFirst(): Promise<undefined>;
  execute(): Promise<void>;
}

interface FakeCleanupTransaction {
  selectFrom(table: string): FakeCleanupQuery;
  deleteFrom(table: string): FakeCleanupQuery;
}

function createVerificationOnlyCleanupDatabase(identifiers: string[]) {
  const verificationIdentifiers = new Set(identifiers);
  const deletedTables: string[] = [];

  const transaction: FakeCleanupTransaction = {
    selectFrom(table) {
      if (table !== "user") throw new Error(`Unexpected select: ${table}`);
      const query: FakeCleanupQuery = {
        select: () => query,
        where: () => query,
        forUpdate: () => query,
        executeTakeFirst: async () => undefined,
        execute: async () => undefined,
      };
      return query;
    },
    deleteFrom(table) {
      deletedTables.push(table);
      let filter: readonly unknown[] = [];
      const query: FakeCleanupQuery = {
        select: () => query,
        where: (...nextFilter) => {
          filter = nextFilter;
          return query;
        },
        forUpdate: () => query,
        executeTakeFirst: async () => undefined,
        execute: async () => {
          if (table !== "verification") {
            throw new Error(`Unexpected delete: ${table}`);
          }
          const [column, operator, value] = filter;
          if (
            column !== "identifier" ||
            operator !== "=" ||
            typeof value !== "string"
          ) {
            throw new Error("Verification cleanup must use exact identity.");
          }
          verificationIdentifiers.delete(value);
        },
      };
      return query;
    },
  };

  return {
    database: {
      transaction: () => ({
        execute: async (
          callback: (trx: FakeCleanupTransaction) => Promise<unknown>,
        ) => callback(transaction),
      }),
    },
    deletedTables,
    verificationIdentifiers,
  };
}
