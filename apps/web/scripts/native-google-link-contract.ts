import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readFile, readdir, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const NATIVE_GOOGLE_LINK_CONTRACT =
  "ove294.nativeGoogleLink.v1" as const;
export const PINNED_BETTER_AUTH_VERSION = "1.6.25" as const;
export const NATIVE_GOOGLE_LINK_MAX_DURATION_MS = 30_000;

const EXPECTED_VENDOR_DIGESTS = {
  accountSchema:
    "3feb6a54d6fc71515eb0cd657bad0c28e3126a6a926b1d623b0fd29bd3c9f5fb",
  betterAuthPackage:
    "ff4fdd5dec97214dcdccca86cfc77ff7afbf9ec1a88ebdc348a2dd4c9aefcd0f",
  callback: "b5aa48bb54ac67479fbd4a4008574a691d2e38d70f4be9e4af527f930b7273f3",
  corePackage:
    "d2a4464bdf7f6f6632b54bde765f2cc815c0e69443151882efffdfb2d90d845f",
  createContext:
    "f0b2703838a4f5a190932936ecea080abdd76d393a669d851bb75ea48e9e4b41",
  googleProvider:
    "400593d0033bbcc6f175e37b9af130f9caa13cf1d05211f2c48d380e16fb6c49",
  linkSocial:
    "cc51373d3419e06aadfc2a69345f87342c969e28458c920d743e26e4dac6610b",
  lockfile: "6b46c458c2000401fdcde7b9a7ea99f05a51d9024c69f8baa8605b5b7e43b8d2",
  oauthState:
    "f2e9046f4df819c7923407cd56eca9a4a0765298a4b561436d36c57305530509",
  signIn: "f46306c831e87e4fd185e47f97925c72e8484b75bcd9535f19046595ff9604eb",
  stateProtection:
    "66c5447cf34b9a9f0ba69be8834c8a5f44a52ac2fad7ae2d53e9a43f80e988d5",
} as const;

type VendorDigestKey = keyof typeof EXPECTED_VENDOR_DIGESTS;

export interface NativeGoogleLinkSourceFiles {
  accountMethodsPanel: string;
  accountMethodsProjection: string;
  accountSchema: string;
  applicationSql: string;
  authConfig: string;
  betterAuthPackage: string;
  callback: string;
  corePackage: string;
  createContext: string;
  explicitGoogleLinking: string;
  googleOauthConfig: string;
  googleProvider: string;
  linkSocial: string;
  lockfile: string;
  oauthState: string;
  signIn: string;
  socialAccountPolicy: string;
  socialOauth: string;
  stateProtection: string;
}

export interface NativeGoogleLinkSourceSnapshot {
  files: NativeGoogleLinkSourceFiles;
  runtimeSources: Record<string, string>;
}

export type NativeGoogleLinkInconclusiveReason =
  | "account_method_readback_drift"
  | "callback_owner_write_drift"
  | "callback_state_order_drift"
  | "dependency_pin_drift"
  | "direct_id_token_rejection_drift"
  | "facebook_provider_present"
  | "forbidden_custom_protocol_detected"
  | "initiating_owner_binding_drift"
  | "link_session_admission_drift"
  | "native_uniqueness_drift"
  | "ordinary_sign_in_authority_drift"
  | "pkce_drift"
  | "provider_configuration_drift"
  | "runtime_reachability_detected"
  | "source_integrity_drift"
  | "source_traversal_failed"
  | "source_traversal_timeout"
  | "state_expiry_drift"
  | "state_nonce_drift"
  | "state_protection_drift"
  | "state_strategy_drift";

export interface NativeGoogleLinkReceipt {
  contract: typeof NATIVE_GOOGLE_LINK_CONTRACT;
  result: "native_google_link_supported" | "inconclusive";
  betterAuthVersion: string;
  betterAuthCoreVersion: string;
  providerSet: string[];
  stateStrategy: "database" | "inconclusive";
  anchors: {
    accountMethodReadback: "present" | "inconclusive";
    callbackUsesInitiatingOwner: "present" | "inconclusive";
    directIdTokenRejectedBeforeUserInfo: "present" | "inconclusive";
    facebookRuntimeProvider: "absent" | "present";
    linkSessionAdmission: "present" | "inconclusive";
    ordinarySignInWithoutLink: "present" | "inconclusive";
    pkce: "present" | "inconclusive";
    stateExpiry: "present" | "inconclusive";
    stateNonce: "present" | "inconclusive";
    stateProtection: "present" | "inconclusive";
  };
  nativeUniqueness: {
    providerSubject: "absent" | "present_or_changed";
    userProvider: "absent" | "present_or_changed";
  };
  handoff: {
    issue: "OVE-295";
    aggregatePreflight: "required";
    providerSubjectUniqueIndex: "required";
    userProviderUniqueIndex: "required";
    authoritativeAccountMethodReadback: "required";
  };
  sourceDigests: Record<VendorDigestKey, string>;
  runtimeReachabilityCount: number;
  forbiddenCustomProtocolCount: number;
  reasons: NativeGoogleLinkInconclusiveReason[];
}

