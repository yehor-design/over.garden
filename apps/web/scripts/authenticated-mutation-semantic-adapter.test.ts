import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST,
  validateAuthenticatedMutationSemanticEvidence,
  type AuthenticatedMutationSemanticEvidence,
  type AuthenticatedMutationSemanticManifest,
} from "./authenticated-mutation-semantic-adapter";

const APPS_WEB_ROOT = fileURLToPath(new URL("../", import.meta.url));

const EXPECTED_SOURCE_PATHS = [
  "node_modules/.pnpm/node_modules/@better-auth/core/dist/social-providers/google.mjs",
  "node_modules/better-auth/dist/api/routes/account.mjs",
  "node_modules/better-auth/dist/api/routes/callback.mjs",
  "node_modules/better-auth/dist/api/routes/email-verification.mjs",
  "node_modules/better-auth/dist/api/routes/password.mjs",
  "node_modules/better-auth/dist/api/routes/session.mjs",
  "node_modules/better-auth/dist/api/routes/sign-in.mjs",
  "node_modules/better-auth/dist/api/routes/sign-out.mjs",
  "node_modules/better-auth/dist/api/routes/sign-up.mjs",
  "node_modules/better-auth/dist/cookies/index.mjs",
  "node_modules/better-auth/dist/db/with-hooks.mjs",
  "node_modules/better-auth/dist/integrations/next-js.mjs",
  "pnpm-lock.yaml",
  "sql/0001_walking_skeleton.sql",
  "sql/0015_ove241_auth_email_outbox.sql",
  "src/app/api/auth/[...all]/route.ts",
  "src/lib/auth.ts",
  "src/lib/auth/explicit-google-linking.ts",
  "src/lib/auth/google-oauth.ts",
  "src/lib/auth/retired-social-provider.ts",
] as const;

const EXPECTED_PACKAGES = [
  {
    name: "@better-auth/core",
    version: "1.6.25",
    integrity:
      "sha512-lMTlhtwyK4NpY9kPF+2rQCRKYpg136d3gM2xl8esxT1PjJx5Nh5YwZvxcYCIjDuO759sx6TCloJTuwcZGG6ZBw==",
  },
  {
    name: "better-auth",
    version: "1.6.25",
    integrity:
      "sha512-fvoq+oCO+FF5fpP3XfU7znRyGFpHB77UG2EyxsKNy+Cak7Q5pELu+auvvDveQbWQxcoKugZ7jYQQPFQLpUTGOw==",
  },
] as const;

async function currentEvidence(): Promise<AuthenticatedMutationSemanticEvidence> {
  return {
    packages: EXPECTED_PACKAGES,
    sources: await Promise.all(
      EXPECTED_SOURCE_PATHS.map(async (path) => ({
        path,
        sourceText: await readFile(`${APPS_WEB_ROOT}/${path}`, "utf8"),
      })),
    ),
  };
}

function findingCodes(
  result: ReturnType<typeof validateAuthenticatedMutationSemanticEvidence>,
) {
  return result.findings.map((finding) => finding.code);
}

