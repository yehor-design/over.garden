import { createHash } from "node:crypto";

export const AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_SCHEMA_VERSION =
  "overgarden.authenticated-mutation-semantic-adapter.v1" as const;

export type AuthenticatedMutationSemanticAtomicity =
  | "database_transaction"
  | "auth_adapter_commit"
  | "provider_operation"
  | "cookie_commit";

export type AuthenticatedMutationSemanticEffectFamily =
  | "canonical_row"
  | "transactional_outbox"
  | "auth_account"
  | "auth_session"
  | "browser_cookie"
  | "external_call";

export type AuthenticatedMutationSemanticExecutionMode =
  | "required"
  | "conditional"
  | "asynchronous_from_durable_intent";

export interface AuthenticatedMutationSemanticPackageRequirement {
  name: string;
  version: string;
  integrity: string;
}

export interface AuthenticatedMutationSemanticSourceRequirement {
  path: string;
  sha256: string;
}

export interface AuthenticatedMutationSemanticEffectBoundary {
  effectBoundaryId: string;
  ownerPath: string;
  ownerSymbol: string;
  commitLabel: string;
  atomicity: AuthenticatedMutationSemanticAtomicity;
  effectFamilies: readonly AuthenticatedMutationSemanticEffectFamily[];
  evidencePaths: readonly string[];
  /** Every anchor must occur in at least one of this boundary's evidence files. */
  semanticAnchors: readonly string[];
}

export interface AuthenticatedMutationSemanticVariantBoundary {
  effectBoundaryId: string;
  executionMode: AuthenticatedMutationSemanticExecutionMode;
}

export interface AuthenticatedMutationSemanticVariant {
  variantId: string;
  effectBoundaries: readonly AuthenticatedMutationSemanticVariantBoundary[];
  zeroEffectReason?: string;
  evidencePaths?: readonly string[];
  semanticAnchors?: readonly string[];
}

export interface AuthenticatedMutationSemanticManifest {
  schemaVersion: typeof AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_SCHEMA_VERSION;
  packages: readonly AuthenticatedMutationSemanticPackageRequirement[];
  sources: readonly AuthenticatedMutationSemanticSourceRequirement[];
  effectBoundaries: readonly AuthenticatedMutationSemanticEffectBoundary[];
  variants: readonly AuthenticatedMutationSemanticVariant[];
}

export interface AuthenticatedMutationSemanticEvidence {
  packages: readonly AuthenticatedMutationSemanticPackageRequirement[];
  sources: readonly { path: string; sourceText: string }[];
}

export type AuthenticatedMutationSemanticFindingCode =
  | "schema_version_mismatch"
  | "duplicate_package_requirement"
  | "duplicate_package_evidence"
  | "missing_package_evidence"
  | "unexpected_package_evidence"
  | "package_version_mismatch"
  | "package_integrity_mismatch"
  | "invalid_source_path"
  | "duplicate_source_requirement"
  | "duplicate_source_evidence"
  | "missing_source_evidence"
  | "unexpected_source_evidence"
  | "source_hash_mismatch"
  | "duplicate_effect_boundary_id"
  | "invalid_effect_boundary"
  | "dangling_boundary_evidence"
  | "duplicate_effect_family"
  | "duplicate_boundary_evidence"
  | "semantic_anchor_mismatch"
  | "duplicate_variant_id"
  | "empty_variant"
  | "dangling_effect_boundary"
  | "duplicate_variant_boundary"
  | "unowned_semantic_boundary";

export interface AuthenticatedMutationSemanticFinding {
  code: AuthenticatedMutationSemanticFindingCode;
  subjectId: string;
  message: string;
}

export interface AuthenticatedMutationSemanticValidationResult {
  schemaVersion: typeof AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_SCHEMA_VERSION;
  decisionState: "ready" | "inconclusive";
  findings: readonly AuthenticatedMutationSemanticFinding[];
  boundaryIds: readonly string[];
  variantIds: readonly string[];
  manifestDigest: string;
  sourceEvidenceDigest: string;
  receiptDigest: string;
}

const BETTER_AUTH_VERSION = "1.6.25";

