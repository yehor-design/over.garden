import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADR-0023 for the mutation half: no interaction route may answer 5xx.
 *
 * On 2026-09-04 `POST /api/engagement/likes` answered `500` with
 * `content-length: 0` on 7 of the 8 public journal entries, and the reader was
 * left on a blank white page at the API URL. This suite is the standing proof
 * that every handler settles instead, for every input class it can be given.
 *
 * Unlike `route.test.ts` it uses the **real** target normalizers, because a
 * malformed target throwing inside `parseEngagementTarget` was one of the
 * reachable 500s and a permissive mock would hide it.
 */

const mocks = vi.hoisted(() => ({
  addEngagementComment: vi.fn(),
  blockEngagementCommentAuthor: vi.fn(),
  deleteEngagementComment: vi.fn(),
  reportEngagementComment: vi.fn(),
  setEngagementBookmark: vi.fn(),
  setEngagementFollow: vi.fn(),
  toggleAnonymousEngagementLike: vi.fn(),
  resolveMutationScope: vi.fn(),
  mutationScopeResponse: vi.fn(),
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  mutationScopeResponse: mocks.mutationScopeResponse,
  ownerUserIdFromRequest: () => null,
}));

vi.mock("@/server/engagement-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/engagement-repository")>()),
  addEngagementComment: mocks.addEngagementComment,
  blockEngagementCommentAuthor: mocks.blockEngagementCommentAuthor,
  deleteEngagementComment: mocks.deleteEngagementComment,
  reportEngagementComment: mocks.reportEngagementComment,
  setEngagementBookmark: mocks.setEngagementBookmark,
  setEngagementFollow: mocks.setEngagementFollow,
  toggleAnonymousEngagementLike: mocks.toggleAnonymousEngagementLike,
}));

const ORIGIN = "https://over.garden";

/** The eight public journal slugs on production, read on 2026-09-04. Seven of
 * them mint a capability token longer than the old 256-character bound. */
const PRODUCTION_JOURNAL_SLUGS = [
  "томат-sep-1-f66321980b32",
  "що-записувати-після-огляду-вулика-791f2f2fce",
  "полезна-бележка-за-домат-без-снимка-48ed6cce69",
  "обкладинка-як-сталии-орієнтир-сезону-bffe4e6cf9",
  "избрана-корица-която-не-зависи-от-реда-9aed1a6e58",
  "наблюдение-деи-ствие-и-следваща-проверка-9348e15136",
  "поливане-според-почвата-не-според-календара-967e48cbe2",
  "кратък-и-отговорен-запис-след-преглед-на-кошер-29a9b986d1",
] as const;

interface RouteUnderTest {
  route: string;
  load(): Promise<{ POST(request: Request): Promise<Response> }>;
  /** The repository call this route makes on the happy path. */
  effect(): ReturnType<typeof vi.fn>;
  extraFields?: Record<string, string>;
}

const ROUTES: RouteUnderTest[] = [
  {
    route: "likes",
    load: () => import("./likes/route"),
    effect: () => mocks.toggleAnonymousEngagementLike,
  },
  {
    route: "bookmarks",
    load: () => import("./bookmarks/route"),
    effect: () => mocks.setEngagementBookmark,
  },
  {
    route: "follows",
    load: () => import("./follows/route"),
    effect: () => mocks.setEngagementFollow,
    extraFields: { followState: "active" },
  },
  {
    route: "comments",
    load: () => import("./comments/route"),
    effect: () => mocks.addEngagementComment,
    extraFields: { body: "A note.", clientMutationId: "m-1" },
  },
  {
    route: "comments/delete",
    load: () => import("./comments/delete/route"),
    effect: () => mocks.deleteEngagementComment,
    extraFields: { commentId: "c-1" },
  },
  {
    route: "comments/report",
    load: () => import("./comments/report/route"),
    effect: () => mocks.reportEngagementComment,
    extraFields: { commentId: "c-1", reason: "spam" },
  },
  {
    route: "comments/block",
    load: () => import("./comments/block/route"),
    effect: () => mocks.blockEngagementCommentAuthor,
    extraFields: { commentId: "c-1" },
  },
];

/** Every shape of bad input a handler can be handed, and one good one. */
const INPUT_CLASSES = [
  { name: "a well-formed target", fields: {} as Record<string, string> },
  { name: "an unknown target kind", fields: { targetKind: "planet" } },
  { name: "an empty target ref", fields: { targetRef: "" } },
  {
    name: "a target ref past the column bound",
    fields: { targetRef: "п".repeat(400) },
  },
  {
    name: "a target ref carrying a path separator",
    fields: { targetRef: "../../etc/passwd" },
  },
  {
    name: "an off-origin return path",
    fields: { returnTo: "https://evil.example/x" },
  },
  {
    name: "a protocol-relative return path",
    fields: { returnTo: "//evil.example/x" },
  },
] as const;

/** The failures a repository call can raise, none of which may reach the reader. */
const REPOSITORY_FAULTS = [
  {
    name: "a target that is no longer public",
    error: new Error("Engagement target is not public."),
  },
  {
    name: "an unreachable database",
    error: Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    }),
  },
  {
    name: "a missing relation",
    error: Object.assign(
      new Error('relation "engagement_likes" does not exist'),
      {
        code: "42P01",
      },
    ),
  },
  {
    name: "a cancelled statement",
    error: Object.assign(new Error("canceling statement"), { code: "57014" }),
  },
  { name: "an unrecognised fault", error: new Error("boom") },
];

