import { beforeEach, describe, expect, it, vi } from "vitest";

import { JOURNAL_ENTRY_PAYLOAD_MAX_BYTES } from "@/lib/garden/entry-contracts";

const mocks = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
  updateJournalEntryAggregate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromRequest: () => "signed-generation",
  documentMutationAdmissionResponse: () =>
    Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }),
}));
vi.mock("@/server/journal-repository", () => ({
  JournalAggregateConflictError: class JournalAggregateConflictError extends Error {},
  updateJournalEntryAggregate: mocks.updateJournalEntryAggregate,
}));
vi.mock("@/server/mvp-learning/composer-signals", () => ({
  recordComposerLearningSignalsSafely: vi.fn(),
}));
vi.mock("@/server/mvp-learning/attribution-after-response", () => ({
  scheduleLearningAttributionDrain: vi.fn(),
}));
vi.mock("@/server/search/public-projection-outbox", () => ({
  convergePublicProjectionsNow: vi.fn(),
}));

describe("PATCH /api/garden/entries/[entryId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: { userId: "00000000-0000-4000-8000-000000000001" },
    });
  });

  it("enforces the shared publication payload budget before repository access", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://local.test/api/garden/entries/entry-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "x".repeat(JOURNAL_ENTRY_PAYLOAD_MAX_BYTES),
        }),
      }),
      { params: Promise.resolve({ entryId: "entry-1" }) },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_ENTRY_TOO_LARGE",
    });
    expect(mocks.updateJournalEntryAggregate).not.toHaveBeenCalled();
  });
});
