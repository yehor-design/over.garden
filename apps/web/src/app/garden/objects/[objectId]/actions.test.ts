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
  enqueueJournalEntryIndexJob: vi.fn(),
  enqueueJournalEntryUnindexJob: vi.fn(),
  revalidatePath: vi.fn(),
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
vi.mock("@/server/search/public-journal-parity", () => ({
  enqueueJournalEntryIndexJob: mocks.enqueueJournalEntryIndexJob,
  enqueueJournalEntryUnindexJob: mocks.enqueueJournalEntryUnindexJob,
}));
vi.mock("@/server/analytics-events", () => ({
  isBackdatedEntryDate: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
  recordEntryLoggedEventSafely: vi.fn(),
}));

import { publishJournalEntryAction } from "./actions";

const ENTRY_ID = "00000000-0000-4000-8000-000000000301";
const OBJECT_ID = "00000000-0000-4000-8000-000000000201";
const USER_ID = "00000000-0000-4000-8000-000000000101";

describe("publishJournalEntryAction authentication intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthIntentControlRef.mockReturnValue("publish-opaque-ref");
    mocks.createAuthIntentToken.mockReturnValue("opaque-publish-intent");
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it("redirects an expired session through an opaque intent for the exact publish control", async () => {
    mocks.requireCurrentUserId.mockRejectedValueOnce(
      new mocks.AuthenticationRequiredError(),
    );
    const formData = publishFormData();

    await expect(publishJournalEntryAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/auth/intent?intent=opaque-publish-intent",
    );

    expect(mocks.createAuthIntentControlRef).toHaveBeenCalledWith(
      "publish",
      ENTRY_ID,
    );
    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
      action: "publish",
      returnTo: `/garden/objects/${OBJECT_ID}`,
      control: "publish-opaque-ref",
    });
    expect(JSON.stringify(mocks.createAuthIntentToken.mock.calls)).not.toMatch(
      new RegExp(`${ENTRY_ID}|private journal text`, "i"),
    );
    expect(mocks.publishJournalEntry).not.toHaveBeenCalled();
  });

  it("does not misclassify an operational session failure as sign-in required", async () => {
    mocks.requireCurrentUserId.mockRejectedValueOnce(
      new Error("session storage unavailable"),
    );

    await expect(publishJournalEntryAction(publishFormData())).rejects.toThrow(
      "session storage unavailable",
    );

    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("publishes normally when the session is valid", async () => {
    mocks.requireCurrentUserId.mockResolvedValueOnce(USER_ID);
    mocks.scopedToUser.mockReturnValueOnce({ userId: USER_ID });
    mocks.publishJournalEntry.mockResolvedValueOnce({
      entry: { id: ENTRY_ID },
      publicUrl: "/journal/first-flowers",
    });

    await publishJournalEntryAction(publishFormData());

    expect(mocks.publishJournalEntry).toHaveBeenCalledWith(
      { userId: USER_ID },
      { entryId: ENTRY_ID, disclosureAccepted: true },
    );
    expect(mocks.enqueueJournalEntryIndexJob).toHaveBeenCalledWith({
      journalEntryId: ENTRY_ID,
      userId: USER_ID,
    });
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
