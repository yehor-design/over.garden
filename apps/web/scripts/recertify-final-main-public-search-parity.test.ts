import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  OVE307_APPROVAL_DIGEST,
  OVE307_APPROVED_PLAN,
  OVE307_REPAIR_TIMEOUT_MS,
  buildPublicSearchParityNamespace,
  isApprovedPublicSearchProviderBinding,
  parsePublicSearchParityCliArgs,
  runApprovedPublicSearchParityProof,
  settlePublicSearchParityWithinDeadline,
  type PublicSearchParityAdapter,
  type PublicSearchParityReceiptV1,
  type SafeParityReport,
} from "./recertify-final-main-public-search-parity";

const IMPLEMENTATION_SHA = "a".repeat(40);

const BEFORE: SafeParityReport = {
  policyVersion: "ove242.publicIndexParity.v3",
  issue: "OVE-227",
  zeroGap: false,
  counts: {
    expected: 0,
    missing: 0,
    extraneous: 0,
    stale: 10,
    unsafe_schema: 0,
    duplicate: 0,
    invalid_id: 0,
    pending: 0,
    overdue: 0,
    terminal_failure: 0,
    projection_unconverged: 0,
    projection_overdue: 0,
    projection_dead: 0,
    meiliDocumentCount: 10,
    postgresEligibleCount: 10,
  },
  driftFieldClasses: ["entryDate"],
  invalidReasonClasses: [],
  expectedCorpusHash: "b".repeat(64),
  observedCorpusHash: "c".repeat(64),
  evidenceSafety: "counts_classes_and_safe_hashes",
};

const AFTER: SafeParityReport = {
  ...BEFORE,
  zeroGap: true,
  counts: {
    ...BEFORE.counts,
    expected: 10,
    stale: 0,
  },
  driftFieldClasses: [],
  expectedCorpusHash: "d".repeat(64),
  observedCorpusHash: "d".repeat(64),
};

const PLAN = {
  policyVersion: "ove242.publicIndexParity.v3" as const,
  issue: "OVE-227" as const,
  actions: {
    reindex: 10,
    unindexDelete: 0,
    deleteInvalid: 0,
  },
  evidenceSafety: "counts_classes_and_safe_hashes" as const,
};

function options(mode: "plan" | "apply" = "apply") {
  return {
    mode,
    environment: "production" as const,
    implementationSha: IMPLEMENTATION_SHA,
    timeoutMs: OVE307_REPAIR_TIMEOUT_MS,
    ...(mode === "apply" ? { approvalDigest: OVE307_APPROVAL_DIGEST } : {}),
  };
}

function adapter(
  overrides: Partial<PublicSearchParityAdapter> = {},
): PublicSearchParityAdapter {
  let attempted = false;
  let receipt: PublicSearchParityReceiptV1 | null = null;
  return {
    acquireApplyLock: vi.fn(async () => "acquired" as const),
    releaseApplyLock: vi.fn(async () => undefined),
    readDeploymentSha: vi.fn(async () => IMPLEMENTATION_SHA),
    classify: vi
      .fn<() => Promise<SafeParityReport>>()
      .mockResolvedValueOnce(BEFORE)
      .mockResolvedValue(AFTER),
    plan: vi.fn(async () => PLAN),
    claimApplyAttempt: vi.fn(async () => {
      if (attempted) return "already_claimed" as const;
      attempted = true;
      return "claimed" as const;
    }),
    readApplyAttempt: vi.fn(async () => attempted),
    apply: vi.fn(async () => ({
      plan: PLAN,
      applied: { reindexUpserted: 10, deleted: 0 },
      after: AFTER,
    })),
    cancellationRequested: vi.fn(async () => false),
    readReplayReceipt: vi.fn(async () => receipt),
    writeReplayReceipt: vi.fn(async (next) => {
      receipt = next;
    }),
    ...overrides,
  };
}