describe("authenticated mutation semantic evidence adapter", () => {
  it("accepts the pinned Better Auth and tracked SQL evidence", async () => {
    const result = validateAuthenticatedMutationSemanticEvidence(
      await currentEvidence(),
    );

    expect(result.decisionState).toBe("ready");
    expect(result.findings).toEqual([]);
    expect(result.boundaryIds).toEqual([
      "better_auth.account_commit",
      "better_auth.cookie_commit",
      "better_auth.oauth_provider_operation",
      "better_auth.session_commit",
      "postgres.password_reset_verification_outbox_commit",
      "postgres.user_profile_provision_commit",
    ]);
    expect(result.variantIds).toEqual([
      "better_auth.email_verification_callback",
      "better_auth.link_social_id_token",
      "better_auth.link_social_redirect",
      "better_auth.oauth_callback_explicit_link",
      "better_auth.oauth_callback_ordinary",
      "better_auth.request_password_reset",
      "better_auth.reset_password",
      "better_auth.retired_facebook_request",
      "better_auth.sign_in_email",
      "better_auth.sign_in_social",
      "better_auth.sign_out",
      "better_auth.sign_up_email",
      "better_auth.unlink_account",
    ]);
    expect(result.manifestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sourceEvidenceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.receiptDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("proves direct Google idToken linking and retired Facebook requests stop before every effect", async () => {
    const idTokenVariant =
      AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST.variants.find(
        (variant) => variant.variantId === "better_auth.link_social_id_token",
      );
    const facebookVariant =
      AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST.variants.find(
        (variant) =>
          variant.variantId === "better_auth.retired_facebook_request",
      );
    const evidence = await currentEvidence();
    const source = new Map(
      evidence.sources.map((entry) => [entry.path, entry.sourceText]),
    );

    expect(idTokenVariant?.effectBoundaries).toEqual([]);
    expect(facebookVariant?.effectBoundaries).toEqual([]);
    expect(source.get("src/lib/auth/google-oauth.ts")).toContain(
      "disableIdTokenSignIn: true",
    );
    expect(
      source.get(
        "node_modules/.pnpm/node_modules/@better-auth/core/dist/social-providers/google.mjs",
      ),
    ).toContain("if (options.disableIdTokenSignIn) return false");
    expect(source.get("src/app/api/auth/[...all]/route.ts")).toContain(
      "denyRetiredSocialProviderRequest(request)",
    );
    expect(source.get("src/lib/auth/retired-social-provider.ts")).toContain(
      "It runs before Better Auth",
    );
  });

  it("fails closed when the pinned Better Auth version or integrity drifts", async () => {
    const evidence = await currentEvidence();
    const versionDrift = validateAuthenticatedMutationSemanticEvidence({
      ...evidence,
      packages: evidence.packages.map((entry) =>
        entry.name === "better-auth" ? { ...entry, version: "1.6.26" } : entry,
      ),
    });
    const integrityDrift = validateAuthenticatedMutationSemanticEvidence({
      ...evidence,
      packages: evidence.packages.map((entry) =>
        entry.name === "@better-auth/core"
          ? { ...entry, integrity: "sha512-tampered" }
          : entry,
      ),
    });

    expect(versionDrift.decisionState).toBe("inconclusive");
    expect(findingCodes(versionDrift)).toContain("package_version_mismatch");
    expect(integrityDrift.decisionState).toBe("inconclusive");
    expect(findingCodes(integrityDrift)).toContain(
      "package_integrity_mismatch",
    );
  });

  it("fails closed on missing or path-shifted source evidence", async () => {
    const evidence = await currentEvidence();
    const withoutSql = validateAuthenticatedMutationSemanticEvidence({
      ...evidence,
      sources: evidence.sources.filter(
        (source) => source.path !== "sql/0015_ove241_auth_email_outbox.sql",
      ),
    });
    const shiftedPath = validateAuthenticatedMutationSemanticEvidence({
      ...evidence,
      sources: evidence.sources.map((source) =>
        source.path === "node_modules/better-auth/dist/api/routes/callback.mjs"
          ? {
              ...source,
              path: "node_modules/better-auth/dist/api/callback.mjs",
            }
          : source,
      ),
    });

    expect(withoutSql.decisionState).toBe("inconclusive");
    expect(findingCodes(withoutSql)).toContain("missing_source_evidence");
    expect(shiftedPath.decisionState).toBe("inconclusive");
    expect(findingCodes(shiftedPath)).toEqual(
      expect.arrayContaining([
        "missing_source_evidence",
        "unexpected_source_evidence",
      ]),
    );
  });

  it("fails closed when tracked SQL bytes are tampered", async () => {
    const evidence = await currentEvidence();
    const result = validateAuthenticatedMutationSemanticEvidence({
      ...evidence,
      sources: evidence.sources.map((source) =>
        source.path === "sql/0015_ove241_auth_email_outbox.sql"
          ? { ...source, sourceText: `${source.sourceText}\n-- tampered` }
          : source,
      ),
    });

    expect(result.decisionState).toBe("inconclusive");
    expect(findingCodes(result)).toContain("source_hash_mismatch");
  });

  it("fails closed when pinned provider semantics disappear from source", async () => {
    const evidence = await currentEvidence();
    const result = validateAuthenticatedMutationSemanticEvidence({
      ...evidence,
      sources: evidence.sources.map((source) =>
        source.path === "node_modules/better-auth/dist/api/routes/callback.mjs"
          ? {
              ...source,
              sourceText: source.sourceText.replace(
                "provider.validateAuthorizationCode",
                "provider.removedAuthorizationCode",
              ),
            }
          : source,
      ),
    });

    expect(result.decisionState).toBe("inconclusive");
    expect(findingCodes(result)).toEqual(
      expect.arrayContaining([
        "source_hash_mismatch",
        "semantic_anchor_mismatch",
      ]),
    );
  });

  it("rejects duplicate semantic boundary identifiers", async () => {
    const boundary =
      AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST.effectBoundaries[0]!;
    const manifest: AuthenticatedMutationSemanticManifest = {
      ...AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST,
      effectBoundaries: [
        ...AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST.effectBoundaries,
        boundary,
      ],
    };

    const result = validateAuthenticatedMutationSemanticEvidence(
      await currentEvidence(),
      manifest,
    );

    expect(result.decisionState).toBe("inconclusive");
    expect(findingCodes(result)).toContain("duplicate_effect_boundary_id");
  });

  it("rejects a semantic boundary that no variant owns", async () => {
    const manifest: AuthenticatedMutationSemanticManifest = {
      ...AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST,
      effectBoundaries: [
        ...AUTHENTICATED_MUTATION_SEMANTIC_ADAPTER_MANIFEST.effectBoundaries,
        {
          effectBoundaryId: "better_auth.orphan_commit",
          ownerPath: "node_modules/better-auth/dist/db/with-hooks.mjs",
          ownerSymbol: "getWithHooks",
          commitLabel: "orphan semantic fixture",
          atomicity: "auth_adapter_commit",
          effectFamilies: ["auth_account"],
          evidencePaths: ["node_modules/better-auth/dist/db/with-hooks.mjs"],
          semanticAnchors: ["function getWithHooks(adapter, ctx)"],
        },
      ],
    };

    const result = validateAuthenticatedMutationSemanticEvidence(
      await currentEvidence(),
      manifest,
    );

    expect(result.decisionState).toBe("inconclusive");
    expect(findingCodes(result)).toContain("unowned_semantic_boundary");
  });
});
