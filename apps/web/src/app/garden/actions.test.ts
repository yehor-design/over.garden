import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  requireWriteEligibleRequestScope: vi.fn(),
  scheduleLearningAttributionDrain: vi.fn(),
  createSpaceJournalEntry: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
  recordEntryLoggedEventSafely: vi.fn(),
  isBackdatedEntryDate: vi.fn(),
  admitDocumentMutation: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/server/pilot-write-access", () => ({
  requireWriteEligibleRequestScope: mocks.requireWriteEligibleRequestScope,
}));

vi.mock("@/server/mvp-learning/attribution-after-response", () => ({
  scheduleLearningAttributionDrain: mocks.scheduleLearningAttributionDrain,
}));

vi.mock("@/server/journal-repository", () => ({
  createSpaceJournalEntry: mocks.createSpaceJournalEntry,
}));

vi.mock("@/server/analytics-events", () => ({
  isBackdatedEntryDate: mocks.isBackdatedEntryDate,
  recordAnalyticsEventSafely: mocks.recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely: mocks.recordEntryLoggedEventSafely,
}));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromFormData: (formData: FormData) =>
    formData.get("__overgardenDocumentGeneration"),
}));

describe("garden entry actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWriteEligibleRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.isBackdatedEntryDate.mockReturnValue(false);
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      envelopeExpiresAtSeconds: 1_786_381_200,
    });
    mocks.createSpaceJournalEntry.mockResolvedValue({
      space: {
        id: "space-1",
        display_name: "Balcony",
        location_visibility: "hidden",
        coarse_region_code: null,
      },
      entry: {
        id: "entry-1",
        title: "Checked the balcony",
        body: "Watered the selected plants.",
        entry_date: "2026-07-04",
        entry_scope: "space",
      },
      mentionedObjects: [{ id: "object-1" }],
      isNewEntry: true,
    });
  });

  it("returns the closed result and performs zero effect on owner change", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "OWNER_TRANSITION_CONFIRMED",
      transportResult: "DOCUMENT_OWNER_CHANGED",
      statusCode: 409,
    });
    const { createSpaceJournalEntryAction } = await import("./actions");

    await expect(
      createSpaceJournalEntryAction(new FormData()),
    ).resolves.toEqual({
      documentMutationAdmission: "DOCUMENT_OWNER_CHANGED",
    });
    expect(mocks.createSpaceJournalEntry).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects a saved space entry to the local progress moment", async () => {
    const { createSpaceJournalEntryAction } = await import("./actions");
    const formData = new FormData();
    formData.set("spaceId", "space-1");
    formData.set("mentionedPlantObjectIds", "object-1");
    formData.set("title", "Checked the balcony");
    formData.set("body", "Watered the selected plants.");
    formData.set("entryDate", "2026-07-04");
    formData.set("clientMutationId", "entry-1");
    formData.set("topicTags", "watering, balcony");

    await createSpaceJournalEntryAction(formData);

    expect(mocks.createSpaceJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topicTags: "watering, balcony" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/garden");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/objects/object-1",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/garden?saveProgress=space-entry",
    );
    expect(mocks.scheduleLearningAttributionDrain).toHaveBeenCalledWith(
      expect.any(Function),
    );
    expect(
      JSON.stringify(mocks.recordAnalyticsEventSafely.mock.calls),
    ).not.toMatch(
      /Watered the selected plants|email|phone|ip_address|user_agent|media_key|coordinate|latitude|longitude/i,
    );
  });
});
