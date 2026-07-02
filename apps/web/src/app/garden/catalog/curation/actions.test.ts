import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  assertCatalogCuratorAccess: vi.fn(),
  confirmCatalogCurationCandidate: vi.fn(),
  mergeCatalogCurationCandidate: vi.fn(),
  rejectCatalogCurationCandidate: vi.fn(),
  promoteCatalogSourceCandidate: vi.fn(),
  holdCatalogSourceCandidate: vi.fn(),
  rejectCatalogSourceCandidate: vi.fn(),
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

vi.mock("@/server/catalog-source/candidate-review-repository", () => ({
  promoteCatalogSourceCandidate: mocks.promoteCatalogSourceCandidate,
  holdCatalogSourceCandidate: mocks.holdCatalogSourceCandidate,
  rejectCatalogSourceCandidate: mocks.rejectCatalogSourceCandidate,
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
    mocks.promoteCatalogSourceCandidate.mockResolvedValue({
      sourceRecordId: "00000000-0000-4000-8000-000000066001",
      sourceRecordKey: "GRIN:NPGS:OVE62:RED-CHERRY-TOMATO",
      status: "promoted",
      catalogItemId: "00000000-0000-4000-8000-000000066002",
      catalogPublicSlug: "red-cherry-tomato-grin-genebank-candidate",
    });
    mocks.holdCatalogSourceCandidate.mockResolvedValue({
      sourceRecordId: "00000000-0000-4000-8000-000000066003",
      sourceRecordKey: "GRIN:NPGS:OVE62:UNREVIEWED-LANDRACE",
      status: "held",
      catalogItemId: null,
      catalogPublicSlug: null,
    });
    mocks.rejectCatalogSourceCandidate.mockResolvedValue({
      sourceRecordId: "00000000-0000-4000-8000-000000066003",
      sourceRecordKey: "GRIN:NPGS:OVE62:UNREVIEWED-LANDRACE",
      status: "rejected",
      catalogItemId: null,
      catalogPublicSlug: null,
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
    mocks.confirmCatalogCurationCandidate.mockResolvedValue({
      candidate: {
        public_slug: "babusyn-perets-0000000201",
      },
      publicEntryPaths: ["/journal/babusyn-perets-entry"],
    });

    const { confirmCatalogCandidateAction } = await import("./actions");
    const formData = new FormData();
    formData.set("candidateId", "candidate-1");

    await confirmCatalogCandidateAction(formData);

    expect(mocks.confirmCatalogCurationCandidate).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/variety/babusyn-perets-0000000201",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/journal/babusyn-perets-entry",
    );
  });

  it("rejects source candidate promotion before repository writes for a non-operator", async () => {
    mocks.assertCatalogCuratorAccess.mockImplementation(() => {
      throw new Error("Catalog curation access denied.");
    });

    const { promoteCatalogSourceCandidateAction } = await import("./actions");
    const formData = new FormData();
    formData.set("sourceRecordId", "00000000-0000-4000-8000-000000066001");

    await expect(promoteCatalogSourceCandidateAction(formData)).rejects.toThrow(
      "Catalog curation access denied.",
    );
    expect(mocks.promoteCatalogSourceCandidate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects source hold and reject before repository writes for a non-operator", async () => {
    mocks.assertCatalogCuratorAccess.mockImplementation(() => {
      throw new Error("Catalog curation access denied.");
    });

    const {
      holdCatalogSourceCandidateAction,
      rejectCatalogSourceCandidateAction,
    } = await import("./actions");
    const formData = new FormData();
    formData.set("sourceRecordId", "00000000-0000-4000-8000-000000066003");

    await expect(holdCatalogSourceCandidateAction(formData)).rejects.toThrow(
      "Catalog curation access denied.",
    );
    await expect(rejectCatalogSourceCandidateAction(formData)).rejects.toThrow(
      "Catalog curation access denied.",
    );
    expect(mocks.holdCatalogSourceCandidate).not.toHaveBeenCalled();
    expect(mocks.rejectCatalogSourceCandidate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allows source candidate promotion for an allowlisted operator", async () => {
    const { promoteCatalogSourceCandidateAction } = await import("./actions");
    const formData = new FormData();
    formData.set("sourceRecordId", "00000000-0000-4000-8000-000000066001");

    await promoteCatalogSourceCandidateAction(formData);

    expect(mocks.promoteCatalogSourceCandidate).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/variety/red-cherry-tomato-grin-genebank-candidate",
    );
  });

  it("keeps source hold and reject actions on the internal curation surface", async () => {
    const {
      holdCatalogSourceCandidateAction,
      rejectCatalogSourceCandidateAction,
    } = await import("./actions");
    const formData = new FormData();
    formData.set("sourceRecordId", "00000000-0000-4000-8000-000000066003");

    await holdCatalogSourceCandidateAction(formData);
    await rejectCatalogSourceCandidateAction(formData);

    expect(mocks.holdCatalogSourceCandidate).toHaveBeenCalledOnce();
    expect(mocks.rejectCatalogSourceCandidate).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith(
      "/variety/red-cherry-tomato-grin-genebank-candidate",
    );
  });
});