export const AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST = {
  schemaVersion: AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_SCHEMA_VERSION,
  packages: [
    {
      name: "@better-auth/core",
      version: BETTER_AUTH_VERSION,
      integrity:
        "sha512-lMTlhtwyK4NpY9kPF+2rQCRKYpg136d3gM2xl8esxT1PjJx5Nh5YwZvxcYCIjDuO759sx6TCloJTuwcZGG6ZBw==",
    },
    {
      name: "better-auth",
      version: BETTER_AUTH_VERSION,
      integrity:
        "sha512-fvoq+oCO+FF5fpP3XfU7znRyGFpHB77UG2EyxsKNy+Cak7Q5pELu+auvvDveQbWQxcoKugZ7jYQQPFQLpUTGOw==",
    },
  ],
  sources: [
    {
      path: "node_modules/.pnpm/node_modules/@better-auth/core/dist/social-providers/google.mjs",
      sha256:
        "400593d0033bbcc6f175e37b9af130f9caa13cf1d05211f2c48d380e16fb6c49",
    },
    {
      path: "node_modules/better-auth/dist/api/routes/account.mjs",
      sha256:
        "cc51373d3419e06aadfc2a69345f87342c969e28458c920d743e26e4dac6610b",
    },
    {
      path: "node_modules/better-auth/dist/api/routes/callback.mjs",
      sha256:
        "b5aa48bb54ac67479fbd4a4008574a691d2e38d70f4be9e4af527f930b7273f3",
    },
    {
      path: "node_modules/better-auth/dist/api/routes/email-verification.mjs",
      sha256:
        "f240c0d7e592edecaec282658e0ae217e14564f574a37d6055755c8404a6afee",
    },
    {
      path: "node_modules/better-auth/dist/api/routes/password.mjs",
      sha256:
        "b45b5a6cb6320173c97ce9bf54ca39ece2f5ec6c7f26873a9c9dfa5a983e1af7",
    },
    {
      path: "node_modules/better-auth/dist/api/routes/session.mjs",
      sha256:
        "d359e4904fe2276b173d8ce149c0f0747d5e55804ed9deb474e0f67003fe73dc",
    },
    {
      path: "node_modules/better-auth/dist/api/routes/sign-in.mjs",
      sha256:
        "f46306c831e87e4fd185e47f97925c72e8484b75bcd9535f19046595ff9604eb",
    },
    {
      path: "node_modules/better-auth/dist/api/routes/sign-out.mjs",
      sha256:
        "a130b00bd64c2e42bf2e7a1204e76b1d7493f4599db9f0bd354032a8c0bb24c3",
    },
    {
      path: "node_modules/better-auth/dist/api/routes/sign-up.mjs",
      sha256:
        "e392a828be894ad29fb54810d1657643d31cf0def21152b6846fe680feb32afa",
    },
    {
      path: "node_modules/better-auth/dist/cookies/index.mjs",
      sha256:
        "c9fae72096771f4136183278073d1e97c327c599d553d6171af1b6f72a50a18f",
    },
    {
      path: "node_modules/better-auth/dist/db/with-hooks.mjs",
      sha256:
        "e5f739e10ef22701814e7fd61b92118e3a757c8aa8f28783a691f5ff9d4084a8",
    },
    {
      path: "node_modules/better-auth/dist/integrations/next-js.mjs",
      sha256:
        "9771fc27835847c4f3152e33e836fd8e466c45c07eeb79d83da3260ad3fd4489",
    },
    {
      path: "pnpm-lock.yaml",
      sha256:
        "e3e2bba7d986e34d2028b1f86c80a1ff5cc5ff514025d36d4a7728f0568c16fa",
    },
    {
      path: "sql/0001_walking_skeleton.sql",
      sha256:
        "2baac2ad99f7a6b1c93d018d38b5b46316b9317ea0bee269b99b67932b9324fd",
    },
    {
      path: "sql/0015_ove241_auth_email_outbox.sql",
      sha256:
        "d87598323ccf691bb4f1a55464d0e2e265bd349a0e20670a21f5792b9be5b3ea",
    },
    {
      path: "src/app/api/auth/[...all]/route.ts",
      sha256:
        "7e1160516e8c9ee2324b66513de07815abfd64b8ed75cc27983bda0a6f0c1f3e",
    },
    {
      path: "src/lib/auth/google-oauth.ts",
      sha256:
        "8be083f60da9e00ad1d13a46f261482656e00b13756289e731bd0a2bead4c4fb",
    },
    {
      path: "src/lib/auth/retired-social-provider.ts",
      sha256:
        "0db69dcc8a16432397e84ffac0f58659e394ba5da77d75073d47bdf6df257f8a",
    },
  ],
  effectBoundaries: [
    {
      effectBoundaryId: "better_auth.account_commit",
      ownerPath: "node_modules/better-auth/dist/db/with-hooks.mjs",
      ownerSymbol: "getWithHooks",
      commitLabel: "Better Auth user or account adapter mutation",
      atomicity: "auth_adapter_commit",
      effectFamilies: ["auth_account"],
      evidencePaths: [
        "node_modules/better-auth/dist/api/routes/account.mjs",
        "node_modules/better-auth/dist/api/routes/callback.mjs",
        "node_modules/better-auth/dist/api/routes/email-verification.mjs",
        "node_modules/better-auth/dist/api/routes/password.mjs",
        "node_modules/better-auth/dist/api/routes/sign-up.mjs",
        "node_modules/better-auth/dist/db/with-hooks.mjs",
      ],
      semanticAnchors: [
        "async function createWithHooks(data, model, customCreateFn)",
        "async function updateWithHooks(data, where, model, customUpdateFn)",
        "async function deleteWithHooks(where, model, customDeleteFn)",
      ],
    },
    {
      effectBoundaryId: "better_auth.cookie_commit",
      ownerPath: "node_modules/better-auth/dist/cookies/index.mjs",
      ownerSymbol: "setSessionCookie/deleteSessionCookie",
      commitLabel: "Better Auth response cookie commit",
      atomicity: "cookie_commit",
      effectFamilies: ["browser_cookie"],
      evidencePaths: [
        "node_modules/better-auth/dist/cookies/index.mjs",
        "node_modules/better-auth/dist/integrations/next-js.mjs",
      ],
      semanticAnchors: [
        "async function setSessionCookie(ctx, session, dontRememberMe, overrides)",
        "function deleteSessionCookie(ctx, skipDontRememberMe)",
        "const nextCookies = () =>",
      ],
    },
    {
      effectBoundaryId: "better_auth.oauth_provider_operation",
      ownerPath: "node_modules/better-auth/dist/api/routes/callback.mjs",
      ownerSymbol: "callbackOAuth",
      commitLabel: "OAuth provider verification, exchange, or user-info call",
      atomicity: "provider_operation",
      effectFamilies: ["external_call"],
      evidencePaths: [
        "node_modules/better-auth/dist/api/routes/account.mjs",
        "node_modules/better-auth/dist/api/routes/callback.mjs",
        "node_modules/better-auth/dist/api/routes/sign-in.mjs",
      ],
      semanticAnchors: [
        "provider.validateAuthorizationCode",
        "provider.verifyIdToken",
        "provider.getUserInfo",
      ],
    },
    {
      effectBoundaryId: "better_auth.session_commit",
      ownerPath: "node_modules/better-auth/dist/db/with-hooks.mjs",
      ownerSymbol: "getWithHooks",
      commitLabel: "Better Auth session adapter mutation",
      atomicity: "auth_adapter_commit",
      effectFamilies: ["auth_session"],
      evidencePaths: [
        "node_modules/better-auth/dist/api/routes/callback.mjs",
        "node_modules/better-auth/dist/api/routes/email-verification.mjs",
        "node_modules/better-auth/dist/api/routes/password.mjs",
        "node_modules/better-auth/dist/api/routes/session.mjs",
        "node_modules/better-auth/dist/api/routes/sign-in.mjs",
        "node_modules/better-auth/dist/api/routes/sign-out.mjs",
        "node_modules/better-auth/dist/api/routes/sign-up.mjs",
        "node_modules/better-auth/dist/db/with-hooks.mjs",
      ],
      semanticAnchors: [
        "async function createWithHooks(data, model, customCreateFn)",
        "async function deleteWithHooks(where, model, customDeleteFn)",
      ],
    },
    {
      effectBoundaryId: "postgres.password_reset_verification_outbox_commit",
      ownerPath: "sql/0015_ove241_auth_email_outbox.sql",
      ownerSymbol: "enqueue_password_reset_email_outbox",
      commitLabel: "password-reset verification and trigger outbox co-commit",
      atomicity: "database_transaction",
      effectFamilies: ["canonical_row", "transactional_outbox"],
      evidencePaths: [
        "node_modules/better-auth/dist/api/routes/password.mjs",
        "sql/0015_ove241_auth_email_outbox.sql",
      ],
      semanticAnchors: [
        "internalAdapter.createVerificationValue",
        "create or replace function enqueue_password_reset_email_outbox()",
        "insert into auth_email_outbox (verification_id)",
      ],
    },
    {
      effectBoundaryId: "postgres.user_profile_provision_commit",
      ownerPath: "sql/0001_walking_skeleton.sql",
      ownerSymbol: "overgarden_provision_user_public_profile_trigger",
      commitLabel: "Better Auth user and public-profile trigger co-commit",
      atomicity: "database_transaction",
      effectFamilies: ["auth_account", "canonical_row"],
      evidencePaths: [
        "node_modules/better-auth/dist/api/routes/callback.mjs",
        "node_modules/better-auth/dist/api/routes/sign-up.mjs",
        "sql/0001_walking_skeleton.sql",
      ],
      semanticAnchors: [
        "create or replace function overgarden_provision_user_public_profile_trigger()",
        "perform overgarden_provision_user_public_profile(new.id);",
        'after insert on "user"',
      ],
    },
  ],
  variants: [
    {
      variantId: "better_auth.email_verification_callback",
      effectBoundaries: [
        boundary("better_auth.account_commit", "required"),
        boundary("better_auth.session_commit", "conditional"),
        boundary("better_auth.cookie_commit", "conditional"),
      ],
    },
    {
      variantId: "better_auth.link_social_id_token",
      effectBoundaries: [],
      zeroEffectReason: "google_direct_id_token_is_disabled_before_effect",
      evidencePaths: [
        "node_modules/.pnpm/node_modules/@better-auth/core/dist/social-providers/google.mjs",
        "src/lib/auth/google-oauth.ts",
      ],
      semanticAnchors: [
        "disableIdTokenSignIn: true",
        "if (options.disableIdTokenSignIn) return false",
      ],
    },
    {
      variantId: "better_auth.link_social_redirect",
      effectBoundaries: [
        boundary("better_auth.oauth_provider_operation", "conditional"),
        boundary("better_auth.cookie_commit", "conditional"),
      ],
    },
    {
      variantId: "better_auth.oauth_callback_explicit_link",
      effectBoundaries: [
        boundary("better_auth.oauth_provider_operation", "required"),
        boundary("better_auth.account_commit", "required"),
      ],
    },
    {
      variantId: "better_auth.oauth_callback_ordinary",
      effectBoundaries: [
        boundary("better_auth.oauth_provider_operation", "required"),
        boundary("better_auth.account_commit", "conditional"),
        boundary("postgres.user_profile_provision_commit", "conditional"),
        boundary("better_auth.session_commit", "required"),
        boundary("better_auth.cookie_commit", "required"),
      ],
    },
    {
      variantId: "better_auth.retired_facebook_request",
      effectBoundaries: [],
      zeroEffectReason: "retired_facebook_is_denied_before_better_auth",
      evidencePaths: [
        "src/app/api/auth/[...all]/route.ts",
        "src/lib/auth/retired-social-provider.ts",
      ],
      semanticAnchors: [
        "denyRetiredSocialProviderRequest(request)",
        "It runs before Better Auth",
      ],
    },
    {
      variantId: "better_auth.request_password_reset",
      effectBoundaries: [
        boundary(
          "postgres.password_reset_verification_outbox_commit",
          "conditional",
        ),
      ],
    },
    {
      variantId: "better_auth.reset_password",
      effectBoundaries: [
        boundary("better_auth.account_commit", "required"),
        boundary("better_auth.session_commit", "conditional"),
        boundary("better_auth.cookie_commit", "conditional"),
      ],
    },
    {
      variantId: "better_auth.sign_in_email",
      effectBoundaries: [
        boundary("better_auth.session_commit", "required"),
        boundary("better_auth.cookie_commit", "required"),
      ],
    },
    {
      variantId: "better_auth.sign_in_social",
      effectBoundaries: [
        boundary("better_auth.oauth_provider_operation", "conditional"),
        boundary("better_auth.cookie_commit", "conditional"),
      ],
    },
    {
      variantId: "better_auth.sign_out",
      effectBoundaries: [
        boundary("better_auth.session_commit", "required"),
        boundary("better_auth.cookie_commit", "required"),
      ],
    },
    {
      variantId: "better_auth.sign_up_email",
      effectBoundaries: [
        boundary("postgres.user_profile_provision_commit", "required"),
        boundary("better_auth.session_commit", "conditional"),
        boundary("better_auth.cookie_commit", "conditional"),
      ],
    },
    {
      variantId: "better_auth.unlink_account",
      effectBoundaries: [boundary("better_auth.account_commit", "required")],
    },
  ],
} as const satisfies AuthenticatedMutationSemanticManifest;

