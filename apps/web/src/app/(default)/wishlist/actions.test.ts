import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  addCatalogPublicSlugToWishlist: vi.fn(),
  addCatalogItemToWishlist: vi.fn(),
  removeWishlistCatalogItem: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  resolveMutationScope: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId: sessionId ?? null,
  })),
}));

vi.mock("@/server/wishlist-repository", () => ({
  addCatalogPublicSlugToWishlist: mocks.addCatalogPublicSlugToWishlist,
  addCatalogItemToWishlist: mocks.addCatalogItemToWishlist,
  removeWishlistCatalogItem: mocks.removeWishlistCatalogItem,
}));

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const CATALOG_ITEM = "c0ffee00-0000-4000-8000-000000000101";

function shelfForm(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries({
    catalogItemId: CATALOG_ITEM,
    locale: "uk",
    ...fields,
  })) {
    formData.set(name, value);
  }
  return formData;
}

describe("wishlist actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.resolveMutationScope.mockImplementation(async () => {
      const session = await mocks.getCurrentSession();
      if (!session?.user?.id) {
        return {
          status: "rejected",
          code: "session_required",
        };
      }
      return {
        status: "admitted",
        scope: {
          userId: session.user.id,
          sessionId: mocks.getSessionId(session),
        },
      };
    });
    mocks.addCatalogPublicSlugToWishlist.mockResolvedValue({
      item: {
        catalog: { publicSlug: "pomidor-cheri-0000000101" },
      },
      created: true,
    });
    mocks.removeWishlistCatalogItem.mockResolvedValue({ removed: true });
    mocks.addCatalogItemToWishlist.mockResolvedValue({
      item: { catalog: { publicSlug: "pomidor-cheri-0000000101" } },
      created: true,
    });
  });

  it("adds a public variety to wishlist inside the signed-in scope", async () => {
    const { addCatalogPublicSlugToWishlistAction } = await import("./actions");
    const formData = new FormData();
    formData.set("catalogPublicSlug", "pomidor-cheri-0000000101");
    formData.set("locale", "uk");
    formData.set("returnTo", "/variety/pomidor-cheri-0000000101");

    await addCatalogPublicSlugToWishlistAction(undefined, formData);

    expect(mocks.addCatalogPublicSlugToWishlist).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        publicSlug: "pomidor-cheri-0000000101",
        sourceSurface: "public_variety",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/wishlist");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/variety/pomidor-cheri-0000000101",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/variety/pomidor-cheri-0000000101?wishlist=saved",
    );
  });

  it("routes signed-out wishlist intent to auth without mutating", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { addCatalogPublicSlugToWishlistAction } = await import("./actions");
    const formData = new FormData();
    formData.set("catalogPublicSlug", "pomidor-cheri-0000000101");
    formData.set("returnTo", "/variety/pomidor-cheri-0000000101");

    await addCatalogPublicSlugToWishlistAction(undefined, formData);

    expect(mocks.addCatalogPublicSlugToWishlist).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden?wishlist=pomidor-cheri-0000000101&returnTo=%2Fvariety%2Fpomidor-cheri-0000000101&source=wishlist",
    );
  });

  it.each([
    "/\\attacker.example/steal",
    "/%5cattacker.example/steal",
    "/%252f%255cattacker.example/steal",
  ])("falls back from unsafe return path %s", async (returnTo) => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { addCatalogPublicSlugToWishlistAction } = await import("./actions");
    const formData = new FormData();
    formData.set("catalogPublicSlug", "pomidor-cheri-0000000101");
    formData.set("returnTo", returnTo);

    await addCatalogPublicSlugToWishlistAction(undefined, formData);

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden?wishlist=pomidor-cheri-0000000101&returnTo=%2Fvariety%2Fpomidor-cheri-0000000101&source=wishlist",
    );
  });

  it("takes an item off by its catalogue id and comes back to the view it was pressed in", async () => {
    const { removeWishlistItemAction } = await import("./actions");

    await removeWishlistItemAction(
      undefined,
      shelfForm({
        // The id arrives as the form carried it and is used normalized.
        catalogItemId: ` ${CATALOG_ITEM.toUpperCase()} `,
        locale: "bg",
        returnTo:
          "/bg/wishlist?kind=species&page=2&outcome=failed&action=remove",
      }),
    );

    expect(mocks.removeWishlistCatalogItem).toHaveBeenCalledWith(
      SCOPE,
      CATALOG_ITEM,
    );
    expect(mocks.addCatalogItemToWishlist).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bg/wishlist");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    // No fragment: the row is gone, and the toast is what says so.
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/bg/wishlist?kind=species&page=2&outcome=removed&action=remove&target=${CATALOG_ITEM}`,
    );
  });

  it("puts an item back through the catalogue and lands on its row", async () => {
    const { restoreWishlistItemAction } = await import("./actions");

    await restoreWishlistItemAction(
      undefined,
      shelfForm({ returnTo: "/wishlist?kind=plant_variety" }),
    );

    expect(mocks.addCatalogItemToWishlist).toHaveBeenCalledWith(SCOPE, {
      catalogItemId: CATALOG_ITEM,
      sourceSurface: "catalog_item",
    });
    expect(mocks.removeWishlistCatalogItem).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/wishlist");
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/wishlist?kind=plant_variety&outcome=restored&action=restore&target=${CATALOG_ITEM}#saved-${CATALOG_ITEM}`,
    );
  });

  it.each([
    // A refused removal lands on its row, which is still on the list.
    [
      "removeWishlistItemAction",
      "remove",
      `#saved-${CATALOG_ITEM}`,
      () =>
        mocks.removeWishlistCatalogItem.mockRejectedValue(
          postgresRejection("57014"),
        ),
    ],
    // A refused Undo on the notice above the list, because its row is not.
    [
      "restoreWishlistItemAction",
      "restore",
      "#shelf-outcome",
      // The catalogue retired the item after it was taken off the list.
      () =>
        mocks.addCatalogItemToWishlist.mockRejectedValue(
          new Error("Wishlist catalog item is not available."),
        ),
    ],
  ] as const)(
    "lands a write that was refused (%s) as failed where it is said, and revalidates nothing",
    async (actionName, action, fragment, refuse) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      refuse();
      const actions = await import("./actions");

      await expect(
        actions[actionName](
          undefined,
          shelfForm({ locale: "ru", returnTo: "/ru/wishlist?page=2" }),
        ),
      ).resolves.toBeUndefined();

      expect(mocks.redirect).toHaveBeenCalledWith(
        `/ru/wishlist?page=2&outcome=failed&action=${action}&target=${CATALOG_ITEM}${fragment}`,
      );
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        "[wishlist] shelf write failed",
        expect.objectContaining({ action }),
      );
      log.mockRestore();
    },
  );

  it.each(["removeWishlistItemAction", "restoreWishlistItemAction"] as const)(
    "sends an ended session (%s) to sign-in and back to the same view, and writes nothing",
    async (actionName) => {
      mocks.getCurrentSession.mockResolvedValueOnce(null);
      const actions = await import("./actions");

      await actions[actionName](
        undefined,
        shelfForm({ locale: "ru", returnTo: "/ru/wishlist?kind=breed" }),
      );

      // Not `/garden?wishlist=…`, the flow that adds an item.
      expect(mocks.redirect).toHaveBeenCalledTimes(1);
      expect(mocks.redirect).toHaveBeenCalledWith(
        "/auth/sign-in?next=%2Fru%2Fwishlist%3Fkind%3Dbreed",
      );
      expect(mocks.removeWishlistCatalogItem).not.toHaveBeenCalled();
      expect(mocks.addCatalogItemToWishlist).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("answers a tab whose account changed with the scope code, and writes nothing", async () => {
    mocks.resolveMutationScope.mockResolvedValueOnce({
      status: "rejected",
      code: "session_account_changed",
      statusCode: 409,
    });
    const { removeWishlistItemAction } = await import("./actions");

    await expect(
      removeWishlistItemAction(undefined, shelfForm({ returnTo: "/wishlist" })),
    ).resolves.toEqual({ mutationScope: "session_account_changed" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.removeWishlistCatalogItem).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("comes back to the list itself from a return path that is not the list", async () => {
    const { removeWishlistItemAction } = await import("./actions");

    await removeWishlistItemAction(
      undefined,
      shelfForm({ locale: "bg", returnTo: "https://evil.example/wishlist" }),
    );

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/bg/wishlist?outcome=removed&action=remove&target=${CATALOG_ITEM}`,
    );
  });

  it.each([
    ["removeWishlistItemAction", "pomidor-cheri-0000000101"],
    ["restoreWishlistItemAction", "pomidor-cheri-0000000101"],
    ["removeWishlistItemAction", "../../etc/passwd"],
    ["restoreWishlistItemAction", ""],
    ["removeWishlistItemAction", CATALOG_ITEM.slice(0, -1)],
  ] as const)(
    "refuses (%s) a catalogue id that is not one: %j",
    async (actionName, catalogItemId) => {
      const actions = await import("./actions");

      await expect(
        actions[actionName](
          undefined,
          shelfForm({ catalogItemId, returnTo: "/wishlist" }),
        ),
      ).rejects.toThrow("Wishlist catalog item is not available.");
      expect(mocks.resolveMutationScope).not.toHaveBeenCalled();
      expect(mocks.removeWishlistCatalogItem).not.toHaveBeenCalled();
      expect(mocks.addCatalogItemToWishlist).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );
});
