import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  addEngagementComment: vi.fn(),
  toggleEngagementBookmark: vi.fn(),
  toggleAnonymousEngagementLike: vi.fn(),
  revalidatePath: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/engagement-repository", () => ({
  addEngagementComment: mocks.addEngagementComment,
  toggleEngagementBookmark: mocks.toggleEngagementBookmark,
  toggleAnonymousEngagementLike: mocks.toggleAnonymousEngagementLike,
  engagementTargetPath: (target: { kind: string; ref: string }) =>
    target.kind === "variety"
      ? `/variety/${target.ref}`
      : `/journal/${target.ref}`,
  normalizeEngagementReturnTo: (
    value: string | null,
    target: { kind: string; ref: string },
  ) =>
    value?.startsWith("/") && !value.startsWith("//")
      ? value
      : target.kind === "variety"
        ? `/variety/${target.ref}`
        : `/journal/${target.ref}`,
  normalizeEngagementTarget: (kind: string, ref: string) => ({
    kind,
    ref,
  }),
}));

describe("engagement routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.addEngagementComment.mockResolvedValue({
      key: "comment:key",
    });
    mocks.toggleEngagementBookmark.mockResolvedValue({
      active: true,
    });
    mocks.toggleAnonymousEngagementLike.mockResolvedValue({
      liked: true,
      activeLikeCount: 1,
    });
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
  });

  it("routes signed-out comment intent to auth without mutating", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { POST } = await import("./comments/route");

    const response = await POST(
      formRequest("/api/engagement/comments", {
        targetKind: "journal_entry",
        targetRef: "first-public-harvest",
        returnTo: "/journal/first-public-harvest",
        body: "Great result.",
      }),
    );

    expect(mocks.addEngagementComment).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://over.garden/garden?engagement=comment-auth&targetKind=journal_entry&targetRef=first-public-harvest&returnTo=%2Fjournal%2Ffirst-public-harvest",
    );
  });

  it("posts signed-in comments inside the scoped account", async () => {
    const { POST } = await import("./comments/route");

    const response = await POST(
      formRequest("/api/engagement/comments", {
        targetKind: "journal_entry",
        targetRef: "first-public-harvest",
        returnTo: "/journal/first-public-harvest",
        body: "This stayed contact-free.",
      }),
    );

    expect(mocks.addEngagementComment).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        target: {
          kind: "journal_entry",
          ref: "first-public-harvest",
        },
        body: "This stayed contact-free.",
        parentCommentId: null,
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/journal/first-public-harvest",
    );
    expect(response.headers.get("location")).toBe(
      "https://over.garden/journal/first-public-harvest?engagement=commented",
    );
  });

  it("routes signed-out bookmark intent to auth without mutating", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { POST } = await import("./bookmarks/route");

    const response = await POST(
      formRequest("/api/engagement/bookmarks", {
        targetKind: "variety",
        targetRef: "pomidor-cheri-0000000101",
        returnTo: "/variety/pomidor-cheri-0000000101",
      }),
    );

    expect(mocks.toggleEngagementBookmark).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://over.garden/garden?engagement=bookmark-auth&targetKind=variety&targetRef=pomidor-cheri-0000000101&returnTo=%2Fvariety%2Fpomidor-cheri-0000000101",
    );
  });

  it("toggles signed-in bookmarks and revalidates the private shelf", async () => {
    const { POST } = await import("./bookmarks/route");

    const response = await POST(
      formRequest("/api/engagement/bookmarks", {
        targetKind: "variety",
        targetRef: "pomidor-cheri-0000000101",
        returnTo: "/variety/pomidor-cheri-0000000101",
      }),
    );

    expect(mocks.toggleEngagementBookmark).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        target: {
          kind: "variety",
          ref: "pomidor-cheri-0000000101",
        },
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/uk/bookmarks");
    expect(response.headers.get("location")).toBe(
      "https://over.garden/variety/pomidor-cheri-0000000101?engagement=bookmarked",
    );
  });

  it("allows signed-out anonymous likes with a device cookie only", async () => {
    const { POST } = await import("./likes/route");

    const response = await POST(
      formRequest("/api/engagement/likes", {
        targetKind: "journal_entry",
        targetRef: "first-public-harvest",
        returnTo: "/journal/first-public-harvest",
      }),
    );

    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.toggleAnonymousEngagementLike).toHaveBeenCalledWith({
      target: {
        kind: "journal_entry",
        ref: "first-public-harvest",
      },
      anonymousToken: expect.any(String),
    });
    expect(response.headers.get("location")).toBe(
      "https://over.garden/journal/first-public-harvest?engagement=liked",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "og_engagement_device=",
    );
  });
});

function formRequest(path: string, fields: Record<string, string>) {
  return new Request(`https://over.garden${path}`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
  });
}
