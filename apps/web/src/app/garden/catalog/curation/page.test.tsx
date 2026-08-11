import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCatalogCuratorAccess: vi.fn(),
  listCatalogAliasSuggestionTargets: vi.fn(),
  listCatalogAliasSuggestionsForCuration: vi.fn(),
  listPendingCatalogCurationCandidates: vi.fn(),
  listCatalogSourceCandidatesForReview: vi.fn(),
  readCatalogSourceCandidateReviewSummary: vi.fn(),
  readCatalogEntityResolutionQaReport: vi.fn(),
  listCatalogSourceProvenanceForCuration: vi.fn(),
  listVarietySeedProofsForCuration: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
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

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/catalog-curator-auth", () => ({
  assertCatalogCuratorAccess: mocks.assertCatalogCuratorAccess,
}));

vi.mock("@/server/catalog-curation-repository", () => ({
  listPendingCatalogCurationCandidates:
    mocks.listPendingCatalogCurationCandidates,
}));

vi.mock("@/server/catalog-alias-curation-repository", () => ({
  listCatalogAliasSuggestionTargets: mocks.listCatalogAliasSuggestionTargets,
  listCatalogAliasSuggestionsForCuration:
    mocks.listCatalogAliasSuggestionsForCuration,
}));

vi.mock("@/server/catalog-source/candidate-review-repository", () => ({
  listCatalogSourceCandidatesForReview:
    mocks.listCatalogSourceCandidatesForReview,
  readCatalogSourceCandidateReviewSummary:
    mocks.readCatalogSourceCandidateReviewSummary,
}));

vi.mock("@/server/catalog-source/entity-resolution-qa-repository", () => ({
  readCatalogEntityResolutionQaReport:
    mocks.readCatalogEntityResolutionQaReport,
}));

vi.mock("@/server/catalog-source/provenance-repository", () => ({
  listCatalogSourceProvenanceForCuration:
    mocks.listCatalogSourceProvenanceForCuration,
}));

vi.mock("@/server/variety-seed-proof-repository", () => ({
  listVarietySeedProofsForCuration: mocks.listVarietySeedProofsForCuration,
}));

vi.mock("./actions", () => ({
  approveCatalogAliasSuggestionAction: vi.fn(),
  approveCatalogMatchSuggestionAction: vi.fn(),
  confirmCatalogCandidateAction: vi.fn(),
  generateCatalogAliasSuggestionsAction: vi.fn(),
  holdCatalogSourceCandidateAction: vi.fn(),
  mergeCatalogCandidateAction: vi.fn(),
  promoteCatalogSourceCandidateAction: vi.fn(),
  rejectCatalogAliasSuggestionAction: vi.fn(),
  rejectCatalogCandidateAction: vi.fn(),
  rejectCatalogMatchSuggestionAction: vi.fn(),
  rejectCatalogSourceCandidateAction: vi.fn(),
  refreshCatalogFuzzyDuplicateQaAction: vi.fn(),
  rescanCatalogMatchSuggestionsAction: vi.fn(),
  upsertVarietySeedProofAction: vi.fn(),
}));

vi.mock("./catalog-alias-suggestion-review", () => ({
  CatalogAliasSuggestionReview: ({ searchQuery }: { searchQuery: string }) =>
    `alias-suggestion-review:${searchQuery}`,
}));

vi.mock("./catalog-curation-candidate-list", () => ({
  CatalogCurationCandidateList: () => "curation-candidates",
}));

vi.mock("./catalog-source-candidate-review-list", () => ({
  CatalogSourceCandidateReviewList: () => "source-candidate-review",
}));

vi.mock("./catalog-entity-resolution-report", () => ({
  CatalogEntityResolutionReport: () => "entity-resolution-report",
}));

vi.mock("./catalog-source-provenance-list", () => ({
  CatalogSourceProvenanceList: () => "source-provenance-list",
}));

vi.mock("./variety-seed-proof-editor", () => ({
  VarietySeedProofEditor: () => "seed-proof-editor",
}));

