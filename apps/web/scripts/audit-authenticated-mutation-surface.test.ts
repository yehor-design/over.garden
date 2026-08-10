import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AUTHENTICATED_MUTATION_REGISTRY_ARTIFACT_PATH,
  auditAuthenticatedMutationSourcePolicy,
  discoverAuthenticatedMutationEntrypoints,
  expandBetterAuthSemanticVariants,
  runAuthenticatedMutationOperationWithinDeadline,
  runAuthenticatedMutationSurfaceAudit,
} from "./audit-authenticated-mutation-surface";
import {
  buildAuthenticatedMutationRegistry,
  buildAuthenticatedMutationRegistryReceipt,
  canonicalizeAuthenticatedMutationRegistry,
  validateAuthenticatedMutationRegistry,
  type AuthenticatedMutationRegistryV2,
} from "./authenticated-mutation-registry";

const OVE_296_PREREQUISITE = [
  {
    issueId: "OVE-296",
    receiptDigest:
      "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
  },
] as const;

describe("authenticated mutation surface AST discovery", () => {
  it("excludes exact test/spec/fixture segments while keeping similarly named production paths", () => {
    const files = [
      {
        relativePath: "src/app/latest-testament/actions.ts",
        sourceText: '"use server"; export async function saveAction() {}',
      },
      {
        relativePath: "src/tests/actions.ts",
        sourceText: '"use server"; export async function hiddenTestAction() {}',
      },
      {
        relativePath: "src/app/fixtures/actions.ts",
        sourceText: '"use server"; export async function hiddenFixtureAction() {}',
      },
      {
        relativePath: "src/app/page.ts",
        sourceText: 'import { hiddenTestAction } from "../tests/actions";',
      },
    ];

    expect(
      discoverAuthenticatedMutationEntrypoints(files).map(
        (entrypoint) => entrypoint.path,
      ),
    ).toEqual(["src/app/latest-testament/actions.ts"]);
    expect(auditAuthenticatedMutationSourcePolicy(files)).toEqual([
      {
        code: "production_imports_excluded_source",
        importerPath: "src/app/page.ts",
        importedPath: "src/tests/actions.ts",
      },
    ]);
  });

  it("discovers file and inline server actions plus declaration, variable, re-export, and factory route handlers", () => {
    const discoveries = discoverAuthenticatedMutationEntrypoints([
      {
        relativePath: "src/app/garden/actions.ts",
        sourceText: `
          "use server";
          export async function saveEntry() {}
          export const archiveEntry = async () => {};
        `,
      },
      {
        relativePath: "src/app/garden/page.tsx",
        sourceText: `
          export async function createInlineEntry() {
            "use server";
          }
        `,
      },
      {
        relativePath: "src/app/admin/actions.ts",
        sourceText: `
          "use server";
          export { deleteUser as removeUser } from "./effects";
        `,
      },
      {
        relativePath: "src/app/admin/effects.ts",
        sourceText: `export async function deleteUser() {}`,
      },
      {
        relativePath: "src/app/api/garden/entries/route.ts",
        sourceText: `
          export async function POST() {}
          const PATCH = async () => {};
          export { PATCH };
        `,
      },
      {
        relativePath: "src/app/api/cron/drain/route.ts",
        sourceText: `export async function GET() { return drain(); }`,
      },
      {
        relativePath: "src/app/api/auth/[...all]/route.ts",
        sourceText: `
          const handler = toNextJsHandler(auth);
          export const { PATCH, PUT, DELETE } = handler;
        `,
      },
    ]);

    expect(
      discoveries.map(({ entrypointId, path, symbol, transport }) => ({
        entrypointId,
        path,
        symbol,
        transport,
      })),
    ).toEqual([
      {
        entrypointId: "route_handler:src/app/api/auth/[...all]/route.ts#DELETE",
        path: "src/app/api/auth/[...all]/route.ts",
        symbol: "DELETE",
        transport: "route_handler",
      },
      {
        entrypointId: "route_handler:src/app/api/auth/[...all]/route.ts#PATCH",
        path: "src/app/api/auth/[...all]/route.ts",
        symbol: "PATCH",
        transport: "route_handler",
      },
      {
        entrypointId: "route_handler:src/app/api/auth/[...all]/route.ts#PUT",
        path: "src/app/api/auth/[...all]/route.ts",
        symbol: "PUT",
        transport: "route_handler",
      },
      {
        entrypointId: "route_handler:src/app/api/cron/drain/route.ts#GET",
        path: "src/app/api/cron/drain/route.ts",
        symbol: "GET",
        transport: "route_handler",
      },
      {
        entrypointId: "route_handler:src/app/api/garden/entries/route.ts#PATCH",
        path: "src/app/api/garden/entries/route.ts",
        symbol: "PATCH",
        transport: "route_handler",
      },
      {
        entrypointId: "route_handler:src/app/api/garden/entries/route.ts#POST",
        path: "src/app/api/garden/entries/route.ts",
        symbol: "POST",
        transport: "route_handler",
      },
      {
        entrypointId: "server_action:src/app/admin/actions.ts#removeUser",
        path: "src/app/admin/actions.ts",
        symbol: "removeUser",
        transport: "server_action",
      },
      {
        entrypointId: "server_action:src/app/garden/actions.ts#archiveEntry",
        path: "src/app/garden/actions.ts",
        symbol: "archiveEntry",
        transport: "server_action",
      },
      {
        entrypointId: "server_action:src/app/garden/actions.ts#saveEntry",
        path: "src/app/garden/actions.ts",
        symbol: "saveEntry",
        transport: "server_action",
      },
      {
        entrypointId: "server_action:src/app/garden/page.tsx#createInlineEntry",
        path: "src/app/garden/page.tsx",
        symbol: "createInlineEntry",
        transport: "server_action",
      },
    ]);
  });

  it("discovers native forms, same-origin fetch variants, sendBeacon, direct auth-client mutations, and offline replay producers", () => {
    const discoveries = discoverAuthenticatedMutationEntrypoints([
      {
        relativePath: "src/app/garden/editor.tsx",
        sourceText: `
          export function GardenEditor() {
            async function submitEntry() {
              await fetch("/api/garden/entries", { method: "POST" });
              await fetch("/api/garden/entries", { method: "PATCH", keepalive: true });
              navigator.sendBeacon("/api/analytics/events", new Blob());
              await authClient.signOut();
              await drainQueuedJournalEntries();
            }
            return <form action={saveEntry}><button formAction={archiveEntry}>Save</button></form>;
          }
        `,
      },
    ]);

    expect(
      discoveries.map(({ transport, symbol, variant }) => ({
        transport,
        symbol,
        variant,
      })),
    ).toEqual([
      {
        transport: "browser_operator",
        symbol: "submitEntry",
        variant: "auth_client.signOut",
      },
      {
        transport: "native_form",
        symbol: "GardenEditor",
        variant: "action:saveEntry",
      },
      {
        transport: "native_form",
        symbol: "GardenEditor",
        variant: "formAction:archiveEntry",
      },
      {
        transport: "offline_replay",
        symbol: "submitEntry",
        variant: "drainQueuedJournalEntries",
      },
      {
        transport: "same_origin_fetch",
        symbol: "submitEntry",
        variant: "BEACON:/api/analytics/events",
      },
      {
        transport: "same_origin_fetch",
        symbol: "submitEntry",
        variant: "PATCH:/api/garden/entries:keepalive",
      },
      {
        transport: "same_origin_fetch",
        symbol: "submitEntry",
        variant: "POST:/api/garden/entries",
      },
    ]);
  });

  it("limits native-form discovery to intrinsic mutating controls and ignores auth-client reads", () => {
    const discoveries = discoverAuthenticatedMutationEntrypoints([
      {
        relativePath: "src/app/garden/page.tsx",
        sourceText: `
          export function GardenPage() {
            authClient.useSession();
            return (
              <>
                <WorkspaceSection action={<a href="/garden">Open</a>} />
                <form action="/objects"><input name="query" /></form>
                <form method="post" action="/api/engagement/bookmarks" />
                <form action={saveEntry} />
                <button formAction={archiveEntry}>Archive</button>
              </>
            );
          }
        `,
      },
    ]);

    expect(
      discoveries.map(({ transport, variant }) => ({ transport, variant })),
    ).toEqual([
      { transport: "native_form", variant: "action:saveEntry" },
      { transport: "native_form", variant: "formAction:archiveEntry" },
      {
        transport: "native_form",
        variant: "POST:/api/engagement/bookmarks",
      },
    ]);
  });

  it("treats typed component action props and useActionState as binding evidence, not extra consumers", () => {
    const discoveries = discoverAuthenticatedMutationEntrypoints([
      {
        relativePath: "src/app/garden/page.tsx",
        sourceText: `
          export function Page() {
            const [, submitProfile] = useActionState(updateProfileAction, null);
            return <ActionCard saveAction={saveEntryAction} decorativeAction={<span />} />;
          }
        `,
      },
    ]);

    expect(discoveries).toEqual([]);
  });

  it("resolves imported route constants and normalizes dynamic template URLs", () => {
    const discoveries = discoverAuthenticatedMutationEntrypoints([
      {
        relativePath: "src/lib/routes.ts",
        sourceText:
          'export const LOCALE_ENDPOINT = "/api/interface/locale"; export const READ_ENDPOINT = "/api/read";',
      },
      {
        relativePath: "src/app/garden/client.tsx",
        sourceText: `
          import { LOCALE_ENDPOINT, READ_ENDPOINT } from "@/lib/routes";
          export async function save(mediaAssetId: string) {
            await fetch(\`/api/media/\${mediaAssetId}/focal\`, { method: "PATCH" });
            await fetch(LOCALE_ENDPOINT, { method: "POST" });
            await fetch(READ_ENDPOINT);
          }
        `,
      },
    ]);

    expect(discoveries.map(({ variant }) => variant)).toEqual([
      "PATCH:/api/media/:dynamic/focal",
      "POST:/api/interface/locale",
    ]);
  });

  it("expands Better Auth GET and POST into the closed logical callback partition without treating POST normalization as the GET pipeline", () => {
    const variants = expandBetterAuthSemanticVariants([
      {
        entrypointId:
          "route_handler:src/app/api/auth/[...all]/route.ts#GET",
        path: "src/app/api/auth/[...all]/route.ts",
        symbol: "GET",
        variant: "GET",
        transport: "route_handler",
      },
      {
        entrypointId:
          "route_handler:src/app/api/auth/[...all]/route.ts#POST",
        path: "src/app/api/auth/[...all]/route.ts",
        symbol: "POST",
        variant: "POST",
        transport: "route_handler",
      },
    ]);

    expect(variants.map(({ transport, variant }) => ({ transport, variant }))).toEqual([
      {
        transport: "better_auth_callback",
        variant: "authenticated_account_session_mutation",
      },
      {
        transport: "better_auth_callback",
        variant: "authenticated_sign_out",
      },
      {
        transport: "better_auth_callback",
        variant: "authenticated_unlink_account",
      },
      {
        transport: "better_auth_callback",
        variant: "callback_get_explicit_link_existing_account",
      },
      {
        transport: "better_auth_callback",
        variant: "callback_get_explicit_link_new_account",
      },
      {
        transport: "better_auth_callback",
        variant: "callback_get_explicit_link_profile_update",
      },
      {
        transport: "better_auth_callback",
        variant: "callback_get_ordinary_implicit_link",
      },
      {
        transport: "better_auth_callback",
        variant: "callback_get_ordinary_registration",
      },
      {
        transport: "better_auth_callback",
        variant: "callback_get_ordinary_sign_in_existing_account",
      },
      {
        transport: "better_auth_callback",
        variant: "callback_post_normalize_to_get",
      },
      {
        transport: "better_auth_callback",
        variant: "get_read_only_endpoint",
      },
      {
        transport: "better_auth_callback",
        variant: "guest_request_password_reset",
      },
      {
        transport: "better_auth_callback",
        variant: "guest_reset_password",
      },
      {
        transport: "better_auth_callback",
        variant: "guest_sign_in_email",
      },
      {
        transport: "better_auth_callback",
        variant: "guest_sign_in_social",
      },
      {
        transport: "better_auth_callback",
        variant: "guest_sign_up_email",
      },
      {
        transport: "better_auth_callback",
        variant: "link_social_post_id_token",
      },
      {
        transport: "better_auth_callback",
        variant: "link_social_post_redirect",
      },
      {
        transport: "better_auth_callback",
        variant: "retired_facebook_request",
      },
    ]);
  });
});

