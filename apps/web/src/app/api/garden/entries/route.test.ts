import { beforeEach, describe, expect, it, vi } from "vitest";

import { JOURNAL_ENTRY_PAYLOAD_MAX_BYTES } from "@/lib/garden/entry-contracts";
import {
  ONLINE_JOURNAL_PROTOCOL,
  ONLINE_JOURNAL_PROTOCOL_HEADER,
} from "@/lib/garden/entry-contracts";

const mocks = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireCurrentRequestScope: vi.fn(),
  revalidatePath: vi.fn(),
  scheduleLearningAttributionDrain: vi.fn(),
  createFirstPlantEntry: vi.fn(),
  createPlantObjectJournalEntry: vi.fn(),
  findJournalEntryReceiptByClientMutationId: vi.fn(),
  recordAnalyticsEventSafely: vi.fn(),
  recordEntryLoggedEventSafely: vi.fn(),
  isBackdatedEntryDate: vi.fn(),
  createAuthIntentToken: vi.fn(),
  admitDocumentMutation: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/mvp-learning/attribution-after-response", () => ({
  scheduleLearningAttributionDrain: mocks.scheduleLearningAttributionDrain,
}));

vi.mock("@/server/journal-repository", () => ({
  createFirstPlantEntry: mocks.createFirstPlantEntry,
  createPlantObjectJournalEntry: mocks.createPlantObjectJournalEntry,
  findJournalEntryReceiptByClientMutationId:
    mocks.findJournalEntryReceiptByClientMutationId,
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
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
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

  it("refuses an authenticated legacy client before reading its private payload", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest(
        {
          target: "first_plant_entry",
          title: "Private legacy title",
          body: "Private legacy body",
          clientMutationId: "legacy-online-marked-row",
          syncStatus: "online",
        },
        {},
        false,
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "legacy_client_retired",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createFirstPlantEntry).not.toHaveBeenCalled();
    expect(mocks.createPlantObjectJournalEntry).not.toHaveBeenCalled();
  });

  it("redundantly refuses offline-synced replay even with the current protocol marker", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({
        target: "first_plant_entry",
        title: "Retired replay",
        body: "Must not create a server effect.",
        clientMutationId: "legacy-offline-synced-row",
        syncStatus: "offline_synced",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "legacy_client_retired",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createFirstPlantEntry).not.toHaveBeenCalled();
    expect(mocks.createPlantObjectJournalEntry).not.toHaveBeenCalled();
  });

  it("enforces the shared publication payload budget before repository access", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://local.test/api/garden/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [ONLINE_JOURNAL_PROTOCOL_HEADER]: ONLINE_JOURNAL_PROTOCOL,
        },
        body: JSON.stringify({
          target: "first_plant_entry",
          title: "x".repeat(JOURNAL_ENTRY_PAYLOAD_MAX_BYTES),
        }),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "JOURNAL_ENTRY_TOO_LARGE",
    });
    expect(mocks.createFirstPlantEntry).not.toHaveBeenCalled();
    expect(mocks.createPlantObjectJournalEntry).not.toHaveBeenCalled();
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

  it("returns a payload-free owner-scoped receipt for retirement verification", async () => {
    mocks.findJournalEntryReceiptByClientMutationId.mockResolvedValue({
      id: "entry-receipt-1",
      clientMutationId: "legacy-mutation-1",
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://local.test/api/garden/entries?clientMutationId=legacy-mutation-1",
      ),
    );

    expect(response.status).toBe(200);
    const receipt = await response.json();
    expect(receipt).toEqual({
      entry: {
        id: "entry-receipt-1",
        clientMutationId: "legacy-mutation-1",
      },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      mocks.findJournalEntryReceiptByClientMutationId,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000001",
      }),
      "legacy-mutation-1",
    );
    expect(JSON.stringify(receipt).toLowerCase()).not.toMatch(
      /title|body|content|email|location|media/,
    );
  });
});

function jsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
  includeOnlineProtocol = true,
) {
  return new Request("http://local.test/api/garden/entries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeOnlineProtocol
        ? { [ONLINE_JOURNAL_PROTOCOL_HEADER]: ONLINE_JOURNAL_PROTOCOL }
        : {}),
      ...headers,
    },
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
