import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  assertCatalogCuratorAccess: vi.fn(),
  confirmCatalogCurationCandidate: vi.fn(),
  mergeCatalogCurationCandidate: vi.fn(),
  rejectCatalogCurationCandidate: vi.fn(),
  upsertVarietySeedProof: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));

vi.mock("@/server/catalog-curator-auth", () => ({
  assertCatalogCuratorAccess: mocks.assertCatalogCuratorAccess,
}));

vi.mock("@/server/catalog-curation-repository", () => ({
  confirmCatalogCurationCandidate: mocks.confirmCatalogCurationCandidate,
  mergeCatalogCurationCandidate: mocks.mergeCatalogCurationCandidate,
  rejectCatalogCurationCandidate: mocks.rejectCatalogCurationCandidate,
}));

vi.mock("@/server/variety-seed-proof-repository", () => ({
  upsertVarietySeedProof: mocks.upsertVarietySeedProof,
}));

vi.mock("@/lib/garden/public-paths", () => ({
  publicVarietyPath: vi.fn((slug: string) => `/variety/${slug}`),
}));

describe("catalog curation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000999",
      sessionId: "non-operator-session",
    });
    mocks.assertCatalogCuratorAccess.mockReturnValue({ mode: "allowlist" });
    mocks.confirmCatalogCurationCandidate.mockResolvedValue({
      publicEntryPaths: [],
    });
  });

  it("rejects candidate confirmation before repository writes for a non-operator", async () => {
    mocks.assertCatalogCuratorAccess.mockImplementation(() => {
      throw new Error("Catalog curation access denied.");
    });

    const { confirmCatalogCandidateAction } = await import("./actions");
    const formData = new FormData();
    formData.set("candidateId", "candidate-1");

    await expect(confirmCatalogCandidateAction(formData)).rejects.toThrow(
      "Catalog curation access denied.",
    );
    expect(mocks.confirmCatalogCurationCandidate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allows candidate confirmation for an allowlisted operator", async () => {
    const { confirmCatalogCandidateAction } = await import("./actions");
    const formData = new FormData();
    formData.set("candidateId", "candidate-1");

    await confirmCatalogCandidateAction(formData);

    expect(mocks.confirmCatalogCurationCandidate).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
  });
});
