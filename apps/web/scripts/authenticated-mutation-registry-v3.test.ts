import { describe, expect, it } from "vitest";

import {
  buildAuthenticatedMutationRegistry,
  buildAuthenticatedMutationRegistryReceipt,
  validateAuthenticatedMutationRegistry,
} from "./authenticated-mutation-registry";

describe("authenticated mutation registry v3 contract", () => {
  it("emits the closed source policy and resolved source nodes instead of a flat v2 caller list", () => {
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: [
        {
          entrypointId: "server_action:src/app/garden/actions.ts#saveEntry",
          path: "src/app/garden/actions.ts",
          symbol: "saveEntry",
          variant: "saveEntry",
          transport: "server_action",
        },
        {
          entrypointId:
            "native_form:src/components/save-form.tsx#SaveForm:action:saveEntry",
          path: "src/components/save-form.tsx",
          symbol: "SaveForm",
          variant: "action:saveEntry",
          transport: "native_form",
        },
      ],
      sources: [
        {
          path: "src/app/garden/actions.ts",
          sourceText: `
            "use server";
            import { commitEntry } from "@/server/journal-repository";
            export async function saveEntry() { await commitEntry(); }
          `,
        },
        {
          path: "src/server/journal-repository.ts",
          sourceText: `
            export async function commitEntry() {
              await database.transaction().execute(async (trx) => {
                await trx.insertInto("journal_entries").values({}).execute();
              });
            }
          `,
        },
        {
          path: "src/components/save-form.tsx",
          sourceText:
            "export function SaveForm() { return <form action={saveEntry} />; }",
        },
        {
          path: "sql/0001.sql",
          sourceText: `
            create or replace function enqueue_entry_outbox() returns trigger as $$
            begin return new; end;
            $$ language plpgsql;
            create trigger journal_entry_outbox
              after insert on journal_entries
              execute function enqueue_entry_outbox();
          `,
        },
      ],
      toolchain: {
        betterAuthVersion: "1.6.25",
        typescriptVersion: "5.9.3",
      },
      prerequisiteReceipts: [
        {
          issueId: "OVE-296",
          receiptDigest:
            "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
        },
      ],
    } as never) as unknown as {
      prerequisiteReceipts: unknown[];
      schemaVersion: string;
      sourceNodes: Array<{
        nodeKind: string;
        path: string;
        resolutionState: string;
        symbol: string;
      }>;
      sourcePolicy: {
        excludedPathSegments: string[];
        productionRoots: string[];
      };
    };

    expect(registry.schemaVersion).toBe(
      "overgarden.authenticated-mutation-registry.v3",
    );
    expect(registry.sourcePolicy).toEqual({
      excludedPathSegments: [
        "__test__",
        "__tests__",
        "fixture",
        "fixtures",
        "snapshot",
        "snapshots",
        "spec",
        "specs",
        "test",
        "tests",
      ],
      productionRoots: ["sql", "src"],
    });
    expect(registry.prerequisiteReceipts).toEqual([
      {
        issueId: "OVE-296",
        receiptDigest:
          "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
      },
    ]);
    expect(registry.sourceNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeKind: "server_action",
          path: "src/app/garden/actions.ts",
          resolutionState: "resolved",
          symbol: "saveEntry",
        }),
        expect.objectContaining({
          nodeKind: "effect_owner",
          path: "src/server/journal-repository.ts",
          resolutionState: "resolved",
          symbol: "commitEntry",
        }),
        expect.objectContaining({
          nodeKind: "import",
          path: "src/app/garden/actions.ts",
          resolutionState: "resolved",
          symbol: "commitEntry",
        }),
        expect.objectContaining({
          nodeKind: "typed_action_prop",
          path: "src/components/save-form.tsx",
          resolutionState: "resolved",
          symbol: "saveEntry",
        }),
        expect.objectContaining({
          nodeKind: "contextual_transaction",
          path: "src/server/journal-repository.ts",
          resolutionState: "resolved",
          symbol: "commitEntry",
        }),
        expect.objectContaining({
          nodeKind: "sql_trigger",
          path: "sql/0001.sql",
          resolutionState: "resolved",
          symbol: "journal_entry_outbox",
        }),
      ]),
    );
    expect(
      Object.keys(
        (registry as unknown as { entrypoints: Record<string, unknown>[] })
          .entrypoints[0]!,
      ).sort(),
    ).toEqual([
      "authority",
      "classification",
      "entrypointId",
      "evidencePaths",
      "exclusionReason",
      "executionOwner",
      "generationRequirement",
      "path",
      "symbol",
      "transport",
      "variant",
    ]);
  });

  it("keeps retired Facebook and disabled direct-id-token variants at zero effect while reserving redirect linking", () => {
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: [
        {
          entrypointId: "auth:id-token",
          path: "src/app/api/auth/[...all]/route.ts",
          symbol: "POST",
          variant: "link_social_post_id_token",
          transport: "better_auth_callback",
        },
        {
          entrypointId: "auth:redirect-link",
          path: "src/app/api/auth/[...all]/route.ts",
          symbol: "POST",
          variant: "link_social_post_redirect",
          transport: "better_auth_callback",
        },
        {
          entrypointId: "auth:retired-facebook",
          path: "src/app/api/auth/[...all]/route.ts",
          symbol: "POST",
          variant: "retired_facebook_request",
          transport: "better_auth_callback",
        },
      ],
      sources: [
        {
          path: "src/app/api/auth/[...all]/route.ts",
          sourceText: "export async function POST() {}",
        },
        {
          path: "src/lib/auth/google-oauth.ts",
          sourceText: "export const google = { disableIdTokenSignIn: true };",
        },
        {
          path: "src/lib/auth/retired-social-provider.ts",
          sourceText: "export const retired = 'facebook';",
        },
      ],
      toolchain: {
        betterAuthVersion: "1.6.25",
        typescriptVersion: "5.9.3",
      },
      prerequisiteReceipts: [
        {
          issueId: "OVE-296",
          receiptDigest:
            "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
        },
      ],
    } as never) as unknown as {
      consumerEdges: Array<{
        branchConditionClass: string;
        branchId: string;
        entrypointId: string;
      }>;
      entrypoints: Array<{
        authority: string;
        classification: string;
        entrypointId: string;
        executionOwner: string;
        exclusionReason: string | null;
      }>;
    };

    const byId = new Map(
      registry.entrypoints.map((entrypoint) => [
        entrypoint.entrypointId,
        entrypoint,
      ]),
    );
    expect(byId.get("auth:id-token")).toMatchObject({
      authority: "google_explicit_link",
      classification: "excluded_distinct_authority",
      executionOwner: "excluded_with_reason",
      exclusionReason: "google_direct_id_token_is_disabled_before_effect",
    });
    expect(byId.get("auth:retired-facebook")).toMatchObject({
      authority: "retired_facebook",
      classification: "retired_provider",
      executionOwner: "excluded_with_reason",
      exclusionReason: "ove_296_retired_facebook_is_denied_before_better_auth",
    });
    expect(byId.get("auth:redirect-link")).toMatchObject({
      authority: "google_explicit_link",
      classification: "effectful",
      executionOwner: "owned_by_ove_295",
      exclusionReason: null,
    });
    expect(
      registry.consumerEdges.filter((edge) =>
        ["auth:id-token", "auth:retired-facebook"].includes(edge.entrypointId),
      ),
    ).toEqual([]);
    expect(
      registry.consumerEdges
        .filter((edge) => edge.entrypointId === "auth:redirect-link")
        .every(
          (edge) =>
            edge.branchId.length > 0 && edge.branchConditionClass.length > 0,
        ),
    ).toBe(true);
  });

  it("maps the authenticated Better Auth account/session mutation partition to both adapter commits and the browser cookie", () => {
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: [
        {
          entrypointId: "auth:account-session",
          path: "src/app/api/auth/[...all]/route.ts",
          symbol: "POST",
          variant: "authenticated_account_session_mutation",
          transport: "better_auth_callback",
        },
      ],
      sources: [
        {
          path: "src/app/api/auth/[...all]/route.ts",
          sourceText: "export async function POST() {}",
        },
        {
          path: "src/lib/auth.ts",
          sourceText: "export const auth = {};",
        },
      ],
      toolchain: {
        betterAuthVersion: "1.6.25",
        typescriptVersion: "5.9.3",
      },
      prerequisiteReceipts: [
        {
          issueId: "OVE-296",
          receiptDigest:
            "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
        },
      ],
    });

    expect(
      registry.consumerEdges
        .filter((edge) => edge.entrypointId === "auth:account-session")
        .flatMap(
          (edge) =>
            registry.effectBoundaries.find(
              (effect) => effect.effectBoundaryId === edge.effectBoundaryId,
            )?.effectFamilies ?? [],
        )
        .sort(),
    ).toEqual([
      "auth_account",
      "auth_session",
      "browser_cookie",
      "external_call",
    ]);
    expect(validateAuthenticatedMutationRegistry(registry)).toEqual([]);
  });

  it("binds the receipt to the prerequisite digest without consuming a later admission byte vector", () => {
    const prerequisiteReceipt = {
      issueId: "OVE-296",
      receiptDigest:
        "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
    };
    const buildRegistry = (receiptDigest: string) =>
      buildAuthenticatedMutationRegistry({
        discoveries: [
          {
            entrypointId: "server_action:src/app/garden/actions.ts#saveEntry",
            path: "src/app/garden/actions.ts",
            symbol: "saveEntry",
            variant: "saveEntry",
            transport: "server_action",
          },
        ],
        sources: [
          {
            path: "src/app/garden/actions.ts",
            sourceText: `
              "use server";
              import { commitEntry } from "@/server/journal-repository";
              export async function saveEntry() { await commitEntry(); }
            `,
          },
          {
            path: "src/server/journal-repository.ts",
            sourceText: `
              export async function commitEntry() {
                await database.insertInto("journal_entries").values({}).execute();
              }
            `,
          },
        ],
        toolchain: {
          betterAuthVersion: "1.6.25",
          typescriptVersion: "5.9.3",
        },
        prerequisiteReceipts: [{ ...prerequisiteReceipt, receiptDigest }],
      });
    const registry = buildRegistry(prerequisiteReceipt.receiptDigest);
    const sourceEvidence = [
      {
        path: "src/app/garden/actions.ts",
        sourceText: "export async function saveEntry() {}\n",
      },
      {
        path: "src/server/journal-repository.ts",
        sourceText: "export async function commitEntry() {}\n",
      },
    ];
    const buildReceipt = (receiptDigest: string) => {
      const receiptRegistry = buildRegistry(receiptDigest);
      return (
        buildAuthenticatedMutationRegistryReceipt as unknown as (input: {
          baselineSha: string;
          decisionState: "ready";
          prerequisiteReceipts: Array<{
            issueId: string;
            receiptDigest: string;
          }>;
          registry: typeof receiptRegistry;
          sourceEvidence: typeof sourceEvidence;
        }) => Record<string, string>
      )({
        baselineSha: "5c403444cddc2e195690808de08304d14fe41fd3",
        decisionState: "ready",
        prerequisiteReceipts: [{ ...prerequisiteReceipt, receiptDigest }],
        registry: receiptRegistry,
        sourceEvidence,
      });
    };

    const receipt = buildReceipt(prerequisiteReceipt.receiptDigest);
    expect(receipt).toMatchObject({
      decisionState: "ready",
      schemaVersion: "overgarden.authenticated-mutation-registry.v3",
    });
    expect(receipt.registryDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.sourceEvidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt).not.toHaveProperty("byteVectorDigest");
    expect(buildReceipt("a".repeat(64)).receiptDigest).not.toBe(
      receipt.receiptDigest,
    );
  });

  it("fails closed on source-policy, prerequisite, resolution, and branch drift", () => {
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: [
        {
          entrypointId: "server_action:src/app/garden/actions.ts#saveEntry",
          path: "src/app/garden/actions.ts",
          symbol: "saveEntry",
          variant: "saveEntry",
          transport: "server_action",
        },
      ],
      sources: [
        {
          path: "src/app/garden/actions.ts",
          sourceText:
            'import { commitEntry } from "@/server/journal-repository"; export async function saveEntry(){ await commitEntry(); }',
        },
        {
          path: "src/server/journal-repository.ts",
          sourceText:
            'export async function commitEntry(){ await database.insertInto("journal_entries").values({}).execute(); }',
        },
      ],
      toolchain: {
        betterAuthVersion: "1.6.25",
        typescriptVersion: "5.9.3",
      },
      prerequisiteReceipts: [
        {
          issueId: "OVE-296",
          receiptDigest:
            "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
        },
      ],
    });
    expect(validateAuthenticatedMutationRegistry(registry)).toEqual([]);

    const findings = validateAuthenticatedMutationRegistry({
      ...registry,
      prerequisiteReceipts: [],
      sourcePolicy: {
        ...registry.sourcePolicy,
        productionRoots: ["src"],
      },
      sourceNodes: registry.sourceNodes.map((node, index) =>
        index === 0
          ? { ...node, resolutionState: "unresolved" as const }
          : node,
      ),
      consumerEdges: registry.consumerEdges.map((edge, index) =>
        index === 0 ? { ...edge, branchId: "" } : edge,
      ),
    });
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "source_policy_mismatch" }),
        expect.objectContaining({ code: "missing_prerequisite_receipt" }),
        expect.objectContaining({ code: "unresolved_source_node" }),
        expect.objectContaining({ code: "invalid_branch_contract" }),
      ]),
    );
  });
});
