import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCatalogCuratorAccess: vi.fn(),
  listPendingCatalogCurationCandidates: vi.fn(),
  listVarietySeedProofsForCuration: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000999" },
  })),
  getSessionId: vi.fn(() => "operator-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/catalog-curator-auth", () => ({
  assertCatalogCuratorAccess: mocks.assertCatalogCuratorAccess,
}));

vi.mock("@/server/catalog-curation-repository", () => ({
  listPendingCatalogCurationCandidates:
    mocks.listPendingCatalogCurationCandidates,
}));

vi.mock("@/server/variety-seed-proof-repository", () => ({
  listVarietySeedProofsForCuration: mocks.listVarietySeedProofsForCuration,
}));

vi.mock("./actions", () => ({
  confirmCatalogCandidateAction: vi.fn(),
  mergeCatalogCandidateAction: vi.fn(),
  rejectCatalogCandidateAction: vi.fn(),
  upsertVarietySeedProofAction: vi.fn(),
}));

vi.mock("./catalog-curation-candidate-list", () => ({
  CatalogCurationCandidateList: () => "curation-candidates",
}));

vi.mock("./variety-seed-proof-editor", () => ({
  VarietySeedProofEditor: () => "seed-proof-editor",
}));

describe("/garden/catalog/curation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCatalogCuratorAccess.mockReturnValue({ mode: "allowlist" });
    mocks.listPendingCatalogCurationCandidates.mockResolvedValue([]);
    mocks.listVarietySeedProofsForCuration.mockResolvedValue([]);
  });

  it("does not read curation data for a signed-in non-operator", async () => {
    mocks.assertCatalogCuratorAccess.mockImplementation(() => {
      throw new Error("Catalog curation access denied.");
    });

    const { default: CatalogCurationPage } = await import("./page");
    const html = renderToStaticMarkup(await CatalogCurationPage());

    expect(html).toContain("Access denied.");
    expect(mocks.listPendingCatalogCurationCandidates).not.toHaveBeenCalled();
    expect(mocks.listVarietySeedProofsForCuration).not.toHaveBeenCalled();
  });

  it("renders curation data for an allowlisted operator", async () => {
    const { default: CatalogCurationPage } = await import("./page");
    const html = renderToStaticMarkup(await CatalogCurationPage());

    expect(html).toContain("Gate: allowlist");
    expect(mocks.listPendingCatalogCurationCandidates).toHaveBeenCalledOnce();
    expect(mocks.listVarietySeedProofsForCuration).toHaveBeenCalledOnce();
  });
});
