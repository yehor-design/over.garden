import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidatePublicCacheTags: vi.fn(),
  resolveMutationScope: vi.fn(),
  ownerUserIdFromFormData: vi.fn(() => "owner-1"),
  assertAdminCapabilityForScope: vi.fn(),
  applyCatalogQueueItem: vi.fn(),
  revertCatalogAction: vi.fn(),
  rejectCatalogQueueItem: vi.fn(),
  skipCatalogQueueItem: vi.fn(),
  countObjectsOnCatalogItem: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/public-cache-revalidation", () => ({
  revalidatePublicCacheTags: mocks.revalidatePublicCacheTags,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: mocks.ownerUserIdFromFormData,
}));
vi.mock("@/server/admin-access", () => ({
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/server/catalog-curation-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/catalog-curation-repository")>()),
  applyCatalogQueueItem: mocks.applyCatalogQueueItem,
  revertCatalogAction: mocks.revertCatalogAction,
  rejectCatalogQueueItem: mocks.rejectCatalogQueueItem,
  skipCatalogQueueItem: mocks.skipCatalogQueueItem,
  countObjectsOnCatalogItem: mocks.countObjectsOnCatalogItem,
}));

import {
  acceptCatalogQueueItemAction,
  rejectCatalogQueueItemAction,
  revertCatalogActionAction,
  skipCatalogQueueItemAction,
} from "./actions";

const ITEM = "11111111-1111-4111-8111-111111111111";
const NODE = "22222222-2222-4222-8222-222222222222";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("curation queue actions (ADR-0026 D10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: "owner-1" },
    });
    mocks.applyCatalogQueueItem.mockResolvedValue({
      actionId: "action-1",
      subjectCatalogItemIds: [NODE],
    });
    mocks.revertCatalogAction.mockResolvedValue({
      revertActionId: "revert-1",
      subjectCatalogItemIds: [NODE],
    });
  });

  it("applies through the SQL function and expires the touched cards", async () => {
    await expect(
      acceptCatalogQueueItemAction(undefined, form({ queueItemId: ITEM })),
    ).resolves.toEqual({ actionId: "action-1" });

    expect(mocks.applyCatalogQueueItem).toHaveBeenCalledWith({
      queueItemId: ITEM,
      actorUserId: "owner-1",
      automatic: false,
    });
    expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledWith(
      [`organism:${NODE}`, "organism-slugs", "catalog", "sitemap"],
      "expire",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden/catalog/queue");
  });

  it("asks before a merge that moves more than fifty objects, and applies once confirmed", async () => {
    mocks.countObjectsOnCatalogItem.mockResolvedValue(51);

    await expect(
      acceptCatalogQueueItemAction(undefined, form({ queueItemId: ITEM, mergeSubjectCatalogItemId: NODE }),
      ),
    ).resolves.toEqual({ confirmationRequired: true, objects: 51 });
    expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();

    await acceptCatalogQueueItemAction(undefined, form({
        queueItemId: ITEM,
        mergeSubjectCatalogItemId: NODE,
        confirmMerge: "yes",
      }),
    );
    expect(mocks.applyCatalogQueueItem).toHaveBeenCalledTimes(1);

    // Fifty or fewer objects never asks.
    mocks.applyCatalogQueueItem.mockClear();
    mocks.countObjectsOnCatalogItem.mockResolvedValue(50);
    await acceptCatalogQueueItemAction(undefined, form({ queueItemId: ITEM, mergeSubjectCatalogItemId: NODE }),
    );
    expect(mocks.applyCatalogQueueItem).toHaveBeenCalledTimes(1);
  });

  it("records no and later without touching the graph", async () => {
    await rejectCatalogQueueItemAction(undefined, form({ queueItemId: ITEM }));
    expect(mocks.rejectCatalogQueueItem).toHaveBeenCalledWith({
      queueItemId: ITEM,
      actorUserId: "owner-1",
    });

    await skipCatalogQueueItemAction(undefined, form({ queueItemId: ITEM }));
    expect(mocks.skipCatalogQueueItem).toHaveBeenCalledWith({
      queueItemId: ITEM,
      actorUserId: "owner-1",
    });
    expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
  });

  it("reverts through the SQL function and expires the same cards", async () => {
    await revertCatalogActionAction(undefined, form({ actionId: "action-1" }));

    expect(mocks.revertCatalogAction).toHaveBeenCalledWith({
      actionId: "action-1",
      actorUserId: "owner-1",
    });
    expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledWith(
      [`organism:${NODE}`, "organism-slugs", "catalog", "sitemap"],
      "expire",
    );
  });

  it("refuses every decision when the mutation scope is rejected", async () => {
    mocks.resolveMutationScope.mockResolvedValue({
      status: "rejected",
      code: "owner_mismatch",
    });

    for (const action of [
      acceptCatalogQueueItemAction,
      rejectCatalogQueueItemAction,
      skipCatalogQueueItemAction,
      revertCatalogActionAction,
    ]) {
      await expect(
        action(undefined, form({ queueItemId: ITEM })),
      ).resolves.toEqual({
        mutationScope: "owner_mismatch",
      });
    }
    expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
    expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
    expect(mocks.rejectCatalogQueueItem).not.toHaveBeenCalled();
  });

  it("refuses a decision from a signed-in visitor who is not the owner", async () => {
    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      new Error("admin access denied"),
    );

    await expect(
      acceptCatalogQueueItemAction(undefined, form({ queueItemId: ITEM })),
    ).rejects.toThrow(/denied/u);
    expect(mocks.applyCatalogQueueItem).not.toHaveBeenCalled();
  });
});