export function validateAuthenticatedMutationSemanticEvidence(
  evidence: AuthenticatedMutationSemanticEvidence,
  manifest: AuthenticatedMutationSemanticManifest = AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST,
): AuthenticatedMutationSemanticValidationResult {
  const findings: AuthenticatedMutationSemanticFinding[] = [];
  validateManifest(manifest, findings);

  const expectedPackages = uniqueByName(
    manifest.packages,
    "duplicate_package_requirement",
    findings,
  );
  const observedPackages = uniqueByName(
    evidence.packages,
    "duplicate_package_evidence",
    findings,
  );
  validatePackages(expectedPackages, observedPackages, findings);

  const expectedSources = uniqueSources(
    manifest.sources,
    "duplicate_source_requirement",
    findings,
  );
  const observedSources = uniqueEvidenceSources(evidence.sources, findings);
  validateSources(expectedSources, observedSources, findings);
  validateSemanticAnchors(manifest, observedSources, findings);

  const sortedFindings = [...findings].sort(compareFinding);
  const boundaryIds = sortedUnique(
    manifest.effectBoundaries.map((entry) => entry.effectBoundaryId),
  );
  const variantIds = sortedUnique(
    manifest.variants.map((entry) => entry.variantId),
  );
  const manifestDigest = sha256(canonicalJson(normalizeManifest(manifest)));
  const sourceEvidenceDigest = sha256(
    canonicalJson({
      packages: [...evidence.packages]
        .map((entry) => ({ ...entry }))
        .sort((left, right) => byteCompare(left.name, right.name)),
      sources: [...observedSources.values()]
        .map((source) => ({
          path: source.path,
          sha256: sha256(normalizeSourceText(source.sourceText)),
        }))
        .sort((left, right) => byteCompare(left.path, right.path)),
    }),
  );
  const decisionState = sortedFindings.length === 0 ? "ready" : "inconclusive";
  const receiptDigest = sha256(
    canonicalJson({
      schemaVersion: AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_SCHEMA_VERSION,
      decisionState,
      manifestDigest,
      sourceEvidenceDigest,
      findings: sortedFindings.map(({ code, subjectId }) => ({
        code,
        subjectId,
      })),
    }),
  );

  return {
    schemaVersion: AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_SCHEMA_VERSION,
    decisionState,
    findings: sortedFindings,
    boundaryIds,
    variantIds,
    manifestDigest,
    sourceEvidenceDigest,
    receiptDigest,
  };
}