type ReadSnapshotOptions = {
  appRoot?: string;
  includeBuildOutput?: boolean;
  signal?: AbortSignal;
};

type AuditOptions = {
  appRoot?: string;
  deadlineMs?: number;
  includeBuildOutput?: boolean;
  loadSnapshot?: (
    signal: AbortSignal,
  ) => Promise<NativeGoogleLinkSourceSnapshot>;
  onRepositoryStatusRead?: () => void;
};

const VENDOR_SEMANTIC_REASONS = new Set<NativeGoogleLinkInconclusiveReason>([
  "callback_owner_write_drift",
  "callback_state_order_drift",
  "direct_id_token_rejection_drift",
  "initiating_owner_binding_drift",
  "link_session_admission_drift",
  "native_uniqueness_drift",
  "ordinary_sign_in_authority_drift",
  "pkce_drift",
  "state_expiry_drift",
  "state_nonce_drift",
  "state_protection_drift",
  "state_strategy_drift",
]);

const RUNTIME_SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".map",
  ".mjs",
  ".ts",
  ".tsx",
]);

const FORBIDDEN_CUSTOM_PROTOCOL =
  /\b(?:googleLinkClaim|google_link_claim|GOOGLE_LINK_CLAIM|authenticatedGoogleLinkClaim|manualParseGoogleLinkState|googleLinkStateHmac)\b/u;
const RUNTIME_ARTIFACT_REFERENCE =
  /(?:native-google-link-contract|AUTHENTICATED_GOOGLE_LINK_CONTRACT)/u;

export async function readNativeGoogleLinkSourceSnapshot(
  options: ReadSnapshotOptions = {},
): Promise<NativeGoogleLinkSourceSnapshot> {
  const appRoot = path.resolve(options.appRoot ?? process.cwd());
  const signal = options.signal;
  signal?.throwIfAborted();

  const betterAuthRoot = await realpath(
    path.join(appRoot, "node_modules", "better-auth"),
  );
  const coreRoot = await realpath(
    path.join(path.dirname(betterAuthRoot), "@better-auth", "core"),
  );
  const read = (target: string) => readUtf8(target, signal);

  const sqlRoot = path.join(appRoot, "sql");
  const sqlNames = (await readdir(sqlRoot))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort((left, right) => left.localeCompare(right, "en"));
  const applicationSql = (
    await Promise.all(
      sqlNames.map(async (name) =>
        [name, await read(path.join(sqlRoot, name))].join("\n"),
      ),
    )
  ).join("\n");

  const [
    accountMethodsPanel,
    accountMethodsProjection,
    accountSchema,
    authConfig,
    betterAuthPackage,
    callback,
    corePackage,
    createContext,
    explicitGoogleLinking,
    googleOauthConfig,
    googleProvider,
    linkSocial,
    lockfile,
    oauthState,
    signIn,
    socialAccountPolicy,
    socialOauth,
    stateProtection,
    runtimeSources,
  ] = await Promise.all([
    read(path.join(appRoot, "src/app/garden/account-methods-panel.tsx")),
    read(path.join(appRoot, "src/server/auth/account-methods.ts")),
    read(path.join(coreRoot, "dist/db/get-tables.mjs")),
    read(path.join(appRoot, "src/lib/auth.ts")),
    read(path.join(betterAuthRoot, "package.json")),
    read(path.join(betterAuthRoot, "dist/api/routes/callback.mjs")),
    read(path.join(coreRoot, "package.json")),
    read(path.join(betterAuthRoot, "dist/context/create-context.mjs")),
    read(path.join(appRoot, "src/lib/auth/explicit-google-linking.ts")),
    read(path.join(appRoot, "src/lib/auth/google-oauth.ts")),
    read(path.join(coreRoot, "dist/social-providers/google.mjs")),
    read(path.join(betterAuthRoot, "dist/api/routes/account.mjs")),
    read(path.join(appRoot, "pnpm-lock.yaml")),
    read(path.join(betterAuthRoot, "dist/oauth2/state.mjs")),
    read(path.join(betterAuthRoot, "dist/api/routes/sign-in.mjs")),
    read(path.join(appRoot, "src/lib/auth/social-account-policy.ts")),
    read(path.join(appRoot, "src/lib/auth/social-oauth.ts")),
    read(path.join(betterAuthRoot, "dist/state.mjs")),
    readRuntimeSources(appRoot, signal, options.includeBuildOutput ?? false),
  ]);

  signal?.throwIfAborted();
  return {
    files: {
      accountMethodsPanel,
      accountMethodsProjection,
      accountSchema,
      applicationSql,
      authConfig,
      betterAuthPackage,
      callback,
      corePackage,
      createContext,
      explicitGoogleLinking,
      googleOauthConfig,
      googleProvider,
      linkSocial,
      lockfile,
      oauthState,
      signIn,
      socialAccountPolicy,
      socialOauth,
      stateProtection,
    },
    runtimeSources,
  };
}

