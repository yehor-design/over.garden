import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  auditNativeGoogleLinkContract,
  evaluateNativeGoogleLinkContract,
  modelConcurrentGoogleLinkAttempts,
  readNativeGoogleLinkSourceSnapshot,
  resolveNativeGoogleLinkCallbackClaim,
  serializeNativeGoogleLinkReceipt,
  type NativeGoogleLinkSourceSnapshot,
} from "./native-google-link-contract";

const appRoot = path.resolve(import.meta.dirname, "..");

function replaceRequired(
  snapshot: NativeGoogleLinkSourceSnapshot,
  file: keyof NativeGoogleLinkSourceSnapshot["files"],
  search: string,
  replacement: string,
) {
  const source = snapshot.files[file];
  if (!source.includes(search)) {
    throw new Error(`Fixture anchor was not found in ${file}.`);
  }

  return {
    ...snapshot,
    files: {
      ...snapshot.files,
      [file]: source.split(search).join(replacement),
    },
  };
}

describe("OVE-294 pinned native Google link contract", () => {
  let snapshot: NativeGoogleLinkSourceSnapshot;

  beforeAll(async () => {
    snapshot = await readNativeGoogleLinkSourceSnapshot({ appRoot });
  });

  it("proves the pinned native flow and emits a redacted deterministic handoff", () => {
    const receipt = evaluateNativeGoogleLinkContract(snapshot);

    expect(receipt).toMatchObject({
      contract: "ove294.nativeGoogleLink.v1",
      result: "native_google_link_supported",
      betterAuthVersion: "1.6.25",
      betterAuthCoreVersion: "1.6.25",
      providerSet: ["google"],
      stateStrategy: "database",
      runtimeReachabilityCount: 0,
      forbiddenCustomProtocolCount: 0,
      nativeUniqueness: {
        providerSubject: "absent",
        userProvider: "absent",
      },
      handoff: {
        issue: "OVE-295",
        aggregatePreflight: "required",
        providerSubjectUniqueIndex: "required",
        userProviderUniqueIndex: "required",
        authoritativeAccountMethodReadback: "required",
      },
      reasons: [],
    });
    expect(Object.keys(receipt.sourceDigests).sort()).toEqual([
      "accountSchema",
      "betterAuthPackage",
      "callback",
      "corePackage",
      "createContext",
      "googleProvider",
      "linkSocial",
      "lockfile",
      "oauthState",
      "signIn",
      "stateProtection",
    ]);
    expect(serializeNativeGoogleLinkReceipt(receipt)).not.toMatch(
      /fixture-secret|owner-a|raw@example|callbackURL=/i,
    );
  });

  it("is byte-identical across four independent evaluations", () => {
    const receipts = Array.from({ length: 4 }, () =>
      serializeNativeGoogleLinkReceipt(
        evaluateNativeGoogleLinkContract(structuredClone(snapshot)),
      ),
    );

    expect(new Set(receipts).size).toBe(1);
  });

  it("fails closed when session admission, initiating-owner binding, or callback order drifts", () => {
    const withoutSession = replaceRequired(
      snapshot,
      "linkSocial",
      "use: [sessionMiddleware]",
      "use: []",
    );
    expect(evaluateNativeGoogleLinkContract(withoutSession)).toMatchObject({
      result: "inconclusive",
      reasons: ["link_session_admission_drift"],
    });

    const withoutInitiator = replaceRequired(
      snapshot,
      "linkSocial",
      "userId: session.user.id",
      "userId: c.body.userId",
    );
    expect(evaluateNativeGoogleLinkContract(withoutInitiator)).toMatchObject({
      result: "inconclusive",
      reasons: ["initiating_owner_binding_drift"],
    });

    const reorderedCallback = replaceRequired(
      snapshot,
      "callback",
      "const { codeVerifier, callbackURL, link, errorURL, newUserURL, requestSignUp } = await parseState(c);",
      "const parsedState = await Promise.resolve({});",
    );
    expect(evaluateNativeGoogleLinkContract(reorderedCallback)).toMatchObject({
      result: "inconclusive",
      reasons: ["callback_state_order_drift"],
    });
  });

  it("fails closed when state protection, nonce equality, PKCE, or expiry drifts", () => {
    const withoutProtection = replaceRequired(
      snapshot,
      "stateProtection",
      "await c.setSignedCookie(stateCookie.name, state, c.context.secret, stateCookie.attributes);",
      "c.setCookie(stateCookie.name, state, stateCookie.attributes);",
    );
    expect(
      evaluateNativeGoogleLinkContract(withoutProtection).reasons,
    ).toContain("state_protection_drift");

    const withoutNonce = replaceRequired(
      snapshot,
      "stateProtection",
      "stateCookieValue !== state",
      "false",
    );
    expect(evaluateNativeGoogleLinkContract(withoutNonce).reasons).toContain(
      "state_nonce_drift",
    );

    const withoutPkce = replaceRequired(
      snapshot,
      "oauthState",
      "const codeVerifier = generateRandomString(128);",
      'const codeVerifier = "";',
    );
    expect(evaluateNativeGoogleLinkContract(withoutPkce).reasons).toContain(
      "pkce_drift",
    );

    const withoutExpiry = replaceRequired(
      snapshot,
      "oauthState",
      "expiresAt: Date.now() + 600 * 1e3",
      "expiresAt: Number.POSITIVE_INFINITY",
    );
    expect(evaluateNativeGoogleLinkContract(withoutExpiry).reasons).toContain(
      "state_expiry_drift",
    );
  });

  it("keeps ordinary Google sign-in distinct and rejects direct idToken before user-info or account effects", () => {
    const receipt = evaluateNativeGoogleLinkContract(snapshot);
    expect(receipt.anchors).toMatchObject({
      ordinarySignInWithoutLink: "present",
      directIdTokenRejectedBeforeUserInfo: "present",
      facebookRuntimeProvider: "absent",
    });

    const enabledIdToken = replaceRequired(
      snapshot,
      "googleProvider",
      "if (options.disableIdTokenSignIn) return false;",
      "if (options.disableIdTokenSignIn) return true;",
    );
    expect(evaluateNativeGoogleLinkContract(enabledIdToken).reasons).toContain(
      "direct_id_token_rejection_drift",
    );

    const linkedOrdinarySignIn = replaceRequired(
      snapshot,
      "signIn",
      "generateState(c, void 0, c.body.additionalData)",
      'generateState(c, { userId: "wrong", email: "wrong" }, c.body.additionalData)',
    );
    expect(
      evaluateNativeGoogleLinkContract(linkedOrdinarySignIn).reasons,
    ).toContain("ordinary_sign_in_authority_drift");
  });

  it("requires authoritative current-session account-method read-back and forbids redirect-only success", () => {
    const withoutReadback = replaceRequired(
      snapshot,
      "accountMethodsProjection",
      "auth.api.listUserAccounts",
      "auth.api.getSession",
    );
    expect(evaluateNativeGoogleLinkContract(withoutReadback)).toMatchObject({
      result: "inconclusive",
      reasons: ["account_method_readback_drift"],
    });

    const redirectSuccess: NativeGoogleLinkSourceSnapshot = {
      ...snapshot,
      files: {
        ...snapshot.files,
        accountMethodsPanel: `${snapshot.files.accountMethodsPanel}\nconst google_link_success = true;`,
      },
    };
    expect(evaluateNativeGoogleLinkContract(redirectSuccess).reasons).toContain(
      "account_method_readback_drift",
    );
  });

  it("uses the initiating protected-state owner after an A-to-B session switch and never grants B redirect-only success", () => {
    expect(
      resolveNativeGoogleLinkCallbackClaim({
        initiatingOwnerMatchesCurrentSession: false,
        currentSessionAuthoritativeReadbackHasGoogle: false,
      }),
    ).toEqual({
      accountWriteOwner: "initiating_protected_state_owner",
      currentSessionSuccess: "not_claimed",
      redirectOnlySuccess: false,
    });

    expect(
      resolveNativeGoogleLinkCallbackClaim({
        initiatingOwnerMatchesCurrentSession: true,
        currentSessionAuthoritativeReadbackHasGoogle: true,
      }),
    ).toEqual({
      accountWriteOwner: "initiating_protected_state_owner",
      currentSessionSuccess: "authoritative_readback",
      redirectOnlySuccess: false,
    });
  });

  it("hands 32-way contention to the exact two OVE-295 uniqueness boundaries", () => {
    expect(modelConcurrentGoogleLinkAttempts(32)).toEqual({
      attempts: 32,
      nativeConstraintCount: 0,
      requiredConstraintCount: 2,
      providerSubjectBoundary: "OVE-295",
      userProviderBoundary: "OVE-295",
    });
  });

  it("returns inconclusive if either native uniqueness boundary already exists or runtime imports the artifact", () => {
    const schemaDrift = replaceRequired(
      snapshot,
      "accountSchema",
      'fieldName: options.account?.fields?.accountId || "accountId"',
      'fieldName: options.account?.fields?.accountId || "accountId", unique: true',
    );
    expect(evaluateNativeGoogleLinkContract(schemaDrift).reasons).toContain(
      "native_uniqueness_drift",
    );

    const runtimeReachability: NativeGoogleLinkSourceSnapshot = {
      ...snapshot,
      runtimeSources: {
        ...snapshot.runtimeSources,
        "src/app/fixture.ts":
          'import "../../scripts/native-google-link-contract";',
      },
    };
    expect(evaluateNativeGoogleLinkContract(runtimeReachability)).toMatchObject(
      {
        result: "inconclusive",
        runtimeReachabilityCount: 1,
        reasons: ["runtime_reachability_detected"],
      },
    );
  });

  it("times out once without a late ready result, keeps status work independent, and recovers on a fresh run", async () => {
    let lateResolutionCount = 0;
    let repositoryStatusReadCount = 0;

    const timedOut = await auditNativeGoogleLinkContract({
      appRoot,
      deadlineMs: 10,
      loadSnapshot: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        lateResolutionCount += 1;
        return snapshot;
      },
      onRepositoryStatusRead: () => {
        repositoryStatusReadCount += 1;
      },
    });
    expect(timedOut).toMatchObject({
      result: "inconclusive",
      reasons: ["source_traversal_timeout"],
    });
    expect(repositoryStatusReadCount).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(lateResolutionCount).toBe(1);
    expect(timedOut).toMatchObject({
      result: "inconclusive",
      reasons: ["source_traversal_timeout"],
    });

    const recovered = await auditNativeGoogleLinkContract({
      appRoot,
      deadlineMs: 30_000,
    });
    expect(recovered.result).toBe("native_google_link_supported");
  });
});
