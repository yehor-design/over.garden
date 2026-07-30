import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  addEngagementComment: vi.fn(),
  blockEngagementCommentAuthor: vi.fn(),
  deleteEngagementComment: vi.fn(),
  reportEngagementComment: vi.fn(),
  setEngagementBookmark: vi.fn(),
  setEngagementFollow: vi.fn(),
  toggleAnonymousEngagementLike: vi.fn(),
  revalidatePath: vi.fn(),
  cookies: vi.fn(),
  createAuthIntentToken: vi.fn(),
  createAuthIntentControlRef: vi.fn(),
  resolveVisualSocialMutationActor: vi.fn(),
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
  blockEngagementCommentAuthor: mocks.blockEngagementCommentAuthor,
  deleteEngagementComment: mocks.deleteEngagementComment,
  reportEngagementComment: mocks.reportEngagementComment,
  setEngagementBookmark: mocks.setEngagementBookmark,
  setEngagementFollow: mocks.setEngagementFollow,
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
  normalizeEngagementCommentTarget: (kind: string, ref: string) => ({
    kind,
    ref,
  }),
}));

vi.mock("@/server/auth-intent-token", () => ({
  createAuthIntentToken: mocks.createAuthIntentToken,
}));

vi.mock("@/server/auth-intent-control", () => ({
  createAuthIntentControlRef: mocks.createAuthIntentControlRef,
}));

