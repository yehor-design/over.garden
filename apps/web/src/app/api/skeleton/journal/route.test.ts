import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  listMyRecentJournalEntries: vi.fn(),
  requireCurrentUserId: vi.fn(),
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
vi.mock("@/server/journal-repository", () => ({
  listMyRecentJournalEntries: mocks.listMyRecentJournalEntries,
}));

import { GET, POST } from "./route";

describe("walking-skeleton journal API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryResolveWalkingSkeletonEnvironment.mockReturnValue({
      target: "local",
    });
    mocks.requireCurrentUserId.mockResolvedValue(
      "00000000-0000-4000-8000-000000000101",
    );
    mocks.listMyRecentJournalEntries.mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000201", visibility: "public" },
    ]);
  });

  it("hard-404s GET and POST outside the local walking-skeleton boundary", async () => {
    mocks.tryResolveWalkingSkeletonEnvironment.mockReturnValue(null);

    const getResponse = await GET(getRequest());
    const postResponse = await POST(postRequest("not-json", "text/plain"));

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(await getResponse.text()).toBe("");
    expect(await postResponse.text()).toBe("");
    expect(mocks.requireCurrentUserId).not.toHaveBeenCalled();
    expect(mocks.listMyRecentJournalEntries).not.toHaveBeenCalled();
  });

  it("hard-404s unless both URL and raw Host are loopback", async () => {
    const response = await POST(
      new Request("https://developer-tunnel.example.test/api/skeleton/journal", {
        method: "POST",
        headers: { host: "localhost:3000" },
        body: "not-json",
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.requireCurrentUserId).not.toHaveBeenCalled();
  });

  it("keeps the authenticated read-only diagnostic list", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entries: [
        { id: "00000000-0000-4000-8000-000000000201", visibility: "public" },
      ],
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("keeps signed-out GET failures opaque", async () => {
    mocks.requireCurrentUserId.mockRejectedValue(
      new mocks.AuthenticationRequiredError("private auth detail"),
    );

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to continue." });
  });

  it("retires every legacy POST shape with one terminal no-write response", async () => {
    const responses = await Promise.all([
      POST(postRequest("not-json", "text/plain")),
      POST(postRequest("{", "application/json")),
      POST(
        postRequest(
          JSON.stringify({ visibility: "private" }),
          "application/json",
        ),
      ),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({
        code: "atomic_journal_protocol_required",
      });
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
    expect(mocks.requireCurrentUserId).not.toHaveBeenCalled();
    expect(mocks.listMyRecentJournalEntries).not.toHaveBeenCalled();
  });
});

function postRequest(body: string, contentType: string) {
  return new Request("http://localhost:3000/api/skeleton/journal", {
    method: "POST",
    headers: { "content-type": contentType, host: "localhost:3000" },
    body,
  });
}

function getRequest() {
  return new Request("http://localhost:3000/api/skeleton/journal", {
    headers: { host: "localhost:3000" },
  });
}
