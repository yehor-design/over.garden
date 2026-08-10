import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

import {
  buildFacebookCleanupFailureReceipt,
  buildFacebookCleanupInventoryReceipt,
  classifyFacebookCleanupInventory,
  collectFacebookCleanupCounts,
  digestFacebookCleanupArtifact,
  applyFacebookAccountCleanup,
  parseFacebookCleanupCliArgs,
  parseFacebookCleanupApprovalArtifact,
  parseFacebookCleanupPlanArtifact,
  readFacebookCleanupInventory,
  runApprovedCleanupSteps,
  settleExternalReadbackWithinDeadline,
  validateFacebookCleanupApproval,
  type FacebookCleanupCounts,
  type FacebookCleanupPlanV1,
} from "./verify-facebook-login-external-cleanup";

const ZERO_GATE_COUNTS: FacebookCleanupCounts = {
  facebookAccounts: 3,
  facebookOnly: 0,
  facebookWithCredential: 2,
  facebookWithGoogle: 2,
  duplicateFacebookOwners: 0,
};

const PLAN: FacebookCleanupPlanV1 = {
  schema: "overgarden.facebook-login-external-cleanup-plan.v1",
  issue: "OVE-297",
  environment: "production",
  implementationSha: "a".repeat(40),
  sourceDigest: "b".repeat(64),
  counts: ZERO_GATE_COUNTS,
  inventoryClass: "zero_inventory_proved",
  databaseTargetClass: "account_provider_id_facebook",
  metaLoginTargetClass: "facebook_login_product_and_redirects",
  metaLoginConfigClass: "configured",
  vercelTargetNames: [
    "FACEBOOK_CLIENT_ID",
    "FACEBOOK_CLIENT_SECRET",
    "FACEBOOK_LOGIN_PUBLIC_READY",
  ],
  vercelConfigClass: "exact_three_present",
  targetDigest: "e".repeat(64),
  metaAdsExclusionDigest: "c".repeat(64),
  mutationOrder: ["meta_login", "vercel_login_env", "database_accounts"],
};

const APPROVAL = {
  status: "approved" as const,
  planDigest: "d".repeat(64),
  implementationSha: "a".repeat(40),
  environment: "production" as const,
  counts: ZERO_GATE_COUNTS,
  targetDigest: "e".repeat(64),
  metaAdsExclusionDigest: "c".repeat(64),
};

describe("OVE-297 aggregate-only inventory", () => {
  it("emits exactly five bounded counts and an approval-eligible zero gate", () => {
    const receipt = buildFacebookCleanupInventoryReceipt({
      counts: ZERO_GATE_COUNTS,
      environment: "production",
      implementationSha: "a".repeat(40),
      sourceDigest: "b".repeat(64),
      durationMs: 29_999,
    });

    expect(receipt).toEqual({
      schema: "overgarden.facebook-login-inventory.v1",
      issue: "OVE-297",
      resultClass: "zero_inventory_proved",
      environment: "production",
      implementationSha: "a".repeat(40),
      sourceDigest: "b".repeat(64),
      durationMs: 29_999,
      counts: ZERO_GATE_COUNTS,
      evidenceSafety: "five_counts_digests_and_classes_only",
    });
    expect(Object.keys(receipt.counts).sort()).toEqual([
      "duplicateFacebookOwners",
      "facebookAccounts",
      "facebookOnly",
      "facebookWithCredential",
      "facebookWithGoogle",
    ]);
    expect(JSON.stringify(receipt)).not.toMatch(
      /email|subject|accessToken|refreshToken|idToken|cookie|accountId|userId|row/i,
    );
  });

  it("blocks before mutation when any Facebook-only owner exists", () => {
    expect(
      classifyFacebookCleanupInventory({
        ...ZERO_GATE_COUNTS,
        facebookOnly: 1,
      }),
    ).toBe("facebook_only_blocked");
  });

  it("blocks before mutation when duplicate Facebook ownership is ambiguous", () => {
    expect(
      classifyFacebookCleanupInventory({
        ...ZERO_GATE_COUNTS,
        duplicateFacebookOwners: 1,
      }),
    ).toBe("duplicate_ambiguity");
  });

  it("returns inconclusive for negative, fractional, or inconsistent counts", () => {
    expect(
      classifyFacebookCleanupInventory({
        ...ZERO_GATE_COUNTS,
        facebookAccounts: -1,
      }),
    ).toBe("inventory_inconclusive");
    expect(
      classifyFacebookCleanupInventory({
        ...ZERO_GATE_COUNTS,
        facebookWithGoogle: 1.5,
      }),
    ).toBe("inventory_inconclusive");
    expect(
      classifyFacebookCleanupInventory({
        ...ZERO_GATE_COUNTS,
        facebookAccounts: 0,
      }),
    ).toBe("inventory_inconclusive");
  });

  it("executes exactly five aggregate queries and rejects an extra result field", async () => {
    const values = ["3", "0", "2", "2", "0"];
    let queryCount = 0;
    const counts = await collectFacebookCleanupCounts({
      query: async () => ({ rows: [{ count: values[queryCount++] }] }),
    });

    expect(counts).toEqual(ZERO_GATE_COUNTS);
    expect(queryCount).toBe(5);

    await expect(
      collectFacebookCleanupCounts({
        query: async () => ({
          rows: [{ count: "0", userId: "forbidden-projection" }],
        }),
      }),
    ).rejects.toThrow("aggregate count shape");
  });
});

