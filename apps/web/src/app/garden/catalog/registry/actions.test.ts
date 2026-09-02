import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  abandonFoundationRelease: vi.fn(),
  resolveMutationScope: vi.fn(),
  approveFoundationPreview: vi.fn(),
  assertCatalogCuratorAccess: vi.fn(),
  createFoundationDraft: vi.fn(),
  decideFoundationExceptionGroup: vi.fn(),
  isStableRegistryReleaseCenterEnabled: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/stable-registry/feature-gate", () => ({
  isStableRegistryReleaseCenterEnabled:
    mocks.isStableRegistryReleaseCenterEnabled,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn((formData: FormData) =>
    formData.get("__overgardenDocumentGeneration"),
  ),
}));
vi.mock("@/server/catalog-curator-auth", () => ({
  assertCatalogCuratorAccess: mocks.assertCatalogCuratorAccess,
}));
vi.mock("@/server/stable-registry/release-repository", () => ({
  abandonFoundationRelease: mocks.abandonFoundationRelease,
  activateFoundationRelease: vi.fn(),
  approveFoundationPreview: mocks.approveFoundationPreview,
  createFoundationDraft: mocks.createFoundationDraft,
  decideFoundationExceptionGroup: mocks.decideFoundationExceptionGroup,
}));

describe("Stable Registry Release Center actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: "00000000-0000-4000-8000-000000000001" },
    });
    mocks.assertCatalogCuratorAccess.mockResolvedValue({ role: "owner" });
    mocks.isStableRegistryReleaseCenterEnabled.mockReturnValue(false);
    mocks.createFoundationDraft.mockResolvedValue({ outcome: "blocked" });
    mocks.approveFoundationPreview.mockResolvedValue({ outcome: "blocked" });
    mocks.decideFoundationExceptionGroup.mockResolvedValue({
      outcome: "blocked",
    });
    mocks.abandonFoundationRelease.mockResolvedValue({ outcome: "blocked" });
  });

  it("keeps a feature-dark build blocked after owner authentication", async () => {
    const { buildFoundationReleaseAction } = await import("./actions");

    const result = await buildFoundationReleaseAction(new FormData());

    expect(result).toEqual({ outcome: "blocked" });
    expect(mocks.assertCatalogCuratorAccess).toHaveBeenCalledOnce();
    expect(mocks.createFoundationDraft).toHaveBeenCalledWith(
      { userId: "00000000-0000-4000-8000-000000000001" },
      { captureId: undefined, writesEnabled: false },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/registry",
    );
  });

  it("returns a bounded forbidden outcome without calling a release mutation", async () => {
    mocks.assertCatalogCuratorAccess.mockRejectedValue(new Error("denied"));
    const { approveFoundationPreviewAction } = await import("./actions");
    const formData = new FormData();
    formData.set("releaseId", "00000000-0000-4000-8000-000000000255");

    await expect(approveFoundationPreviewAction(formData)).resolves.toEqual({
      outcome: "forbidden",
    });
    expect(mocks.approveFoundationPreview).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