function boundary(
  effectBoundaryId: string,
  executionMode: AuthenticatedMutationSemanticExecutionMode,
): AuthenticatedMutationSemanticVariantBoundary {
  return { effectBoundaryId, executionMode };
}

function validateManifest(
  manifest: AuthenticatedMutationSemanticManifest,
  findings: AuthenticatedMutationSemanticFinding[],
): void {
  if (
    manifest.schemaVersion !==
    AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_SCHEMA_VERSION
  ) {
    addFinding(
      findings,
      "schema_version_mismatch",
      "manifest",
      "Semantic adapter schema version is not supported.",
    );
  }

  const sourcePaths = new Set(
    manifest.sources.map((source) => normalizeSourcePath(source.path)),
  );
  const boundaryIds = new Set<string>();
  for (const effect of manifest.effectBoundaries) {
    if (boundaryIds.has(effect.effectBoundaryId)) {
      addFinding(
        findings,
        "duplicate_effect_boundary_id",
        effect.effectBoundaryId,
        "Semantic effect boundary identifier is duplicated.",
      );
    }
    boundaryIds.add(effect.effectBoundaryId);

    const ownerPath = normalizeSourcePath(effect.ownerPath);
    if (
      !effect.effectBoundaryId.trim() ||
      !ownerPath ||
      !effect.ownerSymbol.trim() ||
      !effect.commitLabel.trim() ||
      effect.effectFamilies.length === 0 ||
      effect.evidencePaths.length === 0 ||
      effect.semanticAnchors.length === 0
    ) {
      addFinding(
        findings,
        "invalid_effect_boundary",
        effect.effectBoundaryId || "<empty>",
        "Semantic effect boundary is incomplete.",
      );
    }
    if (!ownerPath || !sourcePaths.has(ownerPath)) {
      addFinding(
        findings,
        "dangling_boundary_evidence",
        effect.effectBoundaryId,
        "Semantic effect owner path is not pinned source evidence.",
      );
    }
    findDuplicates(effect.effectFamilies).forEach((family) =>
      addFinding(
        findings,
        "duplicate_effect_family",
        `${effect.effectBoundaryId}:${family}`,
        "Semantic effect family is duplicated within one boundary.",
      ),
    );
    const normalizedEvidence = effect.evidencePaths.map(
      (path) => normalizeSourcePath(path) ?? "",
    );
    findDuplicates(normalizedEvidence).forEach((path) =>
      addFinding(
        findings,
        "duplicate_boundary_evidence",
        `${effect.effectBoundaryId}:${path}`,
        "Semantic boundary evidence path is duplicated.",
      ),
    );
    for (const path of normalizedEvidence) {
      if (!path || !sourcePaths.has(path)) {
        addFinding(
          findings,
          "dangling_boundary_evidence",
          `${effect.effectBoundaryId}:${path || "<invalid>"}`,
          "Semantic boundary references unpinned source evidence.",
        );
      }
    }
  }

  const variantIds = new Set<string>();
  const ownedBoundaries = new Set<string>();
  for (const variant of manifest.variants) {
    if (variantIds.has(variant.variantId)) {
      addFinding(
        findings,
        "duplicate_variant_id",
        variant.variantId,
        "Semantic variant identifier is duplicated.",
      );
    }
    variantIds.add(variant.variantId);
    const isZeroEffect = variant.effectBoundaries.length === 0;
    const zeroEffectEvidence = variant.evidencePaths ?? [];
    const zeroEffectAnchors = variant.semanticAnchors ?? [];
    if (
      !variant.variantId.trim() ||
      (isZeroEffect &&
        (!variant.zeroEffectReason?.trim() ||
          zeroEffectEvidence.length === 0 ||
          zeroEffectAnchors.length === 0)) ||
      (!isZeroEffect && Boolean(variant.zeroEffectReason?.trim()))
    ) {
      addFinding(
        findings,
        "empty_variant",
        variant.variantId || "<empty>",
        "A semantic variant must own effects or a pinned bounded zero-effect proof, but never both.",
      );
    }
    for (const rawPath of zeroEffectEvidence) {
      const evidencePath = normalizeSourcePath(rawPath);
      if (!evidencePath || !sourcePaths.has(evidencePath)) {
        addFinding(
          findings,
          "dangling_boundary_evidence",
          `${variant.variantId}:${evidencePath ?? "<invalid>"}`,
          "Semantic zero-effect proof references unpinned source evidence.",
        );
      }
    }
    const refs = variant.effectBoundaries.map(
      (entry) => entry.effectBoundaryId,
    );
    for (const duplicate of findDuplicates(refs)) {
      addFinding(
        findings,
        "duplicate_variant_boundary",
        `${variant.variantId}:${duplicate}`,
        "Semantic variant references one effect boundary more than once.",
      );
    }
    for (const ref of refs) {
      if (!boundaryIds.has(ref)) {
        addFinding(
          findings,
          "dangling_effect_boundary",
          `${variant.variantId}:${ref}`,
          "Semantic variant references an unknown effect boundary.",
        );
      } else {
        ownedBoundaries.add(ref);
      }
    }
  }
  for (const effect of manifest.effectBoundaries) {
    if (!ownedBoundaries.has(effect.effectBoundaryId)) {
      addFinding(
        findings,
        "unowned_semantic_boundary",
        effect.effectBoundaryId,
        "No semantic variant owns this effect boundary.",
      );
    }
  }
}

