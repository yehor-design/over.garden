import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  revalidatePath: vi.fn(),
  requireWriteEligibleRequestScope: vi.fn(),
  scheduleLearningAttributionDrain: vi.fn(),
  createFirstPlantEntry: vi.fn(),
  createPlantObjectJournalEntry: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
  recordEntryLoggedEventSafely: vi.fn(),
  isBackdatedEntryDate: vi.fn(),
  createAuthIntentToken: vi.fn(),
  admitDocumentMutation: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/pilot-write-access", () => ({
  PilotWriteAccessError: class PilotWriteAccessError extends Error {},
  requireWriteEligibleRequestScope: mocks.requireWriteEligibleRequestScope,
}));

vi.mock("@/server/mvp-learning/attribution-after-response", () => ({
  scheduleLearningAttributionDrain: mocks.scheduleLearningAttributionDrain,
}));

vi.mock("@/server/journal-repository", () => ({
  createFirstPlantEntry: mocks.createFirstPlantEntry,
  createPlantObjectJournalEntry: mocks.createPlantObjectJournalEntry,
}));

vi.mock("@/server/analytics-events", () => ({
  isBackdatedEntryDate: mocks.isBackdatedEntryDate,
  recordAnalyticsEventSafely: mocks.recordAnalyticsEventSafely,
  recordEntryLoggedEventSafely: mocks.recordEntryLoggedEventSafely,
}));

vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));

vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationGenerationFromRequest: (request: Request) =>
    request.headers.get("x-overgarden-document-generation"),
  documentMutationAdmissionResponse: (admission: {
    transportResult: string;
    statusCode: number;
  }) =>
    Response.json(
      { code: admission.transportResult },
      {
        status: admission.statusCode,
        headers: { "Cache-Control": "private, no-store" },
      },
    ),
}));

describe("POST /api/garden/entries save progress readback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWriteEligibleRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    mocks.isBackdatedEntryDate.mockReturnValue(false);
    mocks.createAuthIntentToken.mockReturnValue("opaque-save-intent");
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      internalResult: "MATCH",
      transportResult: "MATCH",
      envelopeExpiresAtSeconds: 1_786_381_200,
      scope: {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
    });
  });

  it("returns only the closed authentication class before parsing the draft", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "SIGNED_OUT",
      transportResult: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({
        target: "first_plant_entry",
        title: "Private title",
        body: "Private draft body",
        preciseLocation: "42.0,23.0",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ code: "AUTHENTICATION_REQUIRED" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(mocks.admitDocumentMutation.mock.calls)).not.toMatch(
      /Private title|Private draft|42\.0/i,
    );
    expect(mocks.createFirstPlantEntry).not.toHaveBeenCalled();
  });

  it("rejects an owner transition without parsing or serializing draft text", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "OWNER_TRANSITION_CONFIRMED",
      transportResult: "DOCUMENT_OWNER_CHANGED",
      statusCode: 409,
    });
    const objectId = "00000000-0000-4000-8000-000000000901";
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest(
        {
          target: "plant_object_entry",
          plantObjectId: objectId,
          body: "Private follow-up draft",
        },
        { "x-overgarden-auth-return": `/garden/objects/${objectId}` },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "DOCUMENT_OWNER_CHANGED",
    });
    expect(
      JSON.stringify(mocks.admitDocumentMutation.mock.calls),
    ).not.toContain("Private follow-up draft");
  });

  it("maps operational auth infrastructure failure to unavailable", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      internalResult: "MUTATION_ADMISSION_UNAVAILABLE",
      transportResult: "MUTATION_ADMISSION_UNAVAILABLE",
      statusCode: 503,
    });
    const { POST } = await import("./route");

    const response = await POST(jsonRequest({ target: "first_plant_entry" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "MUTATION_ADMISSION_UNAVAILABLE",
    });
  });

  it("returns a first-save progress readback URL and safe aggregate events", async () => {
    mocks.createFirstPlantEntry.mockResolvedValue(
      entryResult({
        entryId: "entry-1",
        entryScope: "object",
        priorObjectEntryCount: 0,
        title: "First flowers",
        body: "Two new flower clusters.",
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        target: "first_plant_entry",
        spaceId: "00000000-0000-4000-8000-000000000301",
        spaceName: "Balcony",
        plantName: "Cherry tomato",
        title: "First flowers",
        body: "Two new flower clusters.",
        entryDate: "2026-07-04",
        clientMutationId: "entry-1",
        topicTags: ["watering", "seedlings"],
      }),
    );
    const body = await response.json();

    expect(body.readbackUrl).toBe(
      "/garden/objects/object-1?saveProgress=first-entry",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/garden/objects/object-1",
    );
    expect(mocks.createFirstPlantEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        spaceId: "00000000-0000-4000-8000-000000000301",
        topicTags: ["watering", "seedlings"],
      }),
    );
    const deferred = mocks.scheduleLearningAttributionDrain.mock.calls[0]?.[0];
    expect(deferred).toEqual(expect.any(Function));
    await deferred?.();
    expect(mocks.recordAnalyticsEventSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventName: "progress_screen_shown" }),
    );
    expect(
      JSON.stringify(mocks.recordAnalyticsEventSafely.mock.calls),
    ).not.toMatch(
      /Two new flower clusters|email|phone|ip_address|user_agent|media_key|quarantine|derivative|coordinate|latitude|longitude/i,
    );
  });

  it("returns a follow-up progress readback URL while preserving value-pulse eligibility", async () => {
    mocks.createPlantObjectJournalEntry.mockResolvedValue(
      entryResult({
        entryId: "entry-2",
        entryScope: "object",
        priorObjectEntryCount: 1,
        title: "Second flowering wave",
        body: "The same plant has stronger new leaves.",
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        target: "plant_object_entry",
        plantObjectId: "object-1",
        title: "Second flowering wave",
        body: "The same plant has stronger new leaves.",
        entryDate: "2026-07-05",
        clientMutationId: "entry-2",
        topicTags: ["flowering"],
      }),
    );
    const body = await response.json();

    expect(body.readbackUrl).toBe(
      "/garden/objects/object-1?saveProgress=follow-up",
    );
    expect(body.followUpValuePulse).toEqual({ journalEntryId: "entry-2" });
    expect(mocks.createPlantObjectJournalEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topicTags: ["flowering"] }),
    );
    expect(
      JSON.stringify(mocks.recordAnalyticsEventSafely.mock.calls),
    ).not.toMatch(
      /Second flowering wave|stronger new leaves|email|phone|ip_address|user_agent|media_key|coordinate|latitude|longitude/i,
    );
    const deferred = mocks.scheduleLearningAttributionDrain.mock.calls[0]?.[0];
    expect(deferred).toEqual(expect.any(Function));
  });
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://local.test/api/garden/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function entryResult(input: {
  entryId: string;
  entryScope: "object" | "space";
  priorObjectEntryCount: number;
  title: string;
  body: string;
}) {
  return {
    space: {
      id: "space-1",
      display_name: "Balcony",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    plantObject: {
      id: "object-1",
      display_name: "Cherry tomato",
      object_kind: "plant",
      catalog_item_id: null,
      variety_text: "Cherry tomato",
      variety_state: "selected",
      location_visibility: "hidden",
      coarse_region_code: null,
    },
    entry: {
      id: input.entryId,
      title: input.title,
      body: input.body,
      entry_date: "2026-07-04",
      entry_scope: input.entryScope,
      client_mutation_id: input.entryId,
    },
    isNewEntry: true,
    mediaAttached: false,
    priorObjectEntryCount: input.priorObjectEntryCount,
  };
}