describe.skipIf(process.env.RUN_OVE297_DATABASE_INTEGRATION !== "true")(
  "OVE-297 real PostgreSQL aggregate semantics",
  () => {
    it("classifies controlled account combinations without selecting an identity", async () => {
      const resolution = resolveDatabaseConnection(process.env);
      const connectionString = resolvePgConnectionString(
        process.env,
        resolution,
      );
      if (!connectionString)
        throw new Error("database integration requires DATABASE_URL");
      const pool = new Pool({
        connectionString,
        max: 1,
        ssl: resolveDatabaseSslConfig(process.env, resolution),
      });
      const client = await pool.connect();
      try {
        await client.query(
          'create temporary table "account" ("userId" text not null, "providerId" text not null) on commit preserve rows',
        );
        await client.query("set search_path to pg_temp, public");
        await client.query(
          'insert into "account" ("userId", "providerId") values ($1,$2),($1,$3),($4,$2),($4,$5),($6,$2),($6,$3),($6,$5),($7,$2),($8,$2),($8,$2),($8,$5)',
          [
            "synthetic-owner-a",
            "facebook",
            "credential",
            "synthetic-owner-b",
            "google",
            "synthetic-owner-c",
            "synthetic-owner-d",
            "synthetic-owner-e",
          ],
        );

        const receipt = await readFacebookCleanupInventory({
          client,
          environment: "local",
          implementationSha: "a".repeat(40),
          sourceDigest: "b".repeat(64),
        });
        expect(receipt).toMatchObject({
          resultClass: "facebook_only_blocked",
          counts: {
            facebookAccounts: 6,
            facebookOnly: 1,
            facebookWithCredential: 2,
            facebookWithGoogle: 3,
            duplicateFacebookOwners: 1,
          },
        });
        expect(receipt.durationMs).toBeLessThanOrEqual(30_000);
        await expect(
          client.query<{ count: string }>(
            'select count(*)::text as count from "account"',
          ),
        ).resolves.toMatchObject({ rows: [{ count: "11" }] });
      } finally {
        await client.query("reset search_path");
        client.release();
        await pool.end();
      }
    });

    it("deletes only approved Facebook account rows and replays with zero additional effect", async () => {
      const resolution = resolveDatabaseConnection(process.env);
      const connectionString = resolvePgConnectionString(
        process.env,
        resolution,
      );
      if (!connectionString)
        throw new Error("database integration requires DATABASE_URL");
      const pool = new Pool({
        connectionString,
        max: 1,
        ssl: resolveDatabaseSslConfig(process.env, resolution),
      });
      const client = await pool.connect();
      try {
        await client.query(
          'create temporary table "account" ("userId" text not null, "providerId" text not null) on commit preserve rows',
        );
        await client.query("set search_path to pg_temp, public");
        await client.query(
          'insert into "account" ("userId", "providerId") values ($1,$2),($1,$3),($4,$2),($4,$5),($6,$2),($6,$3),($6,$5)',
          [
            "synthetic-owner-a",
            "facebook",
            "credential",
            "synthetic-owner-b",
            "google",
            "synthetic-owner-c",
          ],
        );

        await expect(
          applyFacebookAccountCleanup({
            client,
            plan: PLAN,
            planDigest: "d".repeat(64),
            approval: APPROVAL,
            currentTargetDigest: "e".repeat(64),
            currentMetaAdsExclusionDigest: "c".repeat(64),
          }),
        ).resolves.toEqual({
          class: "zero",
          effectClass: "deleted_expected_facebook_accounts",
          before: ZERO_GATE_COUNTS,
          after: {
            facebookAccounts: 0,
            facebookOnly: 0,
            facebookWithCredential: 0,
            facebookWithGoogle: 0,
            duplicateFacebookOwners: 0,
          },
        });
        await expect(
          client.query<{ count: string }>(
            'select count(*)::text as count from "account"',
          ),
        ).resolves.toMatchObject({ rows: [{ count: "4" }] });

        await expect(
          applyFacebookAccountCleanup({
            client,
            plan: PLAN,
            planDigest: "d".repeat(64),
            approval: APPROVAL,
            currentTargetDigest: "e".repeat(64),
            currentMetaAdsExclusionDigest: "c".repeat(64),
          }),
        ).resolves.toMatchObject({
          class: "zero",
          effectClass: "already_zero",
          after: {
            facebookAccounts: 0,
            facebookOnly: 0,
            facebookWithCredential: 0,
            facebookWithGoogle: 0,
            duplicateFacebookOwners: 0,
          },
        });
      } finally {
        await client.query("reset search_path");
        client.release();
        await pool.end();
      }
    });
  },
);