describe("authenticated mutation registry v3", () => {
  const graph = {
    schemaVersion: "overgarden.authenticated-mutation-registry.v3",
    toolchain: {
      typescriptVersion: "5.9.3",
      betterAuthVersion: "1.6.25",
    },
    sourcePolicy: {
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
      productionRoots: ["public/sw.js", "sql", "src"],
    },
    prerequisiteReceipts: [
      {
        issueId: "OVE-296",
        receiptDigest:
          "d05c0124f59c95b1db6db4d6e444c95d125218355b27ee87a793a7d31a08e152",
      },
    ],
    sourceNodes: [
      {
        sourceNodeId: "source:entry:a",
        path: "src/app/a.ts",
        symbol: "mutateA",
        nodeKind: "server_action",
        semanticVariant: "default",
        resolutionState: "resolved",
        evidencePaths: ["src/app/a.ts"],
      },
      {
        sourceNodeId: "source:entry:b",
        path: "src/app/b.ts",
        symbol: "mutateB",
        nodeKind: "route_handler",
        semanticVariant: "default",
        resolutionState: "resolved",
        evidencePaths: ["src/app/b.ts"],
      },
      {
        sourceNodeId: "source:effect:shared",
        path: "src/server/repository.ts",
        symbol: "commit",
        nodeKind: "effect_owner",
        semanticVariant: "canonical-and-outbox",
        resolutionState: "resolved",
        evidencePaths: ["src/server/repository.ts"],
      },
      {
        sourceNodeId: "source:effect:external",
        path: "src/server/provider.ts",
        symbol: "notify",
        nodeKind: "effect_owner",
        semanticVariant: "provider-notify",
        resolutionState: "resolved",
        evidencePaths: ["src/server/provider.ts"],
      },
    ],
    entrypoints: [
      {
        entrypointId: "entry:a",
        path: "src/app/a.ts",
        symbol: "mutateA",
        variant: "default",
        transport: "server_action",
        authority: "authenticated_user",
        classification: "effectful",
        executionOwner: "high_risk_ove_290",
        generationRequirement: "required_before_first_effect",
        exclusionReason: null,
        evidencePaths: ["src/app/a.ts"],
      },
      {
        entrypointId: "entry:b",
        path: "src/app/b.ts",
        symbol: "mutateB",
        variant: "default",
        transport: "route_handler",
        authority: "authenticated_user",
        classification: "effectful",
        executionOwner: "remaining_ove_291",
        generationRequirement: "required_before_first_effect",
        exclusionReason: null,
        evidencePaths: ["src/app/b.ts"],
      },
    ],
    effectBoundaries: [
      {
        effectBoundaryId: "effect:shared",
        ownerPath: "src/server/repository.ts",
        ownerSymbol: "commit",
        commitLabel: "canonical-and-outbox",
        atomicity: "database_transaction",
        effectFamilies: ["transactional_outbox", "canonical_row"],
        idempotencyOwner: "src/server/repository.ts#commit",
        evidencePaths: ["src/server/repository.ts"],
      },
      {
        effectBoundaryId: "effect:external",
        ownerPath: "src/server/provider.ts",
        ownerSymbol: "notify",
        commitLabel: "provider-notify",
        atomicity: "provider_operation",
        effectFamilies: ["external_call"],
        idempotencyOwner: "src/server/provider.ts#notify",
        evidencePaths: ["src/server/provider.ts"],
      },
    ],
    consumerEdges: [
      {
        consumerEdgeId: "edge:a:shared",
        entrypointId: "entry:a",
        effectBoundaryId: "effect:shared",
        pipelineId: "pipeline:a",
        branchId: "branch:a:always",
        branchConditionClass: "always",
        predecessorEdgeIds: [],
        admissionBoundaryId: "entry:a",
        executionMode: "required",
        evidencePaths: ["src/app/a.ts", "src/server/repository.ts"],
      },
      {
        consumerEdgeId: "edge:a:external",
        entrypointId: "entry:a",
        effectBoundaryId: "effect:external",
        pipelineId: "pipeline:a",
        branchId: "branch:a:success",
        branchConditionClass: "success",
        predecessorEdgeIds: ["edge:a:shared"],
        admissionBoundaryId: "entry:a",
        executionMode: "best_effort_after_commit",
        evidencePaths: ["src/app/a.ts", "src/server/provider.ts"],
      },
      {
        consumerEdgeId: "edge:b:shared",
        entrypointId: "entry:b",
        effectBoundaryId: "effect:shared",
        pipelineId: "pipeline:b",
        branchId: "branch:b:always",
        branchConditionClass: "always",
        predecessorEdgeIds: [],
        admissionBoundaryId: "entry:b",
        executionMode: "required",
        evidencePaths: ["src/app/b.ts", "src/server/repository.ts"],
      },
    ],
  } satisfies AuthenticatedMutationRegistryV2;

  const sourceEvidence = [
    { path: "src/app/a.ts", sourceText: "export const a = true;\n" },
    { path: "src/app/b.ts", sourceText: "export const b = true;\n" },
    {
      path: "src/server/provider.ts",
      sourceText: "export const notify = true;\n",
    },
    {
      path: "src/server/repository.ts",
      sourceText: "export const commit = true;\n",
    },
    { path: "src/z.ts", sourceText: "\ufeffline1\r\nline2\r\n" },
  ];

  it("canonicalizes set-like fields and normalized collections deterministically", () => {
    const reversed: AuthenticatedMutationRegistryV2 = {
      ...graph,
      entrypoints: [...graph.entrypoints].reverse(),
      effectBoundaries: [...graph.effectBoundaries]
        .reverse()
        .map((boundary) => ({
          ...boundary,
          effectFamilies: [...boundary.effectFamilies].reverse(),
          evidencePaths: [...boundary.evidencePaths, ...boundary.evidencePaths],
        })),
      consumerEdges: [...graph.consumerEdges]
        .reverse()
        .map((edge) => ({
          ...edge,
          predecessorEdgeIds: [...edge.predecessorEdgeIds].reverse(),
          evidencePaths: [...edge.evidencePaths].reverse(),
        })),
    };

    expect(canonicalizeAuthenticatedMutationRegistry(reversed)).toBe(
      canonicalizeAuthenticatedMutationRegistry(graph),
    );
  });

  it("rejects unresolved entrypoints, dangling endpoints, owner overlap, and pipeline cycles", () => {
    expect(
      validateAuthenticatedMutationRegistry({
        ...graph,
        entrypoints: [
          { ...graph.entrypoints[0], classification: "unresolved" },
          { ...graph.entrypoints[0] },
        ],
        consumerEdges: [
          {
            ...graph.consumerEdges[0],
            predecessorEdgeIds: ["edge:a:shared"],
          },
          {
            ...graph.consumerEdges[1],
            effectBoundaryId: "effect:missing",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_entrypoint_id" }),
        expect.objectContaining({ code: "unresolved_entrypoint" }),
        expect.objectContaining({ code: "dangling_effect_boundary" }),
        expect.objectContaining({ code: "pipeline_cycle" }),
      ]),
    );
  });

  it("builds stable independent registry, source-evidence, and receipt digests", () => {
    const receipt = buildAuthenticatedMutationRegistryReceipt({
      registry: graph,
      baselineSha: "5c403444cddc2e195690808de08304d14fe41fd3",
      sourceEvidence,
      decisionState: "ready",
    });

    expect(receipt).toMatchObject({
      schemaVersion: "overgarden.authenticated-mutation-registry.v3",
      decisionState: "ready",
    });
    expect(receipt.registryDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.sourceEvidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(Object.values(receipt).filter((value) => /^[a-f0-9]{64}$/.test(value)))).toHaveLength(3);

    expect(
      buildAuthenticatedMutationRegistryReceipt({
        registry: graph,
        baselineSha: "5c403444cddc2e195690808de08304d14fe41fd3",
        sourceEvidence: [...sourceEvidence]
          .reverse()
          .map((evidence) => ({
            ...evidence,
            sourceText:
              evidence.path === "src/z.ts"
                ? "line1\nline2\n"
                : evidence.sourceText,
          })),
        decisionState: "ready",
      }),
    ).toEqual(receipt);
  });

  it("fails closed instead of issuing a ready receipt for invalid or incomplete evidence", () => {
    const buildReady = (
      overrides: Partial<
        Parameters<typeof buildAuthenticatedMutationRegistryReceipt>[0]
      > = {},
    ) =>
      buildAuthenticatedMutationRegistryReceipt({
        registry: graph,
        baselineSha: "5c403444cddc2e195690808de08304d14fe41fd3",
        sourceEvidence,
        decisionState: "ready",
        ...overrides,
      });

    expect(() =>
      buildReady({
        registry: {
          ...graph,
          entrypoints: [],
          effectBoundaries: [],
          consumerEdges: [],
        },
      }),
    ).toThrow(/registry/i);
    expect(() => buildReady({ baselineSha: "not-a-sha" })).toThrow(/baseline/i);
    expect(() => buildReady({ sourceEvidence: [] })).toThrow(/source evidence/i);
    expect(() =>
      buildReady({
        sourceEvidence: sourceEvidence.filter(
          (evidence) => evidence.path !== "src/server/repository.ts",
        ),
      }),
    ).toThrow(/src\/server\/repository\.ts/);
    expect(() => buildReady({ prerequisiteReceipts: [] })).toThrow(
      /prerequisite/i,
    );
  });

  it("partitions high-risk, remainder, OAuth, and distinct-authority variants while sharing server-owned effects", () => {
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: [
        {
          entrypointId: "route_handler:src/app/api/garden/entries/route.ts#POST",
          path: "src/app/api/garden/entries/route.ts",
          symbol: "POST",
          variant: "POST",
          transport: "route_handler",
        },
        {
          entrypointId:
            "same_origin_fetch:src/app/garden/composer.tsx#submit:POST:/api/garden/entries",
          path: "src/app/garden/composer.tsx",
          symbol: "submit",
          variant: "POST:/api/garden/entries",
          transport: "same_origin_fetch",
        },
        {
          entrypointId: "server_action:src/app/garden/profile/actions.ts#updateProfileAction",
          path: "src/app/garden/profile/actions.ts",
          symbol: "updateProfileAction",
          variant: "updateProfileAction",
          transport: "server_action",
        },
        {
          entrypointId:
            "native_form:src/app/garden/profile/page.tsx#ProfileForm:action:updateProfileAction",
          path: "src/app/garden/profile/page.tsx",
          symbol: "ProfileForm",
          variant: "action:updateProfileAction",
          transport: "native_form",
        },
        {
          entrypointId:
            "better_auth_callback:src/app/api/auth/[...all]/route.ts#link_social_post_redirect",
          path: "src/app/api/auth/[...all]/route.ts",
          symbol: "POST",
          variant: "link_social_post_redirect",
          transport: "better_auth_callback",
        },
        {
          entrypointId:
            "better_auth_callback:src/app/api/auth/[...all]/route.ts#guest_sign_in_email",
          path: "src/app/api/auth/[...all]/route.ts",
          symbol: "POST",
          variant: "guest_sign_in_email",
          transport: "better_auth_callback",
        },
        {
          entrypointId: "route_handler:src/app/api/cron/media/route.ts#POST",
          path: "src/app/api/cron/media/route.ts",
          symbol: "POST",
          variant: "POST",
          transport: "route_handler",
        },
      ],
      sources: [
        {
          path: "src/app/api/garden/entries/route.ts",
          sourceText:
            'import { createJournalEntry } from "@/server/journal-repository"; export async function POST(){ await createJournalEntry(); }',
        },
        { path: "src/app/garden/composer.tsx", sourceText: "" },
        {
          path: "src/app/garden/profile/actions.ts",
          sourceText:
            'import { updateProfile } from "@/server/profile-repository"; export async function updateProfileAction(){ await updateProfile(); }',
        },
        { path: "src/app/garden/profile/page.tsx", sourceText: "" },
        { path: "src/app/api/auth/[...all]/route.ts", sourceText: "" },
        { path: "src/app/api/cron/media/route.ts", sourceText: "" },
        {
          path: "src/server/journal-repository.ts",
          sourceText:
            'export async function createJournalEntry(){ await database.insertInto("journal_entry").values({}).execute(); }',
        },
        {
          path: "src/server/profile-repository.ts",
          sourceText:
            'export async function updateProfile(){ await database.updateTable("user_public_profile").set({}).execute(); }',
        },
      ],
      toolchain: { typescriptVersion: "5.9.3", betterAuthVersion: "1.6.25" },
      prerequisiteReceipts: OVE_296_PREREQUISITE,
    });

    const byId = new Map(
      registry.entrypoints.map((entrypoint) => [entrypoint.entrypointId, entrypoint]),
    );
    expect(
      byId.get("route_handler:src/app/api/garden/entries/route.ts#POST")
        ?.executionOwner,
    ).toBe("high_risk_ove_290");
    expect(
      byId.get("server_action:src/app/garden/profile/actions.ts#updateProfileAction")
        ?.executionOwner,
    ).toBe("remaining_ove_291");
    expect(
      byId.get(
        "better_auth_callback:src/app/api/auth/[...all]/route.ts#link_social_post_redirect",
      )?.executionOwner,
    ).toBe("owned_by_ove_295");
    expect(
      byId.get(
        "better_auth_callback:src/app/api/auth/[...all]/route.ts#guest_sign_in_email",
      ),
    ).toMatchObject({
      classification: "excluded_distinct_authority",
      executionOwner: "excluded_with_reason",
    });
    expect(
      byId.get("route_handler:src/app/api/cron/media/route.ts#POST"),
    ).toMatchObject({ authority: "bearer_cron", classification: "excluded_distinct_authority" });

    const routeEffects = registry.consumerEdges
      .filter(
        (edge) =>
          edge.entrypointId ===
          "route_handler:src/app/api/garden/entries/route.ts#POST",
      )
      .map((edge) => edge.effectBoundaryId);
    const fetchEffects = registry.consumerEdges
      .filter((edge) => edge.entrypointId.includes("same_origin_fetch:"))
      .map((edge) => edge.effectBoundaryId);
    expect(fetchEffects).toEqual(routeEffects);
    expect(validateAuthenticatedMutationRegistry(registry)).toEqual([]);
  });

  it("resolves typed action-prop forwarding to the actual Server Action instead of laundering aliases as read-only", () => {
    const sources = [
      {
        path: "src/app/actions.ts",
        relativePath: "src/app/actions.ts",
        sourceText: `
          "use server";
          import { commitChange } from "@/server/repository";
          export async function confirmAction() { await commitChange(); }
        `,
      },
      {
        path: "src/server/repository.ts",
        relativePath: "src/server/repository.ts",
        sourceText: `
          export async function commitChange() {
            await db.insertInto("journal_entry").values({}).execute();
          }
        `,
      },
      {
        path: "src/components/card.tsx",
        relativePath: "src/components/card.tsx",
        sourceText: `
          export function Card({ confirmAction }) {
            return <form action={confirmAction} />;
          }
        `,
      },
      {
        path: "src/components/list.tsx",
        relativePath: "src/components/list.tsx",
        sourceText: `
          import { Card } from "./card";
          export function List({ confirmAction }) {
            return <Card confirmAction={confirmAction} />;
          }
        `,
      },
      {
        path: "src/app/page.tsx",
        relativePath: "src/app/page.tsx",
        sourceText: `
          import { confirmAction } from "./actions";
          import { List } from "@/components/list";
          export default function Page() {
            return <List confirmAction={confirmAction} />;
          }
        `,
      },
    ];
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: discoverAuthenticatedMutationEntrypoints(sources),
      sources,
      toolchain: { typescriptVersion: "5.9.3", betterAuthVersion: "1.6.25" },
      prerequisiteReceipts: OVE_296_PREREQUISITE,
    });

    const cardForm = registry.entrypoints.find(
      (entrypoint) =>
        entrypoint.path === "src/components/card.tsx" &&
        entrypoint.transport === "native_form",
    );
    expect(cardForm).toMatchObject({
      classification: "effectful",
      exclusionReason: null,
    });
    expect(cardForm?.variant).toContain("confirmAction");
    expect(cardForm?.evidencePaths).toEqual([
      "src/app/actions.ts",
      "src/app/page.tsx",
      "src/components/card.tsx",
      "src/components/list.tsx",
    ]);
    expect(
      registry.consumerEdges.find(
        (edge) => edge.entrypointId === cardForm?.entrypointId,
      )?.admissionBoundaryId,
    ).toBe("server_action:src/app/actions.ts#confirmAction");
    expect(validateAuthenticatedMutationRegistry(registry)).toEqual([]);
  });

  it("traces true imported effect owners, co-commits canonical rows with the durable outbox, and keeps independent effects separate", () => {
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: [
        {
          entrypointId: "route_handler:src/app/api/journal/route.ts#POST",
          path: "src/app/api/journal/route.ts",
          symbol: "POST",
          variant: "POST",
          transport: "route_handler",
        },
      ],
      sources: [
        {
          path: "src/app/api/journal/route.ts",
          sourceText: `
            import { commitJournal } from "@/server/journal-repository";
            import { convergePublicProjectionsNow } from "@/server/search/projection";
            import { recordJournalAnalytics } from "@/server/analytics-events";
            export async function POST() {
              await commitJournal();
              await convergePublicProjectionsNow();
              await recordJournalAnalytics();
            }
          `,
        },
        {
          path: "src/server/journal-repository.ts",
          sourceText: `
            import { recordPublicProjectionIntent } from "@/server/search/public-projection-outbox";
            export async function commitJournal() {
              await database.transaction().execute(async (trx) => {
                await trx.insertInto("journal_entry").values({}).execute();
                await recordPublicProjectionIntent(trx);
              });
            }
          `,
        },
        {
          path: "src/server/search/public-projection-outbox.ts",
          sourceText: `
            export async function recordPublicProjectionIntent(trx) {
              await trx.insertInto("public_projection_outbox").values({}).execute();
            }
          `,
        },
        {
          path: "src/server/search/projection.ts",
          sourceText: `
            export async function convergePublicProjectionsNow() {
              await searchIndex.addDocuments([]);
            }
          `,
        },
        {
          path: "src/server/analytics-events.ts",
          sourceText: `
            export async function recordJournalAnalytics() {
              await database.insertInto("analytics_event").values({}).execute();
            }
          `,
        },
      ],
      toolchain: { typescriptVersion: "5.9.3", betterAuthVersion: "1.6.25" },
      prerequisiteReceipts: OVE_296_PREREQUISITE,
    });

    expect(
      registry.effectBoundaries.map((effect) => ({
        owner: `${effect.ownerPath}#${effect.ownerSymbol}`,
        atomicity: effect.atomicity,
        families: effect.effectFamilies,
      })),
    ).toEqual([
      {
        owner: "src/server/analytics-events.ts#recordJournalAnalytics",
        atomicity: "database_transaction",
        families: ["analytics_event"],
      },
      {
        owner: "src/server/journal-repository.ts#commitJournal",
        atomicity: "database_transaction",
        families: ["canonical_row", "transactional_outbox"],
      },
      {
        owner: "src/server/search/projection.ts#convergePublicProjectionsNow",
        atomicity: "single_best_effort_attempt",
        families: ["public_projection"],
      },
    ]);
    const edges = [...registry.consumerEdges].sort((left, right) =>
      left.consumerEdgeId.localeCompare(right.consumerEdgeId),
    );
    const byFamily = new Map(
      edges.map((edge) => [
        registry.effectBoundaries.find(
          (effect) => effect.effectBoundaryId === edge.effectBoundaryId,
        )?.effectFamilies.join("+"),
        edge,
      ]),
    );
    expect(byFamily.get("canonical_row+transactional_outbox")).toMatchObject({
      predecessorEdgeIds: [],
      executionMode: "required",
    });
    expect(byFamily.get("public_projection")?.predecessorEdgeIds).toHaveLength(1);
    expect(byFamily.get("analytics_event")).toMatchObject({
      executionMode: "best_effort_after_commit",
    });
    expect(validateAuthenticatedMutationRegistry(registry)).toEqual([]);
  });

  it("classifies exported offline storage owners without mistaking ordinary collection mutations for IndexedDB effects", () => {
    const sources = [
      {
        path: "src/lib/offline/queue.ts",
        relativePath: "src/lib/offline/queue.ts",
        sourceText: `
          export async function enqueueOfflineMutation() {
            return database.transaction("rw", database.mutations, database.mutationSummaries, async () => {
              const ordinarySet = new Set();
              ordinarySet.add("not-indexed-db");
              await database.mutations.add({ id: "one" });
              await database.mutationSummaries.put({ id: "one" });
            });
          }
          export async function listOfflineMutations() {
            return database.mutations.toArray();
          }
        `,
      },
      {
        path: "src/lib/offline/owner-session-lifecycle.ts",
        relativePath: "src/lib/offline/owner-session-lifecycle.ts",
        sourceText: `
          export const pauseOwnerOfflineActivity = async () => {
            await database.transaction("rw", database.ownerActivity, async () => {
              await database.ownerActivity.put({ ownerUserId: "owner" });
            });
          };
        `,
      },
    ];
    const discoveries = discoverAuthenticatedMutationEntrypoints(sources);
    const registry = buildAuthenticatedMutationRegistry({
      discoveries,
      sources,
      toolchain: { typescriptVersion: "5.9.3", betterAuthVersion: "1.6.25" },
      prerequisiteReceipts: OVE_296_PREREQUISITE,
    });

    expect(
      discoveries.map(({ path, symbol, variant, transport }) => ({
        path,
        symbol,
        variant,
        transport,
      })),
    ).toEqual([
      {
        path: "src/lib/offline/owner-session-lifecycle.ts",
        symbol: "pauseOwnerOfflineActivity",
        variant: "browser_storage:pauseOwnerOfflineActivity",
        transport: "offline_replay",
      },
      {
        path: "src/lib/offline/queue.ts",
        symbol: "enqueueOfflineMutation",
        variant: "browser_storage:enqueueOfflineMutation",
        transport: "offline_replay",
      },
      {
        path: "src/lib/offline/queue.ts",
        symbol: "listOfflineMutations",
        variant: "browser_storage:listOfflineMutations",
        transport: "offline_replay",
      },
    ]);

    const bySymbol = new Map(
      registry.entrypoints.map((entrypoint) => [entrypoint.symbol, entrypoint]),
    );
    expect(bySymbol.get("enqueueOfflineMutation")).toMatchObject({
      classification: "effectful",
      executionOwner: "high_risk_ove_290",
    });
    expect(bySymbol.get("pauseOwnerOfflineActivity")).toMatchObject({
      classification: "effectful",
      executionOwner: "capability_runtime_ove_286",
    });
    expect(bySymbol.get("listOfflineMutations")).toMatchObject({
      classification: "read_only",
      executionOwner: "excluded_with_reason",
    });
    expect(
      registry.effectBoundaries.map((effect) => ({
        owner: `${effect.ownerPath}#${effect.ownerSymbol}`,
        label: effect.commitLabel,
        families: effect.effectFamilies,
      })),
    ).toEqual([
      {
        owner:
          "src/lib/offline/owner-session-lifecycle.ts#pauseOwnerOfflineActivity",
        label: "browser-storage-transaction-1",
        families: ["browser_storage"],
      },
      {
        owner: "src/lib/offline/queue.ts#enqueueOfflineMutation",
        label: "browser-storage-transaction-1",
        families: ["browser_storage"],
      },
    ]);
    expect(validateAuthenticatedMutationRegistry(registry)).toEqual([]);
  });

  it("co-commits only calls proven inside the same transaction callback", () => {
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: [
        {
          entrypointId: "server_action:src/app/actions.ts#saveAction",
          path: "src/app/actions.ts",
          symbol: "saveAction",
          variant: "saveAction",
          transport: "server_action",
        },
      ],
      sources: [
        {
          path: "src/app/actions.ts",
          sourceText: `
            "use server";
            import { orchestrate } from "@/server/orchestrator";
            export async function saveAction() { await orchestrate(); }
          `,
        },
        {
          path: "src/server/orchestrator.ts",
          sourceText: `
            import { writeBefore, writeAfter } from "@/server/standalone";
            import { recordPublicProjectionIntent } from "@/server/search/public-projection-outbox";
            export async function orchestrate() {
              await writeBefore();
              await database.transaction().execute(async (trx) => {
                await trx.updateTable("journal_entry").set({}).execute();
                await recordPublicProjectionIntent(trx);
              });
              await writeAfter();
              await database.transaction().execute(async (secondTrx) => {
                await secondTrx.insertInto("audit_row").values({}).execute();
              });
            }
          `,
        },
        {
          path: "src/server/standalone.ts",
          sourceText: `
            export async function writeBefore() {
              await database.insertInto("before_row").values({}).execute();
            }
            export async function writeAfter() {
              await database.insertInto("after_row").values({}).execute();
            }
          `,
        },
        {
          path: "src/server/search/public-projection-outbox.ts",
          sourceText: `
            export async function recordPublicProjectionIntent(executor) {
              await executor.insertInto("public_projection_outbox").values({}).execute();
            }
          `,
        },
      ],
      toolchain: { typescriptVersion: "5.9.3", betterAuthVersion: "1.6.25" },
      prerequisiteReceipts: OVE_296_PREREQUISITE,
    });

    expect(
      registry.effectBoundaries.map((effect) => ({
        owner: `${effect.ownerPath}#${effect.ownerSymbol}`,
        label: effect.commitLabel,
        families: effect.effectFamilies,
      })),
    ).toEqual([
      {
        owner: "src/server/orchestrator.ts#orchestrate",
        label: "database-transaction-1",
        families: ["canonical_row", "transactional_outbox"],
      },
      {
        owner: "src/server/orchestrator.ts#orchestrate",
        label: "database-transaction-2",
        families: ["canonical_row"],
      },
      {
        owner: "src/server/standalone.ts#writeAfter",
        label: "canonical-row",
        families: ["canonical_row"],
      },
      {
        owner: "src/server/standalone.ts#writeBefore",
        label: "canonical-row",
        families: ["canonical_row"],
      },
    ]);
  });

  it("splits authenticated, guest-auth-intent, and visual-fixture branches into separate logical variants", () => {
    const registry = buildAuthenticatedMutationRegistry({
      discoveries: [
        {
          entrypointId: "route_handler:src/app/api/social/route.ts#POST",
          path: "src/app/api/social/route.ts",
          symbol: "POST",
          variant: "POST",
          transport: "route_handler",
        },
      ],
      sources: [
        {
          path: "src/app/api/social/route.ts",
          sourceText: `
            import { mutateSocial } from "@/server/social-repository";
            export async function POST(request) {
              const actor = await resolveVisualSocialMutationActor(request);
              if (!actor) return authIntentRequiredResponse(request, {});
              await mutateSocial(actor);
            }
          `,
        },
        {
          path: "src/server/social-repository.ts",
          sourceText: `
            export async function mutateSocial() {
              await database.insertInto("social_edge").values({}).execute();
            }
          `,
        },
      ],
      toolchain: { typescriptVersion: "5.9.3", betterAuthVersion: "1.6.25" },
      prerequisiteReceipts: OVE_296_PREREQUISITE,
    });

    expect(
      registry.entrypoints.map((entrypoint) => ({
        variant: entrypoint.variant,
        authority: entrypoint.authority,
        classification: entrypoint.classification,
      })),
    ).toEqual([
      {
        variant: "POST:authenticated_user",
        authority: "authenticated_user",
        classification: "effectful",
      },
      {
        variant: "POST:guest_auth_intent",
        authority: "guest",
        classification: "excluded_distinct_authority",
      },
      {
        variant: "POST:visual_fixture",
        authority: "visual_fixture",
        classification: "excluded_distinct_authority",
      },
    ]);
    expect(
      registry.entrypoints
        .map((entrypoint) => String(entrypoint.authority))
        .includes("mixed_public_authenticated"),
    ).toBe(false);
    expect(validateAuthenticatedMutationRegistry(registry)).toEqual([]);
  });
});

