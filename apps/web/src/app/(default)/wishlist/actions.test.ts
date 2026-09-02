import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  addCatalogPublicSlugToWishlist: vi.fn(),
  removeCatalogPublicSlugFromWishlist: vi.fn(),
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
  removeCatalogPublicSlugFromWishlist:
    mocks.removeCatalogPublicSlugFromWishlist,
}));

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
    mocks.removeCatalogPublicSlugFromWishlist.mockResolvedValue({
      removed: true,
    });
  });

  it("adds a public variety to wishlist inside the signed-in scope", async () => {
    const { addCatalogPublicSlugToWishlistAction } = await import("./actions");
    const formData = new FormData();
    formData.set("catalogPublicSlug", "pomidor-cheri-0000000101");
    formData.set("locale", "uk");
    formData.set("returnTo", "/variety/pomidor-cheri-0000000101");

    await addCatalogPublicSlugToWishlistAction(formData);

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

    await addCatalogPublicSlugToWishlistAction(formData);

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

    await addCatalogPublicSlugToWishlistAction(formData);

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden?wishlist=pomidor-cheri-0000000101&returnTo=%2Fvariety%2Fpomidor-cheri-0000000101&source=wishlist",
    );
  });

  it("removes wishlist items inside the signed-in scope", async () => {
    const { removeCatalogPublicSlugFromWishlistAction } =
      await import("./actions");
    const formData = new FormData();
    formData.set("catalogPublicSlug", "pomidor-cheri-0000000101");
    formData.set("locale", "uk");

    await removeCatalogPublicSlugFromWishlistAction(formData);

    expect(mocks.removeCatalogPublicSlugFromWishlist).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      "pomidor-cheri-0000000101",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/wishlist?wishlist=removed");
  });
});