describe("OVE-297 exact approval and provider apply", () => {
  it("accepts only the exact plan digest, SHA, counts, targets, and exclusions", () => {
    expect(
      validateFacebookCleanupApproval({
        plan: PLAN,
        planDigest: "d".repeat(64),
        approval: APPROVAL,
        current: {
          implementationSha: "a".repeat(40),
          environment: "production",
          counts: ZERO_GATE_COUNTS,
          targetDigest: "e".repeat(64),
          metaAdsExclusionDigest: "c".repeat(64),
        },
      }),
    ).toEqual({ ok: true, class: "approved_exact_plan" });
  });

  it.each([
    ["missing approval", { status: "pending" as const }],
    ["plan digest drift", { planDigest: "f".repeat(64) }],
    ["implementation SHA drift", { implementationSha: "f".repeat(40) }],
    ["count drift", { counts: { ...ZERO_GATE_COUNTS, facebookAccounts: 4 } }],
    ["target drift", { targetDigest: "f".repeat(64) }],
    ["Meta Ads exclusion drift", { metaAdsExclusionDigest: "f".repeat(64) }],
  ])("rejects %s before the first mutation", (_label, approvalPatch) => {
    const result = validateFacebookCleanupApproval({
      plan: PLAN,
      planDigest: "d".repeat(64),
      approval: {
        status: "approved",
        planDigest: "d".repeat(64),
        implementationSha: "a".repeat(40),
        environment: "production",
        counts: ZERO_GATE_COUNTS,
        targetDigest: "e".repeat(64),
        metaAdsExclusionDigest: "c".repeat(64),
        ...approvalPatch,
      },
      current: {
        implementationSha: "a".repeat(40),
        environment: "production",
        counts: ZERO_GATE_COUNTS,
        targetDigest: "e".repeat(64),
        metaAdsExclusionDigest: "c".repeat(64),
      },
    });

    expect(result.ok).toBe(false);
  });

  it("settles partial external success once, performs no retry, and stops later steps", async () => {
    const meta = vi.fn().mockResolvedValue({ class: "absent" });
    const vercel = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const database = vi.fn().mockResolvedValue({ class: "zero" });

    const receipt = await runApprovedCleanupSteps({
      steps: {
        meta_login: meta,
        vercel_login_env: vercel,
        database_accounts: database,
      },
      order: PLAN.mutationOrder,
    });

    expect(receipt).toEqual({
      resultClass: "failed_verification",
      completedSteps: ["meta_login"],
      failedStep: "vercel_login_env",
      cleanupClaim: false,
    });
    expect(meta).toHaveBeenCalledOnce();
    expect(vercel).toHaveBeenCalledOnce();
    expect(database).not.toHaveBeenCalled();
  });

  it("returns completed only after all three authoritative step read-backs pass", async () => {
    const receipt = await runApprovedCleanupSteps({
      steps: {
        meta_login: async () => ({ class: "absent" }),
        vercel_login_env: async () => ({ class: "absent" }),
        database_accounts: async () => ({ class: "zero" }),
      },
      order: PLAN.mutationOrder,
    });

    expect(receipt).toEqual({
      resultClass: "completed",
      completedSteps: ["meta_login", "vercel_login_env", "database_accounts"],
      failedStep: null,
      cleanupClaim: true,
    });
  });
});

