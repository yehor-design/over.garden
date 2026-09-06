import { beforeEach, describe, expect, it, vi } from "vitest";

const ITEM = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  ownerUserIdFromFormData: vi.fn(() => "owner-1"),
  assertAdminCapabilityForScope: vi.fn(),
  revalidatePublicCacheTags: vi.fn(),
  recordCardRename: vi.fn(),
  recordCardPinnedName: vi.fn(),
  recordCardIndexableOverride: vi.fn(),
  revertCardAction: vi.fn(),
  mergeCatalogCardIntoNode: vi.fn(),
  applyCatalogQueueItem: vi.fn(),
  countObjectsOnCatalogItem: vi.fn(),
  resolvePublicCatalogAddress: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: mocks.ownerUserIdFromFormData,
}));
vi.mock("@/server/admin-access", () => ({
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/server/public-cache-revalidation", () => ({
  revalidatePublicCacheTags: mocks.revalidatePublicCacheTags,
}));
vi.mock("@/server/owner-action-audit", () => ({
  recordCardRename: mocks.recordCardRename,
  recordCardPinnedName: mocks.recordCardPinnedName,
  recordCardIndexableOverride: mocks.recordCardIndexableOverride,
  revertCardAction: mocks.revertCardAction,
  mergeCatalogCardIntoNode: mocks.mergeCatalogCardIntoNode,
}));
vi.mock("@/server/catalog-curation-repository", () => ({
  applyCatalogQueueItem: mocks.applyCatalogQueueItem,
  countObjectsOnCatalogItem: mocks.countObjectsOnCatalogItem,
  MERGE_CONFIRMATION_OBJECT_THRESHOLD: 50,
}));
vi.mock("@/server/public-catalog-address-repository", () => ({
  resolvePublicCatalogAddress: mocks.resolvePublicCatalogAddress,
}));

import {
  mergeCatalogCardAction,
  pinCatalogCardNameAction,
  renameCatalogCardAction,
  revertCatalogCardEditAction,
  setCatalogCardIndexableAction,
} from "./catalog-owner-card-actions";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("owner card actions (ADR-0026 D10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: "owner-1" },
    });
    mocks.countObjectsOnCatalogItem.mockResolvedValue(3);
    mocks.mergeCatalogCardIntoNode.mockResolvedValue({ queueItemId: "queue-1" });
    mocks.applyCatalogQueueItem.mockResolvedValue({
      actionId: "action-1",
      subjectCatalogItemIds: [ITEM, TARGET],
    });
    mocks.resolvePublicCatalogAddress.mockResolvedValue({
      status: "canonical",
      catalogItemId: TARGET,
    });
  });

  it("renames, pins and sets indexability through the one audit, and expires the card", async () => {
    await renameCatalogCardAction(
      undefined,
      form({ catalogItemId: ITEM, displayName: "Помідор", locale: "uk", reason: "  " }),
    );
    expect(mocks.recordCardRename).toHaveBeenCalledWith({
      catalogItemId: ITEM,
      displayName: "Помідор",
      locale: "uk",
      reason: null,
      actorUserId: "owner-1",
    });

    await pinCatalogCardNameAction(
      undefined,
      form({ catalogItemId: ITEM, nameId: "name-1", reason: "the register spells it so" }),
    );
    expect(mocks.recordCardPinnedName).toHaveBeenCalledWith({
      catalogItemId: ITEM,
      nameId: "name-1",
      reason: "the register spells it so",
      actorUserId: "owner-1",
    });

    for (const [value, expected] of [
      ["true", true],
      ["false", false],
      ["", null],
    ] as const) {
      await setCatalogCardIndexableAction(
        undefined,
        form({ catalogItemId: ITEM, indexable: value }),
      );
      expect(mocks.recordCardIndexableOverride).toHaveBeenLastCalledWith({
        catalogItemId: ITEM,
        indexable: expected,
        actorUserId: "owner-1",
      });
    }

    await revertCatalogCardEditAction(
      undefined,
      form({ catalogItemId: ITEM, actionId: "action-1" }),
    );
    expect(mocks.revertCardAction).toHaveBeenCalledWith({
      actionId: "action-1",
      actorUserId: "owner-1",
    });
    expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledTimes(6);
  });

  it("refuses an empty name and a visitor whose session is not the owner's", async () => {
    await expect(
      renameCatalogCardAction(undefined, form({ catalogItemId: ITEM, displayName: "   " })),
    ).resolves.toEqual({ error: "empty_name" });
    expect(mocks.recordCardRename).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "rejected",
      code: "session_account_changed",
    });
    for (const action of [
      renameCatalogCardAction,
      pinCatalogCardNameAction,
      setCatalogCardIndexableAction,
      mergeCatalogCardAction,
      revertCatalogCardEditAction,
    ]) {
      await expect(
        action(undefined, form({ catalogItemId: ITEM, displayName: "x", targetAddress: "/species/a" })),
      ).resolves.toEqual({ mutationScope: "rejected" });
    }
    expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
    expect(mocks.mergeCatalogCardIntoNode).not.toHaveBeenCalled();
  });

  it("merges through the queue's own function, resolving the target by its address", async () => {
    await mergeCatalogCardAction(
      undefined,
      form({ catalogItemId: ITEM, targetAddress: " /species/solanum-lycopersicum " }),
    );
    expect(mocks.resolvePublicCatalogAddress).toHaveBeenCalledWith({
      kind: "species",
      speciesSlug: "solanum-lycopersicum",
      formSlug: null,
    });
    expect(mocks.mergeCatalogCardIntoNode).toHaveBeenCalledWith({
      loserCatalogItemId: ITEM,
      survivorCatalogItemId: TARGET,
      reason: null,
      actorUserId: "owner-1",
    });
    // The decision travels the one apply path, never a second implementation.
    expect(mocks.applyCatalogQueueItem).toHaveBeenCalledWith({
      queueItemId: "queue-1",
      actorUserId: "owner-1",
      automatic: false,
    });
    expect(mocks.revalidatePublicCacheTags).toHaveBeenCalledTimes(2);
  });

  it("asks once before merging a card that carries more than fifty gardener objects", async () => {
    mocks.countObjectsOnCatalogItem.mockResolvedValue(51);

    await expect(
      mergeCatalogCardAction(
        undefined,
        form({ catalogItemId: ITEM, targetAddress: "/species/a" }),
      ),
    ).resolves.toEqual({ confirmationRequired: true, objects: 51 });
    expect(mocks.mergeCatalogCardIntoNode).not.toHaveBeenCalled();

    await mergeCatalogCardAction(
      undefined,
      form({ catalogItemId: ITEM, targetAddress: "/species/a", confirmMerge: "yes" }),
    );
    expect(mocks.mergeCatalogCardIntoNode).toHaveBeenCalledTimes(1);
  });

  it("refuses a target it cannot resolve and a merge into the same node", async () => {
    mocks.resolvePublicCatalogAddress.mockResolvedValue({ status: "not_found" });
    await expect(
      mergeCatalogCardAction(
        undefined,
        form({ catalogItemId: ITEM, targetAddress: "/species/nowhere" }),
      ),
    ).resolves.toEqual({ error: "unknown_target" });

    await expect(
      mergeCatalogCardAction(undefined, form({ catalogItemId: ITEM, targetAddress: "" })),
    ).resolves.toEqual({ error: "empty_target" });

    await expect(
      mergeCatalogCardAction(undefined, form({ catalogItemId: ITEM, targetAddress: ITEM })),
    ).resolves.toEqual({ error: "same_node" });
    expect(mocks.mergeCatalogCardIntoNode).not.toHaveBeenCalled();
  });
});