describe("OVE-307 exact production plan", () => {
  it("accepts only the registry-owned database and Meilisearch origins", () => {
    const productionDatabase =
      "postgresql://redacted:redacted@overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com:25060/defaultdb";
    expect(
      isApprovedPublicSearchProviderBinding({
        databaseUrl: productionDatabase,
        meiliHost: "https://meili.over.garden",
      }),
    ).toBe(true);
    for (const binding of [
      {
        databaseUrl: productionDatabase.replace("defaultdb", "another"),
        meiliHost: "https://meili.over.garden",
      },
      {
        databaseUrl: productionDatabase,
        meiliHost: "http://localhost:7700",
      },
      {
        databaseUrl: "not-a-url",
        meiliHost: "https://meili.over.garden",
      },
    ]) {
      expect(isApprovedPublicSearchProviderBinding(binding)).toBe(false);
    }
  });

  it("pins the approved plan and namespace", () => {
    expect(
      createHash("sha256").update(OVE307_APPROVED_PLAN).digest("hex"),
    ).toBe(OVE307_APPROVAL_DIGEST);
    expect(OVE307_APPROVED_PLAN).toContain("reindex=10");
    expect(OVE307_APPROVED_PLAN).toContain("unindexDelete=0");
    expect(OVE307_APPROVED_PLAN).toContain("deleteInvalid=0");
    expect(OVE307_APPROVED_PLAN).toContain("entryDate");
    expect(buildPublicSearchParityNamespace(IMPLEMENTATION_SHA)).toBe(
      "092bb60d32da8214bc90302f1709c4fca66c1dfc232e3db6bbc4fe886d8af4f5",
    );
  });

  it("returns a zero-effect plan only for the exact boundary", async () => {
    const proof = adapter();
    const receipt = await runApprovedPublicSearchParityProof(
      options("plan"),
      proof,
    );

    expect(receipt).toMatchObject({
      environment: "production",
      implementationSha: IMPLEMENTATION_SHA,
      planDigest: OVE307_APPROVAL_DIGEST,
      authorizationDigest: OVE307_APPROVAL_DIGEST,
      applyCount: 0,
      before: BEFORE,
      plan: PLAN,
      after: null,
      resultClass: "zero_effect_plan",
      convergenceClass: "not_started",
      state: "code_deployed",
    });
    expect(proof.apply).not.toHaveBeenCalled();
    expect(proof.claimApplyAttempt).not.toHaveBeenCalled();
  });

  it.each([
    [
      "deployment SHA",
      { readDeploymentSha: vi.fn(async () => "f".repeat(40)) },
    ],
    [
      "stale count",
      {
        classify: vi.fn(async () => ({
          ...BEFORE,
          counts: { ...BEFORE.counts, stale: 9 },
        })),
      },
    ],
    [
      "drift field",
      {
        classify: vi.fn(async () => ({
          ...BEFORE,
          driftFieldClasses: ["title"],
        })),
      },
    ],
    [
      "unsafe schema",
      {
        classify: vi.fn(async () => ({
          ...BEFORE,
          counts: { ...BEFORE.counts, unsafe_schema: 1 },
        })),
      },
    ],
    [
      "unexpected evidence field",
      {
        classify: vi.fn(async () => ({
          ...BEFORE,
          privateBody: "must-not-enter-receipt",
        })),
      },
    ],
    [
      "delete action",
      {
        plan: vi.fn(async () => ({
          ...PLAN,
          actions: { ...PLAN.actions, unindexDelete: 1 },
        })),
      },
    ],
  ])("refuses %s drift before any apply", async (_label, overrides) => {
    const proof = adapter(overrides);
    const receipt = await runApprovedPublicSearchParityProof(options(), proof);

    expect(receipt).toMatchObject({
      resultClass: "refused",
      applyCount: 0,
      state: "failed",
    });
    expect(proof.apply).not.toHaveBeenCalled();
    expect(proof.claimApplyAttempt).not.toHaveBeenCalled();
    expect(JSON.stringify(receipt)).not.toContain("must-not-enter-receipt");
  });

  it("requires the exact authorization digest before lock or effect", async () => {
    const proof = adapter();
    const receipt = await runApprovedPublicSearchParityProof(
      { ...options(), approvalDigest: "f".repeat(64) },
      proof,
    );

    expect(receipt).toMatchObject({ resultClass: "refused", applyCount: 0 });
    expect(proof.acquireApplyLock).not.toHaveBeenCalled();
    expect(proof.apply).not.toHaveBeenCalled();
  });
});