describe("OVE-297 bounded external read-back", () => {
  it("cancels twenty concurrent probes at the deadline and rejects late writes", async () => {
    vi.useFakeTimers();
    try {
      let lateWrites = 0;
      const probes = Array.from({ length: 20 }, () =>
        settleExternalReadbackWithinDeadline(
          (signal) =>
            new Promise<string>((resolve) => {
              signal.addEventListener("abort", () => {
                setTimeout(() => {
                  lateWrites += 1;
                  resolve("late");
                }, 1);
              });
            }),
          30_000,
        ),
      );
      const rejections = probes.map((probe) =>
        expect(probe).rejects.toThrow("exceeded 30000ms"),
      );

      await vi.advanceTimersByTimeAsync(30_000);
      await Promise.all(rejections);
      await vi.advanceTimersByTimeAsync(1);
      expect(lateWrites).toBe(20);
      await expect(Promise.allSettled(probes)).resolves.toEqual(
        Array.from({ length: 20 }, () =>
          expect.objectContaining({ status: "rejected" }),
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OVE-297 fail-closed command and immutable artifact boundary", () => {
  it("requires an exact production confirmation before either read or apply", () => {
    expect(() =>
      parseFacebookCleanupCliArgs([
        "--mode",
        "inventory",
        "--environment",
        "production",
        "--implementation-sha",
        "a".repeat(40),
        "--source-digest",
        "b".repeat(64),
      ]),
    ).toThrow("--confirm-environment production");

    expect(() =>
      parseFacebookCleanupCliArgs([
        "--mode",
        "inventory",
        "--environment",
        "production",
        "--confirm-environment",
        "local",
        "--implementation-sha",
        "a".repeat(40),
        "--source-digest",
        "b".repeat(64),
      ]),
    ).toThrow("--confirm-environment production");
  });

  it("keeps inventory read-only and requires exact artifacts for apply", () => {
    expect(
      parseFacebookCleanupCliArgs([
        "--mode",
        "inventory",
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        "a".repeat(40),
        "--source-digest",
        "b".repeat(64),
      ]),
    ).toMatchObject({
      mode: "inventory",
      environment: "production",
      implementationSha: "a".repeat(40),
      sourceDigest: "b".repeat(64),
    });

    expect(() =>
      parseFacebookCleanupCliArgs([
        "--mode",
        "apply-database",
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        "a".repeat(40),
        "--source-digest",
        "b".repeat(64),
      ]),
    ).toThrow("--plan-file");
  });

  it("hashes the byte-exact Markdown plan and injects only the approval-envelope SHA", () => {
    const artifact = [
      "# Exact plan",
      "",
      "```json ove297-plan-v1",
      JSON.stringify({
        ...PLAN,
        implementationSha: "$OVE297_IMPLEMENTATION_SHA",
      }),
      "```",
      "",
    ].join("\n");

    expect(digestFacebookCleanupArtifact(artifact)).toHaveLength(64);
    expect(digestFacebookCleanupArtifact(`${artifact} `)).not.toBe(
      digestFacebookCleanupArtifact(artifact),
    );
    expect(parseFacebookCleanupPlanArtifact(artifact, "a".repeat(40))).toEqual(
      PLAN,
    );
    expect(() =>
      parseFacebookCleanupPlanArtifact(
        artifact.replace("$OVE297_IMPLEMENTATION_SHA", "a".repeat(40)),
        "a".repeat(40),
      ),
    ).toThrow("approval-envelope SHA token");
  });

  it("accepts only a field-exact approved receipt and refuses hidden payload", () => {
    expect(
      parseFacebookCleanupApprovalArtifact(JSON.stringify(APPROVAL)),
    ).toEqual(APPROVAL);
    expect(() =>
      parseFacebookCleanupApprovalArtifact(
        JSON.stringify({ ...APPROVAL, accessToken: "forbidden" }),
      ),
    ).toThrow("unexpected field set");
    expect(() =>
      parseFacebookCleanupApprovalArtifact(
        JSON.stringify({ ...APPROVAL, status: "pending" }),
      ),
    ).toThrow("must be explicitly approved");
  });

  it("emits no nested identity, token, callback, secret, or database error detail", () => {
    const receipt = buildFacebookCleanupFailureReceipt({
      environment: "production",
      implementationSha: "a".repeat(40),
      sourceDigest: "b".repeat(64),
      durationMs: 30_000,
      failureClass: "inventory_inconclusive",
      unsafeError: {
        message: "connection failed for gardener@example.com",
        query: 'select * from "account"',
        nested: {
          accessToken: "provider-secret",
          callbackUrl:
            "https://over.garden/api/auth/callback/facebook?code=secret",
          userId: "another-user",
        },
      },
    });

    expect(receipt).toEqual({
      schema: "overgarden.facebook-login-inventory-failure.v1",
      issue: "OVE-297",
      resultClass: "inventory_inconclusive",
      environment: "production",
      implementationSha: "a".repeat(40),
      sourceDigest: "b".repeat(64),
      durationMs: 30_000,
      evidenceSafety: "bounded_class_only_error_redacted",
    });
    expect(JSON.stringify(receipt)).not.toMatch(
      /email|account|select|query|token|secret|callback|userId|provider-secret/i,
    );
  });
});
