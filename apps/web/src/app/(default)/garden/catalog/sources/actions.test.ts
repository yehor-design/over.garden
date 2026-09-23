import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAccessDeniedError } from "@/server/admin-access";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  db: { name: "the application database" },
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  resolveMutationScope: vi.fn(),
  ownerUserIdFromFormData: vi.fn(),
  resolveWorkspaceAdminAccess: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
  buildEnqueueCatalogSourceRefreshJobQuery: vi.fn(),
  execute: vi.fn(),
  createQueueItemForSearchMiss: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
// Nothing here may open a pool or load Better Auth: every read is a mock.
vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: mocks.ownerUserIdFromFormData,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceAdminAccess: mocks.resolveWorkspaceAdminAccess,
}));
vi.mock("@/server/admin-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-access")>()),
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/server/catalog-curation-repository", () => ({
  buildEnqueueCatalogSourceRefreshJobQuery:
    mocks.buildEnqueueCatalogSourceRefreshJobQuery,
}));
vi.mock("@/server/catalog-health-repository", () => ({
  createQueueItemForSearchMiss: mocks.createQueueItemForSearchMiss,
}));

import {
  makeQueueItemFromMissAction,
  refreshCatalogSourceAction,
} from "./actions";

const SOURCES = "/garden/catalog/sources";
const QUEUE_ITEM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const OWNER_ACCESS = {
  mode: "sealed_owner_credential_only",
  role: "owner",
  capabilities: [
    "admin:read",
    "operator:read",
    "operator:mutate",
    "erasure:execute",
  ],
} as const;

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function missForm(overrides: Record<string, string> = {}) {
  return form({
    queryNormalized: "помідор де барао",
    locale: "uk",
    objectKind: "plant",
    ...overrides,
  });
}

/**
 * Where the action sent the owner. The mock throws the way the framework's
 * `redirect` does, so nothing after it runs.
 */
async function redirectedTo(pending: Promise<unknown>): Promise<string> {
  await expect(pending).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.redirect).toHaveBeenCalledTimes(1);
  return String(mocks.redirect.mock.calls[0]?.[0]);
}

function expectNothingQueued() {
  expect(mocks.buildEnqueueCatalogSourceRefreshJobQuery).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.createQueueItemForSearchMiss).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
}