function validatePackages(
  expected: ReadonlyMap<
    string,
    AuthenticatedMutationSemanticPackageRequirement
  >,
  observed: ReadonlyMap<
    string,
    AuthenticatedMutationSemanticPackageRequirement
  >,
  findings: AuthenticatedMutationSemanticFinding[],
): void {
  for (const [name, requirement] of expected) {
    const actual = observed.get(name);
    if (!actual) {
      addFinding(
        findings,
        "missing_package_evidence",
        name,
        "Required package evidence is absent.",
      );
      continue;
    }
    if (actual.version !== requirement.version) {
      addFinding(
        findings,
        "package_version_mismatch",
        name,
        "Package version differs from the pinned semantic evidence.",
      );
    }
    if (actual.integrity !== requirement.integrity) {
      addFinding(
        findings,
        "package_integrity_mismatch",
        name,
        "Package integrity differs from the pinned semantic evidence.",
      );
    }
  }
  for (const name of observed.keys()) {
    if (!expected.has(name)) {
      addFinding(
        findings,
        "unexpected_package_evidence",
        name,
        "Unexpected package evidence cannot extend the checked manifest.",
      );
    }
  }
}

function validateSources(
  expected: ReadonlyMap<string, AuthenticatedMutationSemanticSourceRequirement>,
  observed: ReadonlyMap<string, { path: string; sourceText: string }>,
  findings: AuthenticatedMutationSemanticFinding[],
): void {
  for (const [path, requirement] of expected) {
    const source = observed.get(path);
    if (!source) {
      addFinding(
        findings,
        "missing_source_evidence",
        path,
        "Required semantic source evidence is absent.",
      );
      continue;
    }
    if (sha256(normalizeSourceText(source.sourceText)) !== requirement.sha256) {
      addFinding(
        findings,
        "source_hash_mismatch",
        path,
        "Normalized semantic source hash differs from the checked manifest.",
      );
    }
  }
  for (const path of observed.keys()) {
    if (!expected.has(path)) {
      addFinding(
        findings,
        "unexpected_source_evidence",
        path,
        "Unexpected source evidence cannot extend the checked manifest.",
      );
    }
  }
}