vi.mock("@/server/visual-fixtures/social-actor", () => ({
  resolveVisualSocialMutationActor: mocks.resolveVisualSocialMutationActor,
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
    mocks.setEngagementBookmark.mockResolvedValue({
      active: true,
    });
    mocks.setEngagementFollow.mockResolvedValue({ active: true });
    mocks.deleteEngagementComment.mockResolvedValue({
      target: { kind: "journal_entry", ref: "first-public-harvest" },
    });
    mocks.reportEngagementComment.mockResolvedValue({ reportId: "opaque" });
    mocks.blockEngagementCommentAuthor.mockResolvedValue({ handle: "reader" });
    mocks.toggleAnonymousEngagementLike.mockResolvedValue({
      liked: true,
      activeLikeCount: 1,
    });
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    mocks.createAuthIntentToken.mockReturnValue("opaque-intent-token");
    mocks.createAuthIntentControlRef.mockReturnValue("reply-a7d8f9c012345678");
    mocks.resolveVisualSocialMutationActor.mockReturnValue(null);
  });

  it("resumes a signed-out reply at the exact opaque reply control", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { POST } = await import("./comments/route");

    const response = await POST(
      formRequest("/api/engagement/comments", {
        targetKind: "journal_entry",
        targetRef: "first-public-harvest",
        returnTo: "/journal/first-public-harvest",
        parentCommentId: "private-parent-reply-token",
        body: "Reply draft must not travel through auth.",
      }),
    );

    expect(response.status).toBe(303);
    expect(mocks.createAuthIntentControlRef).toHaveBeenCalledWith(
      "reply",
      "private-parent-reply-token",
    );
    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
      action: "comment",
      returnTo: "/journal/first-public-harvest",
      target: { kind: "journal", ref: "first-public-harvest" },
      control: "reply-a7d8f9c012345678",
    });
    expect(JSON.stringify(mocks.createAuthIntentToken.mock.calls)).not.toMatch(
      /private-parent-reply-token|Reply draft/i,
    );
    expect(mocks.addEngagementComment).not.toHaveBeenCalled();
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
      "https://over.garden/auth/intent?intent=opaque-intent-token",
    );
    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
      action: "comment",
      returnTo: "/journal/first-public-harvest",
      target: { kind: "journal", ref: "first-public-harvest" },
    });
    expect(
      JSON.stringify(mocks.createAuthIntentToken.mock.calls),
    ).not.toContain("Great result.");
  });

  it("posts signed-in comments inside the scoped account", async () => {
    const { POST } = await import("./comments/route");

    const response = await POST(
      formRequest("/api/engagement/comments", {
        targetKind: "journal_entry",
        targetRef: "first-public-harvest",
        returnTo: "/journal/first-public-harvest",
        body: "This stayed contact-free.",
        clientMutationId: "comment-submit-000000000001",
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
        clientMutationId: "comment-submit-000000000001",
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

  it("posts an isolated visual-fixture comment in the manifest actor scope", async () => {
    const actorId = "18700001-0000-4000-8000-000000000003";
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    mocks.resolveVisualSocialMutationActor.mockReturnValueOnce({
      actorId,
      scenario: { id: "comments-dense" },
    });
    const { POST } = await import("./comments/route");

    await POST(
      formRequest("/api/engagement/comments", {
        targetKind: "journal_entry",
        targetRef: "visual-fixture-living-object-004",
        returnTo:
          "/journal/visual-fixture-living-object-004?visualSocial=comments-dense",
        body: "Fixture interaction stays isolated.",
        clientMutationId: "visual-comment-submit-000000000001",
      }),
    );

    expect(mocks.addEngagementComment).toHaveBeenCalledWith(
      { userId: actorId, sessionId: null },
      expect.objectContaining({
        target: {
          kind: "journal_entry",
          ref: "visual-fixture-living-object-004",
        },
      }),
    );
    expect(mocks.createAuthIntentToken).not.toHaveBeenCalled();
  });

  it.each([
    "/\\attacker.example/steal",
    "/%5cattacker.example/steal",
    "/%252f%255cattacker.example/steal",
  ])(
    "never carries protocol-confused return path %s into the auth token",
    async (returnTo) => {
      mocks.getCurrentSession.mockResolvedValueOnce(null);
      const { POST } = await import("./comments/route");

      const response = await POST(
        formRequest("/api/engagement/comments", {
          targetKind: "journal_entry",
          targetRef: "first-public-harvest",
          returnTo,
          body: "Private draft",
        }),
      );

      expect(response.headers.get("location")).toBe(
        "https://over.garden/auth/intent?intent=opaque-intent-token",
      );
      expect(mocks.createAuthIntentToken).toHaveBeenLastCalledWith({
        action: "comment",
        returnTo: "/journal/first-public-harvest",
        target: { kind: "journal", ref: "first-public-harvest" },
      });
      expect(
        JSON.stringify(mocks.createAuthIntentToken.mock.calls),
      ).not.toMatch(/attacker|Private draft/i);
    },
  );

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

    expect(mocks.setEngagementBookmark).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://over.garden/auth/intent?intent=opaque-intent-token",
    );
    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
      action: "bookmark",
      returnTo: "/variety/pomidor-cheri-0000000101",
      target: { kind: "collection", ref: "pomidor-cheri-0000000101" },
    });
  });

  it("toggles signed-in bookmarks and revalidates the private shelf", async () => {
    const { POST } = await import("./bookmarks/route");

    const response = await POST(
      formRequest("/api/engagement/bookmarks", {
        targetKind: "variety",
        targetRef: "pomidor-cheri-0000000101",
        returnTo: "/variety/pomidor-cheri-0000000101",
        bookmarkState: "active",
      }),
    );

    expect(mocks.setEngagementBookmark).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        target: {
          kind: "variety",
          ref: "pomidor-cheri-0000000101",
        },
        bookmarkState: "active",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bookmarks");
    expect(response.headers.get("location")).toBe(
      "https://over.garden/variety/pomidor-cheri-0000000101?engagement=bookmarked",
    );
  });

  it("allows signed-out likes only with a short-lived target-bound capability", async () => {
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
      capabilityExpiresAt: expect.any(Date),
    });
    expect(response.headers.get("location")).toBe(
      "https://over.garden/journal/first-public-harvest?engagement=liked",
    );
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toContain("og_like_");
    expect(cookies).toContain("Path=/api/engagement/likes");
    expect(cookies).not.toMatch(/og_engagement_device=[^;]+/);
  });

  it("returns a localized-safe rate status without exposing admission internals", async () => {
    const { InteractionAdmissionError } =
      await import("@/server/interaction-admission");
    mocks.addEngagementComment.mockRejectedValueOnce(
      new InteractionAdmissionError("quota"),
    );
    const { POST } = await import("./comments/route");

    const response = await POST(
      formRequest("/api/engagement/comments", {
        targetKind: "journal_entry",
        targetRef: "first-public-harvest",
        returnTo: "/journal/first-public-harvest",
        body: "A safe comment.",
        clientMutationId: "comment-submit-000000000001",
      }),
    );

    expect(response.headers.get("location")).toBe(
      "https://over.garden/journal/first-public-harvest?engagement=comment-rate-limited",
    );
  });

  it("collapses like capacity and database contention into one retry-safe status", async () => {
    const { InteractionAdmissionError } =
      await import("@/server/interaction-admission");
    mocks.toggleAnonymousEngagementLike.mockRejectedValueOnce(
      new InteractionAdmissionError("capacity"),
    );
    const { POST } = await import("./likes/route");

    const response = await POST(
      formRequest("/api/engagement/likes", {
        targetKind: "journal_entry",
        targetRef: "first-public-harvest",
        returnTo: "/journal/first-public-harvest",
      }),
    );

    expect(response.headers.get("location")).toBe(
      "https://over.garden/journal/first-public-harvest?engagement=interaction-unavailable",
    );
  });

  it("sets an explicit signed-in object follow state and refreshes the feed", async () => {
    const { POST } = await import("./follows/route");
    const objectId = "00000000-0000-4000-8000-000000000101";

    const response = await POST(
      formRequest("/api/engagement/follows", {
        targetKind: "lineage_object",
        targetRef: objectId,
        returnTo: `/lineage/objects/${objectId}`,
        followState: "active",
      }),
    );

    expect(mocks.setEngagementFollow).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      {
        target: { kind: "lineage_object", ref: objectId },
        followState: "active",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/feed");
    expect(response.headers.get("location")).toContain("engagement=followed");
  });

  it("keeps a signed-out report reason and comment id out of auth intent", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { POST } = await import("./comments/report/route");

    const response = await POST(
      formRequest("/api/engagement/comments/report", {
        targetKind: "journal_entry",
        targetRef: "first-public-harvest",
        returnTo: "/journal/first-public-harvest",
        commentId: "00000000-0000-4000-8000-000000000201",
        reason: "privacy",
      }),
    );

    expect(mocks.reportEngagementComment).not.toHaveBeenCalled();
    expect(mocks.createAuthIntentToken).toHaveBeenCalledWith({
      action: "report",
      returnTo: "/journal/first-public-harvest",
      target: { kind: "journal", ref: "first-public-harvest" },
      control: "reply-a7d8f9c012345678",
    });
    expect(JSON.stringify(mocks.createAuthIntentToken.mock.calls)).not.toMatch(
      /privacy|00000000-0000-4000-8000-000000000201/,
    );
    expect(response.status).toBe(303);
  });

  it("executes signed-in comment report, delete, and block in owner scope", async () => {
    const commentId = "00000000-0000-4000-8000-000000000201";
    const fields = {
      targetKind: "journal_entry",
      targetRef: "first-public-harvest",
      returnTo: "/journal/first-public-harvest",
      commentId,
    };
    const [{ POST: report }, { POST: remove }, { POST: block }] =
      await Promise.all([
        import("./comments/report/route"),
        import("./comments/delete/route"),
        import("./comments/block/route"),
      ]);

    await report(
      formRequest("/api/engagement/comments/report", {
        ...fields,
        reason: "misinformation",
      }),
    );
    await remove(formRequest("/api/engagement/comments/delete", fields));
    await block(formRequest("/api/engagement/comments/block", fields));

    const expectedScope = {
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    };
    expect(mocks.reportEngagementComment).toHaveBeenCalledWith(expectedScope, {
      commentId,
      reason: "misinformation",
      target: {
        kind: "journal_entry",
        ref: "first-public-harvest",
      },
    });
    expect(mocks.deleteEngagementComment).toHaveBeenCalledWith(
      expectedScope,
      commentId,
      { kind: "journal_entry", ref: "first-public-harvest" },
    );
    expect(mocks.blockEngagementCommentAuthor).toHaveBeenCalledWith(
      expectedScope,
      {
        commentId,
        target: {
          kind: "journal_entry",
          ref: "first-public-harvest",
        },
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/notifications");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bookmarks");
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
