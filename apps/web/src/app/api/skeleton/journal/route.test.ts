import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  PilotWriteAccessError: class PilotWriteAccessError extends Error {},
  createJournalEntry: vi.fn(),
  enqueueJob: vi.fn(),
  listMyRecentJournalEntries: vi.fn(),
  requireCurrentUserId: vi.fn(),
  requireWriteEligibleRequestScope: vi.fn(),
  tryResolveWalkingSkeletonEnvironment: vi.fn(),
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
vi.mock("@/server/pilot-write-access", () => ({
  PilotWriteAccessError: mocks.PilotWriteAccessError,
  requireWriteEligibleRequestScope: mocks.requireWriteEligibleRequestScope,
}));
vi.mock("@/server/journal-repository", () => ({
  createJournalEntry: mocks.createJournalEntry,
  listMyRecentJournalEntries: mocks.listMyRecentJournalEntries,
}));
vi.mock("@/server/queue", () => ({ enqueueJob: mocks.enqueueJob }));

import { GET, POST } from "./route";

const scope = { userId: "user-1", sessionId: "session-1" };
const entry = {
  id: "entry-1",
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
    mocks.requireWriteEligibleRequestScope.mockResolvedValue(scope);
    mocks.listMyRecentJournalEntries.mockResolvedValue([entry]);
    mocks.createJournalEntry.mockResolvedValue(entry);
    mocks.enqueueJob.mockResolvedValue("job-1");
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
    expect(mocks.requireWriteEligibleRequestScope).not.toHaveBeenCalled();
    expect(mocks.listMyRecentJournalEntries).not.toHaveBeenCalled();
    expect(mocks.createJournalEntry).not.toHaveBeenCalled();
  });

  it("hard-404s unless both the URL host and raw Host header are loopback", async () => {
    const getResponse = await GET(
      getRequest("localhost:3000", "developer-tunnel.example.test"),
    );
    const postResponse = await POST(
      new Request("https://developer-tunnel.example.test/api/skeleton/journal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "localhost:3000",
        },
        body: JSON.stringify({ body: "Entry" }),
      }),
    );

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(mocks.requireCurrentUserId).not.toHaveBeenCalled();
    expect(mocks.requireWriteEligibleRequestScope).not.toHaveBeenCalled();
  });

  it("returns fixed signed-out 401 responses without reading the POST body", async () => {
    mocks.requireCurrentUserId.mockRejectedValueOnce(
      new mocks.AuthenticationRequiredError("private auth detail"),
    );
    mocks.requireWriteEligibleRequestScope.mockRejectedValueOnce(
      new mocks.AuthenticationRequiredError("private cookie detail"),
    );

    const getResponse = await GET(getRequest());
    const postResponse = await POST(request("not-json", "text/plain"));
    const getBody = await getResponse.json();
    const postBody = await postResponse.json();

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    expect(getBody).toEqual({ error: "Sign in to continue." });
    expect(postBody).toEqual({ error: "Sign in to continue." });
    expect(JSON.stringify([getBody, postBody])).not.toContain("private");
    expect(mocks.createJournalEntry).not.toHaveBeenCalled();
  });

  it("returns fixed 403 for an authenticated but ineligible account", async () => {
    mocks.requireWriteEligibleRequestScope.mockRejectedValueOnce(
      new mocks.PilotWriteAccessError("private invite detail"),
    );

    const response = await POST(jsonRequest({ body: "Entry" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "This account cannot use this local diagnostic.",
    });
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
    ["invalid visibility", jsonRequest({ body: "Entry", visibility: "friends" })],
    ["invalid mutation id", jsonRequest({ body: "Entry", clientMutationId: "" })],
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
    mocks.requireWriteEligibleRequestScope.mockRejectedValueOnce(
      new Error("private session-store outage"),
    );

    const response = await POST(jsonRequest({ body: "Entry" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "The request could not be completed." });
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

  it("creates a private entry without queueing public-index work", async () => {
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
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ entry, queuedJobId: null });
  });

  it("queues idempotent indexing only for a public entry", async () => {
    const publicEntry = { ...entry, visibility: "public" };
    mocks.createJournalEntry.mockResolvedValueOnce(publicEntry);

    const response = await POST(
      jsonRequest({ body: "Public entry", visibility: "public" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      "matching",
      {
        kind: "journal_entry_index",
        journalEntryId: publicEntry.id,
        userId: scope.userId,
      },
      { idempotencyKey: `journal_entry_index:${publicEntry.id}` },
    );
    expect(await response.json()).toEqual({
      entry: publicEntry,
      queuedJobId: "job-1",
    });
  });

  it("returns an opaque 500 when queueing fails", async () => {
    mocks.createJournalEntry.mockResolvedValueOnce({
      ...entry,
      visibility: "public",
    });
    mocks.enqueueJob.mockRejectedValueOnce(new Error("private queue detail"));

    const response = await POST(
      jsonRequest({ body: "Public entry", visibility: "public" }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "The request could not be completed." });
    expect(JSON.stringify(body)).not.toContain("queue detail");
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

function getRequest(
  urlHost = "localhost:3000",
  rawHost = "localhost:3000",
) {
  return new Request(`http://${urlHost}/api/skeleton/journal`, {
    headers: { host: rawHost },
  });
}