function validateSemanticAnchors(
  manifest: AuthenticatedMutationSemanticManifest,
  sources: ReadonlyMap<string, { path: string; sourceText: string }>,
  findings: AuthenticatedMutationSemanticFinding[],
): void {
  for (const effect of manifest.effectBoundaries) {
    const evidenceTexts = effect.evidencePaths.flatMap((rawPath) => {
      const path = normalizeSourcePath(rawPath);
      const source = path ? sources.get(path) : undefined;
      return source ? [normalizeSourceText(source.sourceText)] : [];
    });
    for (const anchor of effect.semanticAnchors) {
      if (!anchor || !evidenceTexts.some((text) => text.includes(anchor))) {
        addFinding(
          findings,
          "semantic_anchor_mismatch",
          `${effect.effectBoundaryId}:${sha256(anchor).slice(0, 12)}`,
          "Pinned semantic anchor is absent from the boundary evidence.",
        );
      }
    }
  }
  for (const variant of manifest.variants) {
    const evidenceTexts = (variant.evidencePaths ?? []).flatMap((rawPath) => {
      const path = normalizeSourcePath(rawPath);
      const source = path ? sources.get(path) : undefined;
      return source ? [normalizeSourceText(source.sourceText)] : [];
    });
    for (const anchor of variant.semanticAnchors ?? []) {
      if (!anchor || !evidenceTexts.some((text) => text.includes(anchor))) {
        addFinding(
          findings,
          "semantic_anchor_mismatch",
          `${variant.variantId}:${sha256(anchor).slice(0, 12)}`,
          "Pinned semantic variant anchor is absent from its evidence.",
        );
      }
    }
  }
}