export function evaluateNativeGoogleLinkContract(
  snapshot: NativeGoogleLinkSourceSnapshot,
): NativeGoogleLinkReceipt {
  const { files } = snapshot;
  const reasons = new Set<NativeGoogleLinkInconclusiveReason>();
  const sourceDigests = vendorDigests(files);
  const betterAuthVersion = packageVersion(files.betterAuthPackage);
  const betterAuthCoreVersion = packageVersion(files.corePackage);

  if (
    betterAuthVersion !== PINNED_BETTER_AUTH_VERSION ||
    betterAuthCoreVersion !== PINNED_BETTER_AUTH_VERSION ||
    !hasPinnedLockfile(files.lockfile)
  ) {
    reasons.add("dependency_pin_drift");
  }

  const linkSessionAdmission =
    files.linkSocial.includes('createAuthEndpoint("/link-social"') &&
    files.linkSocial.includes("use: [sessionMiddleware]");
  if (!linkSessionAdmission) reasons.add("link_session_admission_drift");

  const initiatingOwnerBinding =
    files.linkSocial.includes("userId: session.user.id") &&
    files.linkSocial.includes("email: session.user.email");
  if (!initiatingOwnerBinding) reasons.add("initiating_owner_binding_drift");

  const pkce =
    files.oauthState.includes(
      "const codeVerifier = generateRandomString(128);",
    ) &&
    files.oauthState.includes("codeVerifier,") &&
    files.googleProvider.includes(
      'if (!codeVerifier) throw new BetterAuthError("codeVerifier is required for Google")',
    ) &&
    files.googleProvider.includes("codeVerifier,");
  if (!pkce) reasons.add("pkce_drift");

  const stateExpiry =
    files.oauthState.includes("expiresAt: Date.now() + 600 * 1e3") &&
    files.stateProtection.includes("if (parsedData.expiresAt < Date.now())");
  if (!stateExpiry) reasons.add("state_expiry_drift");

  const stateStrategy =
    files.authConfig.includes("database: {") &&
    !files.authConfig.includes("storeStateStrategy") &&
    files.createContext.includes(
      'storeStateStrategy: options.account?.storeStateStrategy || (isStateful ? "database" : "cookie")',
    );
  if (!stateStrategy) reasons.add("state_strategy_drift");

  const stateProtection =
    files.stateProtection.includes(
      "await c.setSignedCookie(stateCookie.name, state, c.context.secret, stateCookie.attributes);",
    ) &&
    files.stateProtection.includes(
      "await c.context.internalAdapter.createVerificationValue",
    ) &&
    files.stateProtection.includes(
      "await c.getSignedCookie(stateCookie.name, c.context.secret)",
    ) &&
    files.stateProtection.includes(
      "await c.context.internalAdapter.deleteVerificationByIdentifier(state)",
    );
  if (!stateProtection) reasons.add("state_protection_drift");

  const stateNonce =
    files.stateProtection.includes("oauthState: state") &&
    files.stateProtection.includes("stateCookieValue !== state") &&
    files.stateProtection.includes("parsedData.oauthState !== state");
  if (!stateNonce) reasons.add("state_nonce_drift");

  const parseStateIndex = files.callback.indexOf(
    "const { codeVerifier, callbackURL, link, errorURL, newUserURL, requestSignUp } = await parseState(c);",
  );
  const providerExchangeIndex = files.callback.indexOf(
    "provider.validateAuthorizationCode",
  );
  const callbackStateOrder =
    parseStateIndex >= 0 &&
    providerExchangeIndex > parseStateIndex &&
    files.callback.includes("if (link) {");
  if (!callbackStateOrder) reasons.add("callback_state_order_drift");

  const callbackUsesInitiatingOwner =
    files.callback.includes("userId: link.userId") &&
    files.callback.includes("link.userId.toString()");
  if (!callbackUsesInitiatingOwner) reasons.add("callback_owner_write_drift");

  const ordinarySignInWithoutLink = files.signIn.includes(
    "generateState(c, void 0, c.body.additionalData)",
  );
  if (!ordinarySignInWithoutLink) {
    reasons.add("ordinary_sign_in_authority_drift");
  }

  const idTokenBranch = files.linkSocial.indexOf("if (c.body.idToken) {");
  const idTokenVerification = files.linkSocial.indexOf(
    "if (!await provider.verifyIdToken",
    idTokenBranch,
  );
  const idTokenUserInfo = files.linkSocial.indexOf(
    "const linkingUserInfo = await provider.getUserInfo",
    idTokenBranch,
  );
  const idTokenAccountWrite = files.linkSocial.indexOf(
    "await c.context.internalAdapter.createAccount",
    idTokenBranch,
  );
  const directIdTokenRejectedBeforeUserInfo =
    files.googleOauthConfig.includes("disableIdTokenSignIn: true") &&
    files.googleProvider.includes(
      "if (options.disableIdTokenSignIn) return false;",
    ) &&
    idTokenBranch >= 0 &&
    idTokenVerification > idTokenBranch &&
    idTokenUserInfo > idTokenVerification &&
    idTokenAccountWrite > idTokenUserInfo;
  if (!directIdTokenRejectedBeforeUserInfo) {
    reasons.add("direct_id_token_rejection_drift");
  }

  const accountMethodReadback =
    files.accountMethodsProjection.includes("auth.api.listUserAccounts") &&
    (files.accountMethodsProjection.includes(
      "hasGoogle: providerIds.has(GOOGLE_PROVIDER_ID)",
    ) ||
      files.accountMethodsProjection.includes(
        "const hasGoogle = providerIds.has(GOOGLE_PROVIDER_ID)",
      )) &&
    files.accountMethodsPanel.includes("hasGoogle") &&
    !files.accountMethodsPanel.includes("google_link_success");
  if (!accountMethodReadback) reasons.add("account_method_readback_drift");

  const accountIdBlock = fieldBlock(
    files.accountSchema,
    "accountId",
    "providerId",
  );
  const providerIdBlock = fieldBlock(
    files.accountSchema,
    "providerId",
    "userId",
  );
  const userIdBlock = fieldBlock(files.accountSchema, "userId", "accessToken");
  const providerSubjectUnique =
    /\bunique\s*:\s*true\b/u.test(accountIdBlock) ||
    /\bunique\s*:\s*true\b/u.test(providerIdBlock);
  const userProviderUnique =
    /\bunique\s*:\s*true\b/u.test(userIdBlock) ||
    files.accountSchema.includes("providerSubjectUnique") ||
    files.accountSchema.includes("userProviderUnique");
  if (providerSubjectUnique || userProviderUnique) {
    reasons.add("native_uniqueness_drift");
  }

  const providerSet: string[] = [];
  const explicitGooglePolicyConfigured =
    files.socialAccountPolicy.includes("trustedProviders: []") &&
    files.authConfig.includes(
      "socialAccountPolicy(isExplicitGoogleLinkingEnabled())",
    ) &&
    files.explicitGoogleLinking.includes('"GOOGLE_ACCOUNT_LINKING_ENABLED"') &&
    files.explicitGoogleLinking.includes(
      "body?.provider !== GOOGLE_PROVIDER_ID",
    );
  const googleConfigured =
    files.authConfig.includes("{ google: googleProvider }") &&
    (files.socialAccountPolicy.includes(
      "trustedProviders: [GOOGLE_PROVIDER_ID]",
    ) ||
      explicitGooglePolicyConfigured) &&
    files.socialOauth.includes('GOOGLE_PROVIDER_ID = "google"');
  if (googleConfigured) providerSet.push("google");
  const facebookConfigured =
    /\{\s*facebook\s*:/u.test(files.authConfig) ||
    /\bfacebookProvider\b/u.test(files.authConfig) ||
    /SocialProviderId[^;\n]*facebook/u.test(files.socialOauth);
  if (facebookConfigured) {
    providerSet.push("facebook");
    reasons.add("facebook_provider_present");
  }
  if (!googleConfigured) reasons.add("provider_configuration_drift");

  const runtimeReachabilityCount = Object.values(
    snapshot.runtimeSources,
  ).filter((source) => RUNTIME_ARTIFACT_REFERENCE.test(source)).length;
  if (runtimeReachabilityCount > 0) {
    reasons.add("runtime_reachability_detected");
  }

  const forbiddenCustomProtocolCount = Object.values(
    snapshot.runtimeSources,
  ).filter((source) => FORBIDDEN_CUSTOM_PROTOCOL.test(source)).length;
  if (forbiddenCustomProtocolCount > 0) {
    reasons.add("forbidden_custom_protocol_detected");
  }

  const hasVendorSemanticDrift = [...reasons].some((reason) =>
    VENDOR_SEMANTIC_REASONS.has(reason),
  );
  if (
    !hasVendorSemanticDrift &&
    (Object.keys(EXPECTED_VENDOR_DIGESTS) as VendorDigestKey[]).some(
      (key) => sourceDigests[key] !== EXPECTED_VENDOR_DIGESTS[key],
    )
  ) {
    reasons.add("source_integrity_drift");
  }

  return createReceipt({
    accountMethodReadback,
    betterAuthCoreVersion,
    betterAuthVersion,
    callbackUsesInitiatingOwner,
    directIdTokenRejectedBeforeUserInfo,
    facebookConfigured,
    forbiddenCustomProtocolCount,
    linkSessionAdmission,
    ordinarySignInWithoutLink,
    pkce,
    providerSet,
    providerSubjectUnique,
    reasons: [...reasons],
    runtimeReachabilityCount,
    sourceDigests,
    stateExpiry,
    stateNonce,
    stateProtection,
    stateStrategy,
    userProviderUnique,
  });
}

export async function auditNativeGoogleLinkContract(
  options: AuditOptions = {},
): Promise<NativeGoogleLinkReceipt> {
  const controller = new AbortController();
  const deadlineMs = Math.min(
    NATIVE_GOOGLE_LINK_MAX_DURATION_MS,
    Math.max(1, options.deadlineMs ?? NATIVE_GOOGLE_LINK_MAX_DURATION_MS),
  );
  options.onRepositoryStatusRead?.();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<NativeGoogleLinkReceipt>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new Error("source_traversal_timeout"));
      resolve(inconclusiveReceipt("source_traversal_timeout"));
    }, deadlineMs);
  });
  const load = options.loadSnapshot
    ? options.loadSnapshot(controller.signal)
    : readNativeGoogleLinkSourceSnapshot({
        appRoot: options.appRoot,
        includeBuildOutput: options.includeBuildOutput,
        signal: controller.signal,
      });
  const evaluated = load
    .then((snapshot) =>
      controller.signal.aborted
        ? inconclusiveReceipt("source_traversal_timeout")
        : evaluateNativeGoogleLinkContract(snapshot),
    )
    .catch((error: unknown) =>
      controller.signal.aborted || isAbortError(error)
        ? inconclusiveReceipt("source_traversal_timeout")
        : inconclusiveReceipt("source_traversal_failed"),
    );

  try {
    return await Promise.race([evaluated, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function serializeNativeGoogleLinkReceipt(
  receipt: NativeGoogleLinkReceipt,
) {
  return `${JSON.stringify(receipt)}\n`;
}

export function resolveNativeGoogleLinkCallbackClaim(input: {
  initiatingOwnerMatchesCurrentSession: boolean;
  currentSessionAuthoritativeReadbackHasGoogle: boolean;
}) {
  return {
    accountWriteOwner: "initiating_protected_state_owner" as const,
    currentSessionSuccess:
      input.initiatingOwnerMatchesCurrentSession &&
      input.currentSessionAuthoritativeReadbackHasGoogle
        ? ("authoritative_readback" as const)
        : ("not_claimed" as const),
    redirectOnlySuccess: false as const,
  };
}

export function modelConcurrentGoogleLinkAttempts(attempts: number) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10_000) {
    throw new RangeError("attempts must be an integer between 1 and 10000");
  }
  return {
    attempts,
    nativeConstraintCount: 0 as const,
    requiredConstraintCount: 2 as const,
    providerSubjectBoundary: "OVE-295" as const,
    userProviderBoundary: "OVE-295" as const,
  };
}

function createReceipt(input: {
  accountMethodReadback: boolean;
  betterAuthCoreVersion: string;
  betterAuthVersion: string;
  callbackUsesInitiatingOwner: boolean;
  directIdTokenRejectedBeforeUserInfo: boolean;
  facebookConfigured: boolean;
  forbiddenCustomProtocolCount: number;
  linkSessionAdmission: boolean;
  ordinarySignInWithoutLink: boolean;
  pkce: boolean;
  providerSet: string[];
  providerSubjectUnique: boolean;
  reasons: NativeGoogleLinkInconclusiveReason[];
  runtimeReachabilityCount: number;
  sourceDigests: Record<VendorDigestKey, string>;
  stateExpiry: boolean;
  stateNonce: boolean;
  stateProtection: boolean;
  stateStrategy: boolean;
  userProviderUnique: boolean;
}): NativeGoogleLinkReceipt {
  const reasons = [...new Set(input.reasons)].sort();
  return {
    contract: NATIVE_GOOGLE_LINK_CONTRACT,
    result:
      reasons.length === 0 ? "native_google_link_supported" : "inconclusive",
    betterAuthVersion: input.betterAuthVersion,
    betterAuthCoreVersion: input.betterAuthCoreVersion,
    providerSet: [...input.providerSet].sort(),
    stateStrategy: input.stateStrategy ? "database" : "inconclusive",
    anchors: {
      accountMethodReadback: input.accountMethodReadback
        ? "present"
        : "inconclusive",
      callbackUsesInitiatingOwner: input.callbackUsesInitiatingOwner
        ? "present"
        : "inconclusive",
      directIdTokenRejectedBeforeUserInfo:
        input.directIdTokenRejectedBeforeUserInfo ? "present" : "inconclusive",
      facebookRuntimeProvider: input.facebookConfigured ? "present" : "absent",
      linkSessionAdmission: input.linkSessionAdmission
        ? "present"
        : "inconclusive",
      ordinarySignInWithoutLink: input.ordinarySignInWithoutLink
        ? "present"
        : "inconclusive",
      pkce: input.pkce ? "present" : "inconclusive",
      stateExpiry: input.stateExpiry ? "present" : "inconclusive",
      stateNonce: input.stateNonce ? "present" : "inconclusive",
      stateProtection: input.stateProtection ? "present" : "inconclusive",
    },
    nativeUniqueness: {
      providerSubject: input.providerSubjectUnique
        ? "present_or_changed"
        : "absent",
      userProvider: input.userProviderUnique ? "present_or_changed" : "absent",
    },
    handoff: {
      issue: "OVE-295",
      aggregatePreflight: "required",
      providerSubjectUniqueIndex: "required",
      userProviderUniqueIndex: "required",
      authoritativeAccountMethodReadback: "required",
    },
    sourceDigests: input.sourceDigests,
    runtimeReachabilityCount: input.runtimeReachabilityCount,
    forbiddenCustomProtocolCount: input.forbiddenCustomProtocolCount,
    reasons,
  };
}

function inconclusiveReceipt(
  reason: "source_traversal_failed" | "source_traversal_timeout",
): NativeGoogleLinkReceipt {
  const emptyDigests = Object.fromEntries(
    (Object.keys(EXPECTED_VENDOR_DIGESTS) as VendorDigestKey[]).map((key) => [
      key,
      "unavailable",
    ]),
  ) as Record<VendorDigestKey, string>;
  return createReceipt({
    accountMethodReadback: false,
    betterAuthCoreVersion: "unresolved",
    betterAuthVersion: "unresolved",
    callbackUsesInitiatingOwner: false,
    directIdTokenRejectedBeforeUserInfo: false,
    facebookConfigured: false,
    forbiddenCustomProtocolCount: 0,
    linkSessionAdmission: false,
    ordinarySignInWithoutLink: false,
    pkce: false,
    providerSet: [],
    providerSubjectUnique: false,
    reasons: [reason],
    runtimeReachabilityCount: 0,
    sourceDigests: emptyDigests,
    stateExpiry: false,
    stateNonce: false,
    stateProtection: false,
    stateStrategy: false,
    userProviderUnique: false,
  });
}

function vendorDigests(
  files: NativeGoogleLinkSourceFiles,
): Record<VendorDigestKey, string> {
  return {
    accountSchema: sha256(files.accountSchema),
    betterAuthPackage: sha256(files.betterAuthPackage),
    callback: sha256(files.callback),
    corePackage: sha256(files.corePackage),
    createContext: sha256(files.createContext),
    googleProvider: sha256(files.googleProvider),
    linkSocial: sha256(files.linkSocial),
    lockfile: sha256(files.lockfile),
    oauthState: sha256(files.oauthState),
    signIn: sha256(files.signIn),
    stateProtection: sha256(files.stateProtection),
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function packageVersion(packageJson: string) {
  try {
    const parsed = JSON.parse(packageJson) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unresolved";
  } catch {
    return "unresolved";
  }
}

function hasPinnedLockfile(lockfile: string) {
  return (
    lockfile.includes(
      `better-auth:\n        specifier: ${PINNED_BETTER_AUTH_VERSION}\n        version: ${PINNED_BETTER_AUTH_VERSION}(`,
    ) &&
    lockfile.includes(`  '@better-auth/core@${PINNED_BETTER_AUTH_VERSION}':`) &&
    lockfile.includes(`  better-auth@${PINNED_BETTER_AUTH_VERSION}:`)
  );
}

function fieldBlock(source: string, field: string, nextField: string) {
  const accountStart = source.indexOf("account: {");
  const start = source.indexOf(`${field}: {`, accountStart);
  const end = source.indexOf(`${nextField}: {`, start + field.length);
  if (accountStart < 0 || start < 0 || end < 0) return "";
  return source.slice(start, end);
}

async function readUtf8(target: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return readFile(target, { encoding: "utf8", signal });
}

async function readRuntimeSources(
  appRoot: string,
  signal?: AbortSignal,
  includeBuildOutput = false,
): Promise<Record<string, string>> {
  const roots = ["src/app", "src/components", "src/lib", "src/server"];
  if (includeBuildOutput) {
    roots.push(".next/server", ".next/static");
  }
  const entries = (
    await Promise.all(
      roots.map((root) =>
        collectSourceFiles(appRoot, path.join(appRoot, root), signal),
      ),
    )
  ).flat();
  const proxyPath = path.join(appRoot, "src/proxy.ts");
  try {
    entries.push(["src/proxy.ts", await readUtf8(proxyPath, signal)]);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (!isMissingFileError(error)) throw error;
  }
  return Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

async function collectSourceFiles(
  appRoot: string,
  directory: string,
  signal?: AbortSignal,
): Promise<Array<[string, string]>> {
  signal?.throwIfAborted();
  const dirents = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name, "en"),
  );
  const result: Array<[string, string]> = [];
  for (const dirent of dirents) {
    signal?.throwIfAborted();
    const target = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      result.push(...(await collectSourceFiles(appRoot, target, signal)));
      continue;
    }
    if (!isRuntimeSource(dirent)) continue;
    result.push([
      path.relative(appRoot, target).split(path.sep).join("/"),
      await readUtf8(target, signal),
    ]);
  }
  return result;
}

function isRuntimeSource(dirent: Dirent) {
  return (
    dirent.isFile() && RUNTIME_SOURCE_EXTENSIONS.has(path.extname(dirent.name))
  );
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message === "source_traversal_timeout")
  );
}

function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function runCli() {
  const check = process.argv.includes("--check");
  const receipt = await auditNativeGoogleLinkContract({
    includeBuildOutput: process.argv.includes("--build-output"),
  });
  process.stdout.write(serializeNativeGoogleLinkReceipt(receipt));
  if (check && receipt.result !== "native_google_link_supported") {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli().catch(() => {
    process.stdout.write(
      serializeNativeGoogleLinkReceipt(
        inconclusiveReceipt("source_traversal_failed"),
      ),
    );
    process.exitCode = 1;
  });
}
