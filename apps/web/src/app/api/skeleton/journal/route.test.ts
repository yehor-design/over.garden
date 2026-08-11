import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  createJournalEntry: vi.fn(),
  convergePublicProjectionsNow: vi.fn(),
  listMyRecentJournalEntries: vi.fn(),
  requireCurrentUserId: vi.fn(),
  scheduleLearningAttributionDrain: vi.fn(),
  tryResolveWalkingSkeletonEnvironment: vi.fn(),
  admitDocumentMutation: vi.fn(),
  documentMutationAdmissionResponse: vi.fn(),
}));

vi.mock("@/lib/walking-skeleton/environment", () => ({
  isWalkingSkeletonRequestHostAllowed: (value: string | null) =>
    value?.startsWith("http://localhost:") ||
    value?.startsWith("localhost:") ||
    false,
  tryResolveWalkingSkeletonEnvironment:
    mocks.tryResolveWalkingSkeletonEnvironment,
}));
vi.mock("@/server/auth-session", () => ({
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
  requireCurrentUserId: mocks.requireCurrentUserId,
}));
vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: mocks.admitDocumentMutation,
  documentMutationAdmissionResponse: mocks.documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest: vi.fn(() => null),
}));
vi.mock("@/server/journal-repository", () => ({
  createJournalEntry: mocks.createJournalEntry,
  listMyRecentJournalEntries: mocks.listMyRecentJournalEntries,
}));
vi.mock("@/server/search/public-projection-outbox", () => ({
  convergePublicProjectionsNow: mocks.convergePublicProjectionsNow,
}));
vi.mock("@/server/mvp-learning/attribution-after-response", () => ({
  scheduleLearningAttributionDrain: mocks.scheduleLearningAttributionDrain,
}));

import { GET, POST } from "./route";

const scope = {
  userId: "00000000-0000-4000-8000-000000000101",
  sessionId: "session-1",
};
const entry = {
  id: "00000000-0000-4000-8000-000000000201",
  body: "Local diagnostic entry",
  visibility: "private",
};

