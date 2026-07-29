import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  addCatalogPublicSlugToWishlist: vi.fn(),
  removeCatalogPublicSlugFromWishlist: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  resolveVisualSocialMutationActor: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/wishlist-repository", () => ({
  addCatalogPublicSlugToWishlist: mocks.addCatalogPublicSlugToWishlist,
  removeCatalogPublicSlugFromWishlist:
    mocks.removeCatalogPublicSlugFromWishlist,
}));

vi.mock("@/server/visual-fixtures/social-actor", () => ({
  resolveVisualSocialMutationActor: mocks.resolveVisualSocialMutationActor,
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
    mocks.addCatalogPublicSlugToWishlist.mockResolvedValue({
      item: {
        catalog: { publicSlug: "pomidor-cheri-0000000101" },
      },
      created: true,
    });
    mocks.removeCatalogPublicSlugFromWishlist.mockResolvedValue({
      removed: true,
    });
    mocks.resolveVisualSocialMutationActor.mockReturnValue(null);
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

  it("removes an isolated fixture wishlist row and preserves the scenario", async () => {
    const actorId = "18700001-0000-4000-8000-000000000001";
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    mocks.resolveVisualSocialMutationActor.mockReturnValueOnce({
      actorId,
      scenario: { id: "wishlist-dense" },
    });
    const { removeCatalogPublicSlugFromWishlistAction } =
      await import("./actions");
    const formData = new FormData();
    formData.set("catalogPublicSlug", "pomidor-cheri-0000000101");
    formData.set("locale", "uk");
    formData.set("visualSocial", "wishlist-dense");

    await removeCatalogPublicSlugFromWishlistAction(formData);

    expect(mocks.removeCatalogPublicSlugFromWishlist).toHaveBeenCalledWith(
      { userId: actorId, sessionId: null },
      "pomidor-cheri-0000000101",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/wishlist?visualSocial=wishlist-dense&wishlist=removed",
    );
  });
});