function engagementRequest(
  route: string,
  fields: Record<string, string> = {},
): Request {
  const body = new URLSearchParams({
    targetKind: "journal_entry",
    targetRef: "томат-sep-1-f66321980b32",
    returnTo: "/bg/journal/%D1%82%D0%BE%D0%BC%D0%B0%D1%82-sep-1-f66321980b32",
    ...fields,
  });
  return new Request(`${ORIGIN}/api/engagement/${route}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

function expectSettledOnOrigin(response: Response) {
  expect(response.status).toBeLessThan(500);
  if (response.status !== 303) return;
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  expect(new URL(location!, ORIGIN).origin).toBe(ORIGIN);
}

describe("engagement mutation settlement", () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // The capability is minted for real, so a route that cannot mint one is a
    // real failure here rather than a missing-secret artefact. The token-length
    // path itself is proved in `anonymous-like-capability.test.ts`, because the
    // hashing happens inside the repository call this suite replaces.
    process.env.BETTER_AUTH_SECRET = Buffer.alloc(32, 7).toString("base64url");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.toggleAnonymousEngagementLike.mockResolvedValue({
      liked: true,
      activeLikeCount: 1,
    });
    mocks.setEngagementBookmark.mockResolvedValue({ active: true });
    mocks.setEngagementFollow.mockResolvedValue({ active: true });
    mocks.addEngagementComment.mockResolvedValue({ key: "comment:key" });
    mocks.deleteEngagementComment.mockResolvedValue({});
    mocks.reportEngagementComment.mockResolvedValue({ reportId: "opaque" });
    mocks.blockEngagementCommentAuthor.mockResolvedValue({ handle: "reader" });
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
    });
    mocks.mutationScopeResponse.mockImplementation(
      (admission: { code: string; statusCode: number }) =>
        Response.json(
          { code: admission.code },
          { status: admission.statusCode },
        ),
    );
  });

  afterEach(() => {
    consoleError.mockRestore();
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousSecret;
  });

  for (const route of ROUTES) {
    describe(`/api/engagement/${route.route}`, () => {
      for (const input of INPUT_CLASSES) {
        it(`settles ${input.name} without a 5xx`, async () => {
          const { POST } = await route.load();
          const response = await POST(
            engagementRequest(route.route, {
              ...route.extraFields,
              ...input.fields,
            }),
          );
          expectSettledOnOrigin(response);
        });
      }

      for (const fault of REPOSITORY_FAULTS) {
        it(`settles ${fault.name} without a 5xx`, async () => {
          route.effect().mockRejectedValueOnce(fault.error);
          const { POST } = await route.load();
          const response = await POST(
            engagementRequest(route.route, route.extraFields),
          );

          expect(response.status).toBe(303);
          const location = new URL(response.headers.get("location")!, ORIGIN);
          expect(location.origin).toBe(ORIGIN);
          expect(location.searchParams.get("engagement")).toBe(
            "interaction-unavailable",
          );
        });
      }
    });
  }

  it("returns a settled failure to the same path the success path uses", async () => {
    const { POST } = await import("./likes/route");
    const success = await POST(engagementRequest("likes"));

    mocks.toggleAnonymousEngagementLike.mockRejectedValueOnce(
      new Error("boom"),
    );
    const failure = await POST(engagementRequest("likes"));

    const successUrl = new URL(success.headers.get("location")!, ORIGIN);
    const failureUrl = new URL(failure.headers.get("location")!, ORIGIN);
    expect(failureUrl.pathname).toBe(successUrl.pathname);
    expect(successUrl.searchParams.get("engagement")).toBe("liked");
    expect(failureUrl.searchParams.get("engagement")).toBe(
      "interaction-unavailable",
    );
  });

  it("records one bounded failure line an operator can match in the log", async () => {
    mocks.toggleAnonymousEngagementLike.mockRejectedValueOnce(
      Object.assign(new Error('relation "engagement_likes" does not exist'), {
        code: "42P01",
      }),
    );
    const { POST } = await import("./likes/route");
    await POST(engagementRequest("likes"));

    const lines = (consoleError.mock.calls as unknown[][])
      .map(([line]) => (typeof line === "string" ? line : ""))
      .filter((line: string) => line.includes("workspace_section_degraded"))
      .map((line: string) => JSON.parse(line) as Record<string, unknown>);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "workspace_section_degraded",
      surface: "engagement_mutation",
      section: "likes",
      failureClass: "schema_missing",
    });
    // The driver message can carry a statement and its parameters; only the
    // class and the digest may travel.
    expect(JSON.stringify(lines[0])).not.toContain("does not exist");
  });

  it("routes a like for every public journal slug on production without a 5xx", async () => {
    const { POST } = await import("./likes/route");

    for (const slug of PRODUCTION_JOURNAL_SLUGS) {
      const response = await POST(
        engagementRequest("likes", {
          targetRef: slug,
          returnTo: `/bg/journal/${encodeURIComponent(slug)}`,
        }),
      );

      expect(`${slug}:${response.status}`, `liking ${slug} must not fail`).toBe(
        `${slug}:303`,
      );
      expect(
        new URL(response.headers.get("location")!, ORIGIN).searchParams.get(
          "engagement",
        ),
      ).toBe("liked");
    }
  });

  it("lets a framework redirect travel through the boundary", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/somewhere;303;",
    });
    mocks.toggleAnonymousEngagementLike.mockRejectedValueOnce(redirect);
    const { POST } = await import("./likes/route");

    await expect(POST(engagementRequest("likes"))).rejects.toBe(redirect);
  });
});