function uniqueByName<T extends { name: string }>(
  entries: readonly T[],
  duplicateCode: "duplicate_package_requirement" | "duplicate_package_evidence",
  findings: AuthenticatedMutationSemanticFinding[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const entry of entries) {
    if (result.has(entry.name)) {
      addFinding(
        findings,
        duplicateCode,
        entry.name,
        "Package evidence name is duplicated.",
      );
    } else {
      result.set(entry.name, entry);
    }
  }
  return result;
}

function uniqueSources(
  entries: readonly AuthenticatedMutationSemanticSourceRequirement[],
  duplicateCode: "duplicate_source_requirement",
  findings: AuthenticatedMutationSemanticFinding[],
): Map<string, AuthenticatedMutationSemanticSourceRequirement> {
  const result = new Map<
    string,
    AuthenticatedMutationSemanticSourceRequirement
  >();
  for (const entry of entries) {
    const path = normalizeSourcePath(entry.path);
    if (!path) {
      addFinding(
        findings,
        "invalid_source_path",
        entry.path || "<empty>",
        "Semantic source requirement path is invalid.",
      );
      continue;
    }
    if (result.has(path)) {
      addFinding(
        findings,
        duplicateCode,
        path,
        "Semantic source requirement path is duplicated.",
      );
    } else {
      result.set(path, { ...entry, path });
    }
  }
  return result;
}

