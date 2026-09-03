import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activateFoundationRelease: vi.fn(),
  abandonFoundationRelease: vi.fn(),
  resolveMutationScope: vi.fn(),
  approveFoundationPreview: vi.fn(),
  assertCatalogCuratorAccess: vi.fn(),
  createFoundationDraft: vi.fn(),
  decideFoundationExceptionGroup: vi.fn(),
  isStableRegistryReleaseCenterEnabled: vi.fn(),
  revalidatePath: vi.fn(),
  recordOwnerAction: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/server/owner-action-audit", () => ({
  recordOwnerAction: mocks.recordOwnerAction,
}));

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
  activateFoundationRelease: mocks.activateFoundationRelease,
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

  it("refuses activation without the confirm step and audits an accepted one", async () => {
    mocks.isStableRegistryReleaseCenterEnabled.mockReturnValue(true);
    mocks.activateFoundationRelease.mockResolvedValue({ outcome: "accepted" });
    const { activateFoundationReleaseAction } = await import("./actions");
    const formData = new FormData();
    formData.set("releaseId", "00000000-0000-4000-8000-000000000255");
    formData.set("previewDigest", "digest");

    await expect(activateFoundationReleaseAction(formData)).resolves.toEqual({
      outcome: "confirmation_required",
    });
    expect(mocks.activateFoundationRelease).not.toHaveBeenCalled();
    expect(mocks.recordOwnerAction).not.toHaveBeenCalled();

    formData.set("confirmIrreversible", "on");
    await expect(activateFoundationReleaseAction(formData)).resolves.toEqual({
      outcome: "accepted",
    });
    expect(mocks.activateFoundationRelease).toHaveBeenCalledWith(
      { userId: "00000000-0000-4000-8000-000000000001" },
      {
        releaseId: "00000000-0000-4000-8000-000000000255",
        previewDigest: "digest",
        writesEnabled: true,
      },
    );
    expect(mocks.recordOwnerAction).toHaveBeenCalledWith(
      { userId: "00000000-0000-4000-8000-000000000001" },
      "stable_registry_foundation_activate",
      "release=00000000-0000-4000-8000-000000000255",
    );

    mocks.recordOwnerAction.mockClear();
    mocks.activateFoundationRelease.mockResolvedValue({ outcome: "stale" });
    await expect(activateFoundationReleaseAction(formData)).resolves.toEqual({
      outcome: "stale",
    });
    expect(mocks.recordOwnerAction).not.toHaveBeenCalled();
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