describe("walking-skeleton journal API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryResolveWalkingSkeletonEnvironment.mockReturnValue({
      target: "local",
    });
    mocks.requireCurrentUserId.mockResolvedValue(scope.userId);
    mocks.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope,
    });
    mocks.documentMutationAdmissionResponse.mockImplementation((admission) =>
      Response.json(
        { code: admission.transportResult },
        { status: admission.statusCode },
      ),
    );
    mocks.listMyRecentJournalEntries.mockResolvedValue([entry]);
    mocks.createJournalEntry.mockResolvedValue(entry);
    mocks.convergePublicProjectionsNow.mockResolvedValue(undefined);
  });

  it("hard-404s GET and POST before auth, body, or repository access", async () => {
    mocks.tryResolveWalkingSkeletonEnvironment.mockReturnValue(null);

    const getResponse = await GET(getRequest());
    const postResponse = await POST(request("not-json", "text/plain"));

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(await getResponse.text()).toBe("");
    expect(await postResponse.text()).toBe("");
    expect(mocks.requireCurrentUserId).not.toHaveBeenCalled();
    expect(mocks.listMyRecentJournalEntries).not.toHaveBeenCalled();
    expect(mocks.createJournalEntry).not.toHaveBeenCalled();
  });

  it("hard-404s unless both the URL host and raw Host header are loopback", async () => {
    const getResponse = await GET(
      getRequest("localhost:3000", "developer-tunnel.example.test"),
    );
    const postResponse = await POST(
      new Request(
        "https://developer-tunnel.example.test/api/skeleton/journal",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            host: "localhost:3000",
          },
          body: JSON.stringify({ body: "Entry" }),
        },
      ),
    );

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(mocks.requireCurrentUserId).not.toHaveBeenCalled();
  });

  it("returns fixed signed-out 401 responses without reading the POST body", async () => {
    mocks.requireCurrentUserId.mockRejectedValueOnce(
      new mocks.AuthenticationRequiredError("private auth detail"),
    );
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      transportResult: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });

    const getResponse = await GET(getRequest());
    const postResponse = await POST(request("not-json", "text/plain"));
    const getBody = await getResponse.json();
    const postBody = await postResponse.json();

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    expect(getBody).toEqual({ error: "Sign in to continue." });
    expect(postBody).toEqual({ code: "AUTHENTICATION_REQUIRED" });
    expect(JSON.stringify([getBody, postBody])).not.toContain("private");
    expect(mocks.createJournalEntry).not.toHaveBeenCalled();
  });

  it("fails closed when admission cannot attach write eligibility", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      transportResult: "MUTATION_ADMISSION_UNAVAILABLE",
      statusCode: 503,
    });

    const response = await POST(jsonRequest({ body: "Entry" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ code: "MUTATION_ADMISSION_UNAVAILABLE" });
    expect(JSON.stringify(body)).not.toContain("invite");
    expect(mocks.createJournalEntry).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", request("{", "application/json")],
    ["non-JSON content type", request('{"body":"Entry"}', "text/plain")],
    ["null", jsonRequest(null)],
    ["array", jsonRequest([])],
    ["missing body", jsonRequest({ visibility: "private" })],
    ["empty body", jsonRequest({ body: "  " })],
    [
      "invalid visibility",
      jsonRequest({ body: "Entry", visibility: "friends" }),
    ],
    [
      "invalid mutation id",
      jsonRequest({ body: "Entry", clientMutationId: "" }),
    ],
    ["unknown field", jsonRequest({ body: "Entry", userId: "another-user" })],
  ])("returns fixed 400 for %s", async (_label, invalidRequest) => {
    const response = await POST(invalidRequest);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "A valid journal entry payload is required.",
    });
    expect(mocks.createJournalEntry).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed body without relying on Content-Length", async () => {
    const response = await POST(
      request(
        JSON.stringify({ body: "x".repeat(20 * 1024) }),
        "application/json",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "A valid journal entry payload is required.",
    });
    expect(mocks.createJournalEntry).not.toHaveBeenCalled();
  });

  it("does not misclassify or expose unexpected auth failures", async () => {
    mocks.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      transportResult: "MUTATION_ADMISSION_UNAVAILABLE",
      statusCode: 503,
    });

    const response = await POST(jsonRequest({ body: "Entry" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ code: "MUTATION_ADMISSION_UNAVAILABLE" });
    expect(JSON.stringify(body)).not.toContain("session-store");
  });

  it("returns an opaque 500 for repository failures", async () => {
    mocks.listMyRecentJournalEntries.mockRejectedValueOnce(
      new Error("private database host detail"),
    );
    mocks.createJournalEntry.mockRejectedValueOnce(
      new Error("private constraint detail"),
    );

    const getResponse = await GET(getRequest());
    const postResponse = await POST(jsonRequest({ body: "Entry" }));
    const bodies = [await getResponse.json(), await postResponse.json()];

    expect(getResponse.status).toBe(500);
    expect(postResponse.status).toBe(500);
    expect(bodies).toEqual([
      { error: "The request could not be completed." },
      { error: "The request could not be completed." },
    ]);
    expect(JSON.stringify(bodies)).not.toContain("private");
  });

  it("creates a private entry without touching the public projection", async () => {
    const response = await POST(
      jsonRequest({
        body: "  Local diagnostic entry  ",
        visibility: "private",
        clientMutationId: " mutation-1 ",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(mocks.createJournalEntry).toHaveBeenCalledWith(scope, {
      body: "Local diagnostic entry",
      visibility: "private",
      clientMutationId: "mutation-1",
    });
    expect(mocks.convergePublicProjectionsNow).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ entry });
  });

  it("converges the durable public projection only for a public entry", async () => {
    const publicEntry = { ...entry, visibility: "public" };
    mocks.createJournalEntry.mockResolvedValueOnce(publicEntry);

    const response = await POST(
      jsonRequest({ body: "Public entry", visibility: "public" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.convergePublicProjectionsNow).toHaveBeenCalledWith([
      publicEntry.id,
    ]);
    expect(await response.json()).toEqual({ entry: publicEntry });
  });

  it("still succeeds when immediate convergence fails, because the intent is durable", async () => {
    const publicEntry = { ...entry, visibility: "public" };
    mocks.createJournalEntry.mockResolvedValueOnce(publicEntry);
    mocks.convergePublicProjectionsNow.mockRejectedValueOnce(
      new Error("private search detail"),
    );

    const response = await POST(
      jsonRequest({ body: "Public entry", visibility: "public" }),
    );
    const body = await response.json();

    // OVE-242: the canonical write and its projection intent already committed
    // together. A search outage delays convergence; it must not turn a
    // committed entry into an error, and it must not leak a dependency detail.
    expect(response.status).toBe(200);
    expect(body).toEqual({ entry: publicEntry });
    expect(JSON.stringify(body)).not.toContain("search detail");
  });
});

function jsonRequest(body: unknown) {
  return request(JSON.stringify(body), "application/json");
}

function request(body: string, contentType: string) {
  return new Request("http://localhost:3000/api/skeleton/journal", {
    method: "POST",
    headers: { "content-type": contentType, host: "localhost:3000" },
    body,
  });
}

function getRequest(urlHost = "localhost:3000", rawHost = "localhost:3000") {
  return new Request(`http://${urlHost}/api/skeleton/journal`, {
    headers: { host: rawHost },
  });
}
