import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
  assertCatalogCuratorAccess: vi.fn(),
  enqueueCatalogAliasSuggestionsRefresh: vi.fn(),
  approveCatalogAliasSuggestion: vi.fn(),
  rejectCatalogAliasSuggestion: vi.fn(),
  confirmCatalogCurationCandidate: vi.fn(),
  enqueueCatalogMatchSuggestionsRefresh: vi.fn(),
  enqueueCatalogFuzzyDuplicateQaRefresh: vi.fn(),
  approveCatalogMatchSuggestion: vi.fn(),
  rejectCatalogMatchSuggestion: vi.fn(),
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

vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromFormData: vi.fn((formData: FormData) =>
    formData.get("__overgardenDocumentGeneration"),
  ),
}));

vi.mock("@/server/catalog-curator-auth", () => ({
  assertCatalogCuratorAccess: mocks.assertCatalogCuratorAccess,
}));

vi.mock("@/server/catalog-alias-curation-repository", () => ({
  approveCatalogAliasSuggestion: mocks.approveCatalogAliasSuggestion,
  enqueueCatalogAliasSuggestionsRefresh:
    mocks.enqueueCatalogAliasSuggestionsRefresh,
  rejectCatalogAliasSuggestion: mocks.rejectCatalogAliasSuggestion,
}));

vi.mock("@/server/catalog-curation-repository", () => ({
  approveCatalogMatchSuggestion: mocks.approveCatalogMatchSuggestion,
  confirmCatalogCurationCandidate: mocks.confirmCatalogCurationCandidate,
  enqueueCatalogMatchSuggestionsRefresh:
    mocks.enqueueCatalogMatchSuggestionsRefresh,
  mergeCatalogCurationCandidate: mocks.mergeCatalogCurationCandidate,
  rejectCatalogCurationCandidate: mocks.rejectCatalogCurationCandidate,
  rejectCatalogMatchSuggestion: mocks.rejectCatalogMatchSuggestion,
}));

vi.mock("@/server/catalog-source/candidate-review-repository", () => ({
  promoteCatalogSourceCandidate: mocks.promoteCatalogSourceCandidate,
  holdCatalogSourceCandidate: mocks.holdCatalogSourceCandidate,
  rejectCatalogSourceCandidate: mocks.rejectCatalogSourceCandidate,
}));