describe("authenticated mutation audit deadline and determinism", () => {
  const appRoot = fileURLToPath(new URL("../", import.meta.url));

  it(
    "returns four identical three-digest receipts without mutating the checked artifact",
    async () => {
      const artifactPath = fileURLToPath(
        new URL(
          AUTHENTICATED_MUTATION_REGISTRY_ARTIFACT_PATH,
          new URL("../", import.meta.url),
        ),
      );
      const before = await readFile(artifactPath, "utf8").catch(() => null);
      const reports = await Promise.all(
        Array.from({ length: 4 }, () =>
          runAuthenticatedMutationSurfaceAudit({ appRoot }),
        ),
      );
      const after = await readFile(artifactPath, "utf8").catch(() => null);

      expect(reports.every((report) => report.terminalState === "ready")).toBe(
        true,
      );
      expect(
        new Set(
          reports.flatMap((report) =>
            report.receipt
              ? [
                  report.receipt.registryDigest,
                  report.receipt.sourceEvidenceDigest,
                  report.receipt.receiptDigest,
                ].join(":")
              : [],
          ),
        ).size,
      ).toBe(1);
      expect(reports.every((report) => report.elapsedBucket !== "timed_out")).toBe(
        true,
      );
      expect(after).toBe(before);
    },
    30_000,
  );

  it("settles once on deadline, keeps wait-safe controls responsive, and ignores a late result", async () => {
    let release: (() => void) | undefined;
    const operation = runAuthenticatedMutationOperationWithinDeadline(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("late-ready");
        }),
      10,
    );

    await expect(
      Promise.all([
        Promise.resolve("scanner cancellation command"),
        Promise.resolve("repository status command"),
      ]),
    ).resolves.toEqual([
      "scanner cancellation command",
      "repository status command",
    ]);
    const receipt = await operation;
    expect(receipt).toEqual({ terminalState: "timed_out" });
    release?.();
    await Promise.resolve();
    expect(receipt).toEqual({ terminalState: "timed_out" });
  });

  it("distinguishes a scanner failure from a deadline", async () => {
    await expect(
      runAuthenticatedMutationOperationWithinDeadline(
        async () => {
          throw new Error("unsupported syntax fixture");
        },
        30_000,
      ),
    ).resolves.toEqual({ terminalState: "failed" });
  });
});