function uniqueEvidenceSources(
  entries: readonly { path: string; sourceText: string }[],
  findings: AuthenticatedMutationSemanticFinding[],
): Map<string, { path: string; sourceText: string }> {
  const result = new Map<string, { path: string; sourceText: string }>();
  for (const entry of entries) {
    const path = normalizeSourcePath(entry.path);
    if (!path) {
      addFinding(
        findings,
        "invalid_source_path",
        entry.path || "<empty>",
        "Semantic source evidence path is invalid.",
      );
      continue;
    }
    if (result.has(path)) {
      addFinding(
        findings,
        "duplicate_source_evidence",
        path,
        "Semantic source evidence path is duplicated.",
      );
    } else {
      result.set(path, { path, sourceText: entry.sourceText });
    }
  }
  return result;
}

function normalizeManifest(manifest: AuthenticatedMutationSemanticManifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    packages: [...manifest.packages]
      .map((entry) => ({ ...entry }))
      .sort((left, right) => byteCompare(left.name, right.name)),
    sources: [...manifest.sources]
      .map((entry) => ({
        ...entry,
        path: normalizeSourcePath(entry.path) ?? entry.path,
      }))
      .sort((left, right) => byteCompare(left.path, right.path)),
    effectBoundaries: [...manifest.effectBoundaries]
      .map((entry) => ({
        ...entry,
        ownerPath: normalizeSourcePath(entry.ownerPath) ?? entry.ownerPath,
        effectFamilies: sortedUnique(entry.effectFamilies),
        evidencePaths: sortedUnique(
          entry.evidencePaths.map((path) => normalizeSourcePath(path) ?? path),
        ),
        semanticAnchors: sortedUnique(entry.semanticAnchors),
      }))
      .sort((left, right) =>
        byteCompare(left.effectBoundaryId, right.effectBoundaryId),
      ),
    variants: [...manifest.variants]
      .map((entry) => ({
        ...entry,
        evidencePaths: sortedUnique(
          (entry.evidencePaths ?? []).map(
            (path) => normalizeSourcePath(path) ?? path,
          ),
        ),
        semanticAnchors: sortedUnique(entry.semanticAnchors ?? []),
        effectBoundaries: [...entry.effectBoundaries].sort((left, right) =>
          byteCompare(left.effectBoundaryId, right.effectBoundaryId),
        ),
      }))
      .sort((left, right) => byteCompare(left.variantId, right.variantId)),
  };
}

function normalizeSourceText(sourceText: string): string {
  const withoutBom =
    sourceText.charCodeAt(0) === 0xfeff ? sourceText.slice(1) : sourceText;
  return withoutBom.replace(/\r\n?/g, "\n");
}

function normalizeSourcePath(value: string): string | null {
  const path = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !path ||
    path.startsWith("/") ||
    /^[A-Za-z]:\//.test(path) ||
    path.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    return null;
  }
  return path;
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return sortedUnique(duplicates);
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(byteCompare);
}

function addFinding(
  findings: AuthenticatedMutationSemanticFinding[],
  code: AuthenticatedMutationSemanticFindingCode,
  subjectId: string,
  message: string,
): void {
  findings.push({ code, subjectId, message });
}

function compareFinding(
  left: AuthenticatedMutationSemanticFinding,
  right: AuthenticatedMutationSemanticFinding,
): number {
  return (
    byteCompare(left.code, right.code) ||
    byteCompare(left.subjectId, right.subjectId) ||
    byteCompare(left.message, right.message)
  );
}

function byteCompare(left: string, right: string): number {
  return Buffer.from(left).compare(Buffer.from(right));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(byteCompare);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