describe("OVE-307 single-use apply and recovery", () => {
  it("applies one canonical reindex and verifies two fresh reads", async () => {
    const proof = adapter();
    const receipt = await runApprovedPublicSearchParityProof(options(), proof);

    expect(proof.claimApplyAttempt).toHaveBeenCalledTimes(1);
    expect(proof.apply).toHaveBeenCalledTimes(1);
    expect(proof.classify).toHaveBeenCalledTimes(3);
    expect(receipt).toMatchObject({
      applyCount: 1,
      before: BEFORE,
      plan: PLAN,
      after: AFTER,
      resultClass: "verified_zero_gap",
      convergenceClass: "matching_zero_gap_twice",
      state: "verified",
    });
    expect(receipt.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses replay after the durable attempt is claimed", async () => {
    const proof = adapter();
    const first = await runApprovedPublicSearchParityProof(options(), proof);
    const second = await runApprovedPublicSearchParityProof(options(), proof);

    expect(first.state).toBe("verified");
    expect(second).toMatchObject({
      resultClass: "already_verified",
      applyCount: 1,
      state: "already_verified",
    });
    expect(proof.apply).toHaveBeenCalledTimes(1);
  });

  it("returns a bounded loser without claiming or applying", async () => {
    const proof = adapter({
      acquireApplyLock: vi.fn(async () => "contended" as const),
    });
    const receipt = await runApprovedPublicSearchParityProof(options(), proof);

    expect(receipt).toMatchObject({
      resultClass: "bounded_loser",
      applyCount: 0,
      state: "failed",
    });
    expect(proof.claimApplyAttempt).not.toHaveBeenCalled();
    expect(proof.apply).not.toHaveBeenCalled();
  });

  it("exhausts the attempt after partial effect and emits no unsafe error", async () => {
    const unsafe = {
      message: "private body",
      documentId: "00000000-0000-4000-8000-000000000307",
    };
    const proof = adapter({
      apply: vi.fn(async () => {
        throw unsafe;
      }),
    });

    const receipt = await runApprovedPublicSearchParityProof(options(), proof);
    expect(receipt).toMatchObject({
      resultClass: "failed",
      applyCount: 1,
      convergenceClass: "uncertain",
      state: "failed",
    });
    expect(JSON.stringify(receipt)).not.toContain("private body");
    expect(JSON.stringify(receipt)).not.toContain(
      "00000000-0000-4000-8000-000000000307",
    );
  });

  it("public-search-parity-timeout-recovery bounds timeout and rejects late completion", async () => {
    vi.useFakeTimers();
    try {
      let late = false;
      const pending = settlePublicSearchParityWithinDeadline(
        async () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              late = true;
              resolve("late");
            }, 50);
          }),
        10,
      );

      const rejection = expect(pending).rejects.toThrow(
        "public search parity repair exceeded 10ms",
      );
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
      await vi.advanceTimersByTimeAsync(40);
      expect(late).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OVE-307 CLI", () => {
  it.each(["--plan", "--apply", "--status", "--cancel"] as const)(
    "parses exactly one %s mode",
    (mode) => {
      const input = [
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        IMPLEMENTATION_SHA,
        mode,
        ...(mode === "--apply"
          ? ["--approval-digest", OVE307_APPROVAL_DIGEST]
          : []),
      ];
      expect(parsePublicSearchParityCliArgs(input).mode).toBe(mode.slice(2));
    },
  );

  it.each(
    [
      [],
      ["--plan", "--apply"],
      ["--environment", "preview", "--plan"],
      [
        "--environment",
        "production",
        "--confirm-environment",
        "preview",
        "--plan",
      ],
      [
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        "short",
        "--plan",
      ],
    ].map((tail) => [tail] as const),
  )("rejects ambiguous or unsafe arguments", (tail) => {
    const base = tail.includes("--environment")
      ? tail
      : [
          "--environment",
          "production",
          "--confirm-environment",
          "production",
          "--implementation-sha",
          IMPLEMENTATION_SHA,
          ...tail,
        ];
    expect(() => parsePublicSearchParityCliArgs(base)).toThrow();
  });
});
