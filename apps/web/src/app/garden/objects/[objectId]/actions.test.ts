import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireCurrentRequestScope: vi.fn(),
  requireCurrentUserId: vi.fn(),
  createAuthIntentControlRef: vi.fn(),
  createAuthIntentToken: vi.fn(),
  redirect: vi.fn(),
  scopedToUser: vi.fn(),
  publishJournalEntry: vi.fn(),
  convergePublicProjectionsNow: vi.fn(),
  arePublicProjectionsConverged: vi.fn(),
  revalidatePath: vi.fn(),
  admitDocumentMutation: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth-session", () => ({
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
  requireCurrentUserId: mocks.requireCurrentUserId,
}));
vi.mock("@/server/auth-intent-control", () => ({
  createAuthIntentControlRef: mocks.createAuthIntentControlRef,
}));
vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: mocks.scopedToUser,
}));
vi.mock("@/server/journal-repository", () => ({
  archiveJournalEntry: vi.fn(),
  createPlantObjectJournalEntry: vi.fn(),
  publishJournalEntry: mocks.publishJournalEntry,
  resolvePlantObjectCatalog: vi.fn(),
  updatePlantObjectLocation: vi.fn(),
}));
vi.mock("@/server/lineage-repository", () => ({
  createLineageInvitation: vi.fn(),
  createProvenanceEdge: vi.fn(),
}));
vi.mock("@/server/pilot-write-access", () => ({
  requireWriteEligibleRequestScope: vi.fn(),
}));
vi.mock("@/server/search/public-projection-outbox", () => ({
  convergePublicProjectionsNow: mocks.convergePublicProjectionsNow,
  arePublicProjectionsConverged: mocks.arePublicProjectionsConverged,
}));
vi.mock("@/server/analytics-events", () => ({
  isBackdatedEntryDate: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
  recordEntryLoggedEventSafely: vi.fn(),
}));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromFormData: (formData: FormData) =>
    formData.get("__overgardenDocumentGeneration"),
}));

import { publishJournalEntryAction } from "./actions";

const ENTRY_ID = "00000000-0000-4000-8000-000000000301";
const OBJECT_ID = "00000000-0000-4000-8000-000000000201";
const USER_ID = "00000000-0000-4000-8000-000000000101";

describe("publishJournalEntryAction document admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthIntentControlRef.mockReturnValue("publish-opaque-ref");
    mocks.createAuthIntentToken.mockReturnValue("opaque-publish-intent");
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    mocks.convergePublicProjectionsNow.mockResolvedValue(undefined);
    mocks.arePublicProjectionsConverged.mockResolvedValue(true);
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: { userId: USER_ID, sessionId: "session-1" },
      envelopeExpiresAtSeconds: 1_786_381_200,
    });
  });

  it("returns the closed authentication result without reading private form fields", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "SIGNED_OUT",
      transportResult: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
    const formData = publishFormData();

    await expect(publishJournalEntryAction(formData)).resolves.toEqual({
      documentMutationAdmission: "AUTHENTICATION_REQUIRED",
    });
    expect(JSON.stringify(mocks.admitDocumentMutation.mock.calls)).not.toMatch(
      new RegExp(`${ENTRY_ID}|private journal text`, "i"),
    );
    expect(mocks.publishJournalEntry).not.toHaveBeenCalled();
  });

  it("keeps an unavailable boundary distinct from authentication", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "MUTATION_ADMISSION_UNAVAILABLE",
      transportResult: "MUTATION_ADMISSION_UNAVAILABLE",
      statusCode: 503,
    });

    await expect(publishJournalEntryAction(publishFormData())).resolves.toEqual(
      { documentMutationAdmission: "MUTATION_ADMISSION_UNAVAILABLE" },
    );

    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("publishes normally when the session is valid", async () => {
    mocks.publishJournalEntry.mockResolvedValueOnce({
      entry: { id: ENTRY_ID },
      publicUrl: "/journal/first-flowers",
    });

    await publishJournalEntryAction(publishFormData());

    expect(mocks.publishJournalEntry).toHaveBeenCalledWith(
      { userId: USER_ID, sessionId: "session-1" },
      { entryId: ENTRY_ID, disclosureAccepted: true },
    );
    // OVE-242: the projection intent committed with the publish itself; the
    // action only asks for immediate convergence.
    expect(mocks.convergePublicProjectionsNow).toHaveBeenCalledWith([ENTRY_ID]);
    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
  });
});

function publishFormData() {
  const formData = new FormData();
  formData.set("entryId", ENTRY_ID);
  formData.set("objectId", OBJECT_ID);
  formData.set("publicationDisclosureAccepted", "on");
  return formData;
}