describe("catalog sources actions (ADR-0026 D10, D12, OVE-506)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.ownerUserIdFromFormData.mockReturnValue(scope.userId);
    mocks.resolveMutationScope.mockResolvedValue({ status: "admitted", scope });
    mocks.resolveWorkspaceAdminAccess.mockImplementation(
      async (load: () => Promise<unknown>) => ({
        status: "allowed",
        access: await load(),
      }),
    );
    mocks.assertAdminCapabilityForScope.mockResolvedValue(OWNER_ACCESS);
    mocks.buildEnqueueCatalogSourceRefreshJobQuery.mockReturnValue({
      execute: mocks.execute,
    });
    mocks.execute.mockResolvedValue([{ id: "job-1", status: "pending" }]);
    mocks.createQueueItemForSearchMiss.mockResolvedValue(QUEUE_ITEM);
  });

  describe("refresh", () => {
    it("enqueues exactly one refresh for the named source and says so above the sources", async () => {
      const url = await redirectedTo(
        refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" })),
      );

      expect(mocks.resolveMutationScope).toHaveBeenCalledWith({
        expectedOwnerUserId: scope.userId,
        authoritative: true,
      });
      expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
        scope,
        "operator:mutate",
      );
      expect(
        mocks.buildEnqueueCatalogSourceRefreshJobQuery,
      ).toHaveBeenCalledWith(mocks.db, "eppo");
      expect(mocks.execute).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).toHaveBeenCalledWith(SOURCES);
      expect(url).toBe(`${SOURCES}?result=queued&source=eppo#sources-outcome`);
    });

    it.each([
      "",
      "EPPO Global",
      "../etc",
      "eppo;drop",
      "eppo_codes",
      "a".repeat(81),
    ])(
      "refuses %j as a source before touching the queue",
      async (sourceSlug) => {
        const url = await redirectedTo(
          refreshCatalogSourceAction(undefined, form({ sourceSlug })),
        );

        expect(url).toBe(`${SOURCES}?result=unknown-source#sources-outcome`);
        expectNothingQueued();
      },
    );

    it("says failed, with nothing to refresh on the page, when the enqueue fails", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.execute.mockRejectedValue(postgresRejection("08006"));

        const url = await redirectedTo(
          refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" })),
        );

        expect(url).toBe(
          `${SOURCES}?result=failed&source=eppo#sources-outcome`,
        );
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    });

    it("refuses a member with nothing queued", async () => {
      mocks.resolveWorkspaceAdminAccess.mockResolvedValue({ status: "denied" });

      const url = await redirectedTo(
        refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" })),
      );

      expect(url).toBe(`${SOURCES}?result=denied&source=eppo#sources-outcome`);
      expectNothingQueued();
    });

    it("says failed, not denied, when the owner check cannot be read", async () => {
      mocks.resolveWorkspaceAdminAccess.mockResolvedValue({
        status: "unavailable",
        failure: describeWorkspaceFailure(postgresRejection("08006")),
      });

      const url = await redirectedTo(
        refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" })),
      );

      expect(url).toBe(`${SOURCES}?result=failed&source=eppo#sources-outcome`);
      expectNothingQueued();
    });

    it("tells a refused owner check from one that could not be read", async () => {
      const actual = await vi.importActual<
        typeof import("@/server/workspace-access")
      >("@/server/workspace-access");
      mocks.resolveWorkspaceAdminAccess.mockImplementation(
        actual.resolveWorkspaceAdminAccess,
      );

      mocks.assertAdminCapabilityForScope.mockRejectedValue(
        new AdminAccessDeniedError(),
      );
      expect(
        await redirectedTo(
          refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" })),
        ),
      ).toBe(`${SOURCES}?result=denied&source=eppo#sources-outcome`);

      mocks.redirect.mockClear();
      mocks.assertAdminCapabilityForScope.mockRejectedValue(
        postgresRejection("08006"),
      );
      expect(
        await redirectedTo(
          refreshCatalogSourceAction(undefined, form({ sourceSlug: "eppo" })),
        ),
      ).toBe(`${SOURCES}?result=failed&source=eppo#sources-outcome`);
      expectNothingQueued();
    });
  });

  describe("a search miss into the queue", () => {
    it("makes the queue item, names it in the answer, and refreshes the page", async () => {
      const url = await redirectedTo(
        makeQueueItemFromMissAction(
          undefined,
          missForm({ queryNormalized: "  помідор де барао  " }),
        ),
      );

      expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
        scope,
        "operator:mutate",
      );
      expect(mocks.createQueueItemForSearchMiss).toHaveBeenCalledTimes(1);
      expect(mocks.createQueueItemForSearchMiss).toHaveBeenCalledWith(
        {
          queryNormalized: "помідор де барао",
          locale: "uk",
          objectKind: "plant",
        },
        mocks.db,
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith(SOURCES);
      expect(url).toBe(
        `${SOURCES}?result=miss-queued&queueItem=${QUEUE_ITEM}#misses-outcome`,
      );
    });

    it("fills a missing locale and kind, and bounds long ones", async () => {
      await redirectedTo(
        makeQueueItemFromMissAction(
          undefined,
          form({ queryNormalized: "помідор" }),
        ),
      );
      expect(mocks.createQueueItemForSearchMiss).toHaveBeenLastCalledWith(
        { queryNormalized: "помідор", locale: "uk", objectKind: "plant" },
        mocks.db,
      );

      mocks.redirect.mockClear();
      await redirectedTo(
        makeQueueItemFromMissAction(
          undefined,
          missForm({ locale: "x".repeat(20), objectKind: "k".repeat(60) }),
        ),
      );
      expect(mocks.createQueueItemForSearchMiss).toHaveBeenLastCalledWith(
        {
          queryNormalized: "помідор де барао",
          locale: "x".repeat(12),
          objectKind: "k".repeat(40),
        },
        mocks.db,
      );
    });

    it.each([
      ["an empty query", "   "],
      ["a query over 120 characters", "т".repeat(121)],
    ])(
      "says failed for %s without creating anything",
      async (_label, query) => {
        const url = await redirectedTo(
          makeQueueItemFromMissAction(
            undefined,
            missForm({ queryNormalized: query }),
          ),
        );

        expect(url).toBe(`${SOURCES}?result=miss-failed#misses-outcome`);
        expectNothingQueued();
      },
    );

    it("says failed when no item came back", async () => {
      mocks.createQueueItemForSearchMiss.mockResolvedValue(null);

      const url = await redirectedTo(
        makeQueueItemFromMissAction(undefined, missForm()),
      );

      expect(url).toBe(`${SOURCES}?result=miss-failed#misses-outcome`);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });

    it("says failed when the item could not be written", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.createQueueItemForSearchMiss.mockRejectedValue(
          postgresRejection("40001"),
        );

        const url = await redirectedTo(
          makeQueueItemFromMissAction(undefined, missForm()),
        );

        expect(url).toBe(`${SOURCES}?result=miss-failed#misses-outcome`);
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    });

    it.each([
      ["denied", { status: "denied" }, "miss-denied"],
      [
        "unavailable",
        {
          status: "unavailable",
          failure: describeWorkspaceFailure(postgresRejection("08006")),
        },
        "miss-failed",
      ],
    ] as const)(
      "creates nothing when the owner check is %s",
      async (_status, access, result) => {
        mocks.resolveWorkspaceAdminAccess.mockResolvedValue(access);

        const url = await redirectedTo(
          makeQueueItemFromMissAction(undefined, missForm()),
        );

        expect(url).toBe(`${SOURCES}?result=${result}#misses-outcome`);
        expectNothingQueued();
      },
    );
  });

  describe("the session", () => {
    it.each([
      ["refresh", refreshCatalogSourceAction, form({ sourceSlug: "eppo" })],
      ["miss", makeQueueItemFromMissAction, missForm()],
    ] as const)(
      "%s: an ended session goes to sign-in and comes back to the sources, with nothing written",
      async (_label, action, formData) => {
        mocks.resolveMutationScope.mockResolvedValue({
          status: "rejected",
          code: "session_required",
          statusCode: 401,
        });

        const url = new URL(
          await redirectedTo(action(undefined, formData)),
          "https://over.garden",
        );

        expect(url.pathname).toBe("/auth/sign-in");
        expect(url.searchParams.get("next")).toBe(SOURCES);
        expect(mocks.resolveWorkspaceAdminAccess).not.toHaveBeenCalled();
        expectNothingQueued();
      },
    );

    it.each([
      ["refresh", refreshCatalogSourceAction, form({ sourceSlug: "eppo" })],
      ["miss", makeQueueItemFromMissAction, missForm()],
    ] as const)(
      "%s: a tab signed into another account is answered in place, with nothing written",
      async (_label, action, formData) => {
        mocks.resolveMutationScope.mockResolvedValue({
          status: "rejected",
          code: "session_account_changed",
          statusCode: 409,
        });

        await expect(action(undefined, formData)).resolves.toEqual({
          mutationScope: "session_account_changed",
        });
        expect(mocks.redirect).not.toHaveBeenCalled();
        expect(mocks.resolveWorkspaceAdminAccess).not.toHaveBeenCalled();
        expectNothingQueued();
      },
    );
  });
});