describe("/garden/catalog/curation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCatalogCuratorAccess.mockResolvedValue({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
    mocks.listCatalogAliasSuggestionTargets.mockResolvedValue([]);
    mocks.listCatalogAliasSuggestionsForCuration.mockResolvedValue([]);
    mocks.listPendingCatalogCurationCandidates.mockResolvedValue([]);
    mocks.listCatalogSourceCandidatesForReview.mockResolvedValue([]);
    mocks.readCatalogSourceCandidateReviewSummary.mockResolvedValue({
      total: 0,
      statuses: [],
    });
    mocks.readCatalogEntityResolutionQaReport.mockResolvedValue({
      schemaVersion: "ove162.catalogEntityResolutionQa.v2",
      issue: "OVE-162",
      generatedAt: "2026-07-02T00:00:00.000Z",
      evidenceSafety: "linear_safe_redacted",
      summary: {
        clusterCount: 0,
        sourceBackedCatalogRowsReviewed: 0,
        aliasCollisionRowsReviewed: 0,
        sourceCandidateGroupsReviewed: 0,
        fuzzyDuplicatePairCount: 0,
        fuzzyDuplicateRowsReviewed: 0,
        groups: [],
      },
      clusters: [],
      leakCheck: "passed",
    });
    mocks.listCatalogSourceProvenanceForCuration.mockResolvedValue([]);
    mocks.listVarietySeedProofsForCuration.mockResolvedValue([]);
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
  });

  it("does not read curation data for a signed-in non-operator", async () => {
    mocks.assertCatalogCuratorAccess.mockImplementation(() => {
      throw new Error("Catalog curation access denied.");
    });

    const { default: CatalogCurationPage } = await import("./page");
    const html = renderToStaticMarkup(await CatalogCurationPage());

    expect(html).toContain("Доступ заборонено.");
    expect(html).toContain('data-operator-access-state="denied"');
    expect(mocks.listPendingCatalogCurationCandidates).not.toHaveBeenCalled();
    expect(mocks.listCatalogAliasSuggestionTargets).not.toHaveBeenCalled();
    expect(mocks.listCatalogAliasSuggestionsForCuration).not.toHaveBeenCalled();
    expect(mocks.listCatalogSourceCandidatesForReview).not.toHaveBeenCalled();
    expect(
      mocks.readCatalogSourceCandidateReviewSummary,
    ).not.toHaveBeenCalled();
    expect(mocks.readCatalogEntityResolutionQaReport).not.toHaveBeenCalled();
    expect(mocks.listCatalogSourceProvenanceForCuration).not.toHaveBeenCalled();
    expect(mocks.listVarietySeedProofsForCuration).not.toHaveBeenCalled();
  });

  it("renders curation data for the sealed owner", async () => {
    const { default: CatalogCurationPage } = await import("./page");
    const html = renderToStaticMarkup(
      await CatalogCurationPage({
        searchParams: Promise.resolve({ aliasQuery: "rosa" }),
      }),
    );

    expect(html).toContain("Режим доступу: захищений власник");
    expect(html).toContain("Роль: Власник");
    expect(html).toContain("source-candidate-review");
    expect(html).toContain("entity-resolution-report");
    expect(html).toContain("alias-suggestion-review:rosa");
    expect(mocks.listCatalogAliasSuggestionTargets).toHaveBeenCalledWith({
      query: "rosa",
    });
    expect(mocks.listCatalogAliasSuggestionsForCuration).toHaveBeenCalledOnce();
    expect(mocks.listPendingCatalogCurationCandidates).toHaveBeenCalledOnce();
    expect(mocks.listCatalogSourceCandidatesForReview).toHaveBeenCalledOnce();
    expect(
      mocks.readCatalogSourceCandidateReviewSummary,
    ).toHaveBeenCalledOnce();
    expect(mocks.readCatalogEntityResolutionQaReport).toHaveBeenCalledOnce();
    expect(mocks.listCatalogSourceProvenanceForCuration).toHaveBeenCalledOnce();
    expect(mocks.listVarietySeedProofsForCuration).toHaveBeenCalledOnce();
  });

  it("renders the operator header in every supported interface locale", async () => {
    const { default: CatalogCurationPage } = await import("./page");

    mocks.getRequestInterfaceLocale.mockResolvedValueOnce("bg");
    const bgHtml = renderToStaticMarkup(await CatalogCurationPage());
    expect(bgHtml).toContain("Куриране на каталога");
    expect(bgHtml).toContain("Режим на достъп: защитен собственик");

    mocks.getRequestInterfaceLocale.mockResolvedValueOnce("ru");
    const ruHtml = renderToStaticMarkup(await CatalogCurationPage());
    expect(ruHtml).toContain("Курация каталога");
    expect(ruHtml).toContain("Режим доступа: защищённый владелец");
  });
});