vi.mock("@/server/catalog-source/fuzzy-duplicate-qa-job-repository", () => ({
  enqueueCatalogFuzzyDuplicateQaRefresh:
    mocks.enqueueCatalogFuzzyDuplicateQaRefresh,
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
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-4000-8000-000000000999",
        sessionId: "non-operator-session",
      },
    });
    mocks.assertCatalogCuratorAccess.mockResolvedValue({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "admin:manage_roles",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
    mocks.confirmCatalogCurationCandidate.mockResolvedValue({
      publicEntryPaths: [],
    });
    mocks.enqueueCatalogAliasSuggestionsRefresh.mockResolvedValue({
      catalogItemId: "00000000-0000-4000-8000-000000000101",
    });
    mocks.approveCatalogAliasSuggestion.mockResolvedValue({
      outcome: "approved",
      catalogItemNameId: "00000000-0000-4000-8000-000000000401",
    });
    mocks.rejectCatalogAliasSuggestion.mockResolvedValue({
      outcome: "rejected",
      catalogItemNameId: null,
    });
    mocks.approveCatalogMatchSuggestion.mockResolvedValue({
      outcome: "approved",
      candidate: { public_slug: null },
      targetPublicSlug: null,
      affectedObjectCount: 0,
      publicEntryPaths: [],
    });
    mocks.rejectCatalogMatchSuggestion.mockResolvedValue({
      outcome: "rejected",
      candidate: { public_slug: null },
      targetPublicSlug: null,
      affectedObjectCount: 0,
      publicEntryPaths: [],
    });
    mocks.enqueueCatalogMatchSuggestionsRefresh.mockResolvedValue({
      candidateId: "00000000-0000-4000-8000-000000000201",
    });
    mocks.enqueueCatalogFuzzyDuplicateQaRefresh.mockResolvedValue({
      kind: "catalog_fuzzy_duplicate_qa_refresh",
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

  it("allows candidate confirmation for the sealed owner", async () => {
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

  it("queues a bounded deterministic rescan behind the operator gate", async () => {
    const { rescanCatalogMatchSuggestionsAction } = await import("./actions");
    const formData = new FormData();
    formData.set("candidateId", "00000000-0000-4000-8000-000000000201");

    await rescanCatalogMatchSuggestionsAction(formData);

    expect(mocks.assertCatalogCuratorAccess).toHaveBeenCalledOnce();
    expect(mocks.enqueueCatalogMatchSuggestionsRefresh).toHaveBeenCalledWith({
      candidateId: "00000000-0000-4000-8000-000000000201",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/garden");
  });

  it("queues the global fuzzy QA refresh behind the operator gate", async () => {
    const { refreshCatalogFuzzyDuplicateQaAction } = await import("./actions");

    const result = await refreshCatalogFuzzyDuplicateQaAction(new FormData());

    expect(mocks.assertCatalogCuratorAccess).toHaveBeenCalledOnce();
    expect(mocks.enqueueCatalogFuzzyDuplicateQaRefresh).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/garden");
    expect(result).toBeUndefined();
  });

  it("queues bounded alias generation behind the operator gate", async () => {
    const actions = (await import("./actions")) as Record<string, unknown>;
    const action = actions.generateCatalogAliasSuggestionsAction;
    expect(typeof action).toBe("function");

    const formData = new FormData();
    formData.set("catalogItemId", "00000000-0000-4000-8000-000000000101");
    const result = await (
      action as (
        data: FormData,
      ) => Promise<{ outcome: string; message: string }>
    )(formData);

    expect(mocks.assertCatalogCuratorAccess).toHaveBeenCalledOnce();
    expect(mocks.enqueueCatalogAliasSuggestionsRefresh).toHaveBeenCalledWith({
      catalogItemId: "00000000-0000-4000-8000-000000000101",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(result).toEqual({
      outcome: "queued",
      message: "Alias generation queued for this catalog identity.",
    });
  });

  it("approves one safe generated alias and reports collision outcomes", async () => {
    const actions = (await import("./actions")) as Record<string, unknown>;
    const action = actions.approveCatalogAliasSuggestionAction;
    expect(typeof action).toBe("function");

    const formData = new FormData();
    formData.set("aliasProjectionId", "00000000-0000-4000-8000-000000000301");
    const approved = await (
      action as (
        data: FormData,
      ) => Promise<{ outcome: string; message: string }>
    )(formData);

    expect(mocks.approveCatalogAliasSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(String) }),
      {
        aliasProjectionId: "00000000-0000-4000-8000-000000000301",
      },
    );
    expect(approved).toEqual({
      outcome: "approved",
      message: "Alias approved. Typeahead reindex was queued.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );

    mocks.approveCatalogAliasSuggestion.mockResolvedValueOnce({
      outcome: "collision",
      catalogItemNameId: null,
    });
    const collision = await (
      action as (
        data: FormData,
      ) => Promise<{ outcome: string; message: string }>
    )(formData);
    expect(collision.outcome).toBe("collision");
    expect(collision.message).toContain("another catalog identity");
  });

  it("rejects one generated alias with a bounded reason", async () => {
    const actions = (await import("./actions")) as Record<string, unknown>;
    const action = actions.rejectCatalogAliasSuggestionAction;
    expect(typeof action).toBe("function");

    const formData = new FormData();
    formData.set("aliasProjectionId", "00000000-0000-4000-8000-000000000301");
    formData.set("reasonCode", "incorrect_variant");
    const result = await (
      action as (
        data: FormData,
      ) => Promise<{ outcome: string; message: string }>
    )(formData);

    expect(mocks.rejectCatalogAliasSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(String) }),
      {
        aliasProjectionId: "00000000-0000-4000-8000-000000000301",
        reasonCode: "incorrect_variant",
      },
    );
    expect(result).toEqual({
      outcome: "rejected",
      message: "Alias rejected. It was not added to typeahead.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/garden");
  });

  it("blocks every alias operation before repository writes for a non-curator", async () => {
    mocks.assertCatalogCuratorAccess.mockImplementation(() => {
      throw new Error("Catalog curation access denied.");
    });

    const {
      approveCatalogAliasSuggestionAction,
      generateCatalogAliasSuggestionsAction,
      rejectCatalogAliasSuggestionAction,
    } = await import("./actions");
    const generateFormData = new FormData();
    generateFormData.set(
      "catalogItemId",
      "00000000-0000-4000-8000-000000000101",
    );
    const decisionFormData = new FormData();
    decisionFormData.set(
      "aliasProjectionId",
      "00000000-0000-4000-8000-000000000301",
    );
    decisionFormData.set("reasonCode", "incorrect_variant");

    await expect(
      generateCatalogAliasSuggestionsAction(generateFormData),
    ).rejects.toThrow("Catalog curation access denied.");
    await expect(
      approveCatalogAliasSuggestionAction(decisionFormData),
    ).rejects.toThrow("Catalog curation access denied.");
    await expect(
      rejectCatalogAliasSuggestionAction(decisionFormData),
    ).rejects.toThrow("Catalog curation access denied.");
    expect(mocks.enqueueCatalogAliasSuggestionsRefresh).not.toHaveBeenCalled();
    expect(mocks.approveCatalogAliasSuggestion).not.toHaveBeenCalled();
    expect(mocks.rejectCatalogAliasSuggestion).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("approves a deterministic suggestion only behind the curator gate", async () => {
    mocks.approveCatalogMatchSuggestion.mockResolvedValue({
      outcome: "approved",
      candidate: { public_slug: null },
      targetPublicSlug: "pomidor-cheri-0000000101",
      affectedObjectCount: 2,
      publicEntryPaths: ["/journal/catalog-match-entry"],
    });
    const actions = (await import("./actions")) as Record<string, unknown>;
    const action = actions.approveCatalogMatchSuggestionAction;
    expect(typeof action).toBe("function");

    const formData = new FormData();
    formData.set("suggestionId", "00000000-0000-4000-8000-000000000301");
    const result = await (
      action as (
        data: FormData,
      ) => Promise<{ outcome: string; message: string }>
    )(formData);

    expect(mocks.assertCatalogCuratorAccess).toHaveBeenCalledOnce();
    expect(mocks.approveCatalogMatchSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(String) }),
      { suggestionId: "00000000-0000-4000-8000-000000000301" },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/variety/pomidor-cheri-0000000101",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/journal/catalog-match-entry",
    );
    expect(result).toEqual({
      outcome: "approved",
      message: "Match approved for 2 affected objects.",
    });
  });

  it("returns an explicit stale outcome without garden or public revalidation", async () => {
    mocks.approveCatalogMatchSuggestion.mockResolvedValue({
      outcome: "stale",
      candidate: null,
      targetPublicSlug: null,
      affectedObjectCount: 0,
      publicEntryPaths: [],
    });

    const { approveCatalogMatchSuggestionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("suggestionId", "00000000-0000-4000-8000-000000000301");

    const result = await approveCatalogMatchSuggestionAction(formData);

    if ("documentMutationAdmission" in result) {
      throw new Error("Expected a catalog suggestion result.");
    }
    expect(result.outcome).toBe("stale");
    expect(result.message).toContain("Nothing was applied");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/garden");
  });

  it("blocks suggestion decisions before repository writes for a non-curator", async () => {
    mocks.assertCatalogCuratorAccess.mockImplementation(() => {
      throw new Error("Catalog curation access denied.");
    });

    const {
      approveCatalogMatchSuggestionAction,
      rejectCatalogMatchSuggestionAction,
    } = await import("./actions");
    const formData = new FormData();
    formData.set("suggestionId", "00000000-0000-4000-8000-000000000301");
    formData.set("reasonCode", "not_same_entity");

    await expect(approveCatalogMatchSuggestionAction(formData)).rejects.toThrow(
      "Catalog curation access denied.",
    );
    await expect(rejectCatalogMatchSuggestionAction(formData)).rejects.toThrow(
      "Catalog curation access denied.",
    );
    expect(mocks.approveCatalogMatchSuggestion).not.toHaveBeenCalled();
    expect(mocks.rejectCatalogMatchSuggestion).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a deterministic suggestion with a bounded reason and no garden revalidation", async () => {
    const actions = (await import("./actions")) as Record<string, unknown>;
    const action = actions.rejectCatalogMatchSuggestionAction;
    expect(typeof action).toBe("function");

    const formData = new FormData();
    formData.set("suggestionId", "00000000-0000-4000-8000-000000000301");
    formData.set("reasonCode", "not_same_entity");
    const result = await (
      action as (
        data: FormData,
      ) => Promise<{ outcome: string; message: string }>
    )(formData);

    expect(mocks.rejectCatalogMatchSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(String) }),
      {
        suggestionId: "00000000-0000-4000-8000-000000000301",
        reasonCode: "not_same_entity",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/catalog/curation",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/garden");
    expect(result.outcome).toBe("rejected");
    expect(result.message).toContain("journal history were unchanged");
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

  it("allows source candidate promotion for the sealed owner", async () => {
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
