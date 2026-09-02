import { beforeEach, describe, expect, it, vi } from "vitest";

import { sealPublicHandleMentionTarget } from "@/server/public-handle-mention-token";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  searchJournalMentionSuggestions: vi.fn(),
  resolveMutationScope: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  mutationScopeResponse: vi.fn(),
  ownerUserIdFromRequest: vi.fn(() => null),
}));

vi.mock("@/server/journal-mention-repository", () => ({
  searchJournalMentionSuggestions: mocks.searchJournalMentionSuggestions,
}));

const AUDIENCE_USER_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_USER_ID = "00000000-0000-4000-8000-000000000010";
const SECRET = "ove-203-mention-route-test-secret-with-adequate-length";

describe("GET /api/garden/mentions/typeahead", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: AUDIENCE_USER_ID,
      sessionId: "session-1",
    });
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: AUDIENCE_USER_ID,
        sessionId: "session-1",
      },
    });
  });

  it("returns an allowlisted no-store handle suggestion without the Better Auth user id", async () => {
    const opaqueId = sealPublicHandleMentionTarget(TARGET_USER_ID, {
      audienceUserId: AUDIENCE_USER_ID,
      secret: SECRET,
    });
    mocks.searchJournalMentionSuggestions.mockResolvedValue([
      {
        kind: "public_handle",
        id: opaqueId,
        label: "@green_garden",
        insertText: "@green_garden",
        detail: "Public gardener handle",
        disambiguationLabel: "Green Garden",
        catalogKind: null,
        userId: TARGET_USER_ID,
        ownerUserId: TARGET_USER_ID,
        email: "must-not-reach-http@example.test",
      },
    ]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost:3000/api/garden/mentions/typeahead?q=green",
      ),
    );
    const responseText = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(JSON.parse(responseText)).toEqual({
      suggestions: [
        {
          kind: "public_handle",
          id: opaqueId,
          label: "@green_garden",
          insertText: "@green_garden",
          detail: "Public gardener handle",
          disambiguationLabel: "Green Garden",
          catalogKind: null,
        },
      ],
    });
    expect(responseText).not.toContain(TARGET_USER_ID);
    expect(responseText).not.toContain("must-not-reach-http");
    expect(mocks.resolveMutationScope).toHaveBeenCalledOnce();
    expect(mocks.searchJournalMentionSuggestions).toHaveBeenCalledWith(
      { userId: AUDIENCE_USER_ID, sessionId: "session-1" },
      "green",
    );
  });
});
