import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  assertCatalogCuratorAccess: vi.fn(),
  isStableRegistryEditionsEnabled: vi.fn(),
  moveEditionPointer: vi.fn(),
  recordOwnerAction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/lib/stable-registry/feature-gate", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/stable-registry/feature-gate")
  >()),
  isStableRegistryEditionsEnabled: mocks.isStableRegistryEditionsEnabled,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: () => null,
}));
vi.mock("@/server/catalog-curator-auth", () => ({
  assertCatalogCuratorAccess: mocks.assertCatalogCuratorAccess,
}));
vi.mock("@/server/owner-action-audit", () => ({
  recordOwnerAction: mocks.recordOwnerAction,
}));
vi.mock(
  "@/server/stable-registry/edition-repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/server/stable-registry/edition-repository")
    >()),
    moveEditionPointer: mocks.moveEditionPointer,
  }),
);

describe("edition pointer action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: "00000000-0000-4000-8000-000000000001" },
    });
    mocks.assertCatalogCuratorAccess.mockResolvedValue({ role: "owner" });
    mocks.isStableRegistryEditionsEnabled.mockReturnValue(true);
    mocks.moveEditionPointer.mockResolvedValue({ outcome: "accepted" });
  });

  it("needs the confirm step and audits the transition it performed", async () => {
    const { moveEditionPointerAction } = await import("./edition-actions");
    const formData = new FormData();
    formData.set("releaseId", "00000000-0000-4000-8000-000000000301");
    formData.set("previewDigest", "digest");
    formData.set("transition", "rollback");

    await expect(moveEditionPointerAction(formData)).resolves.toEqual({
      outcome: "confirmation_required",
    });
    expect(mocks.moveEditionPointer).not.toHaveBeenCalled();

    formData.set("confirmIrreversible", "on");
    await expect(moveEditionPointerAction(formData)).resolves.toEqual({
      outcome: "accepted",
    });
    expect(mocks.moveEditionPointer).toHaveBeenCalledWith(
      { userId: "00000000-0000-4000-8000-000000000001" },
      expect.objectContaining({ transition: "rollback", writesEnabled: true }),
    );
    expect(mocks.recordOwnerAction).toHaveBeenCalledWith(
      { userId: "00000000-0000-4000-8000-000000000001" },
      "stable_registry_edition_rollback",
      "release=00000000-0000-4000-8000-000000000301",
    );
  });
});
