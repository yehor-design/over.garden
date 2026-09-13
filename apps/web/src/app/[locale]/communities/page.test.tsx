import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  readPublicCommunityDirectory: vi.fn(),
  listPublicCommunities: vi.fn(),
  publicCommunityDirectory: vi.fn(
    (props: { state: string; communities: readonly { slug: string }[] }) => (
      <div
        data-state={props.state}
        data-count={props.communities.length}
      />
    ),
  ),
}));

vi.mock("@/components/public/public-community", () => ({
  PublicCommunityDirectory: mocks.publicCommunityDirectory,
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: () => null,
}));
vi.mock("@/server/public-cache", () => ({
  readPublicCommunityDirectory: mocks.readPublicCommunityDirectory,
}));
vi.mock("@/server/community-repository", () => ({
  listPublicCommunities: mocks.listPublicCommunities,
}));

const community = {
  id: "018f1840-0000-4000-8000-000000000002",
  slug: "observation-and-care",
  contentKey: "observation-and-care",
  lifecycleState: "active",
  participationState: "open",
  updatedAt: new Date("2026-08-23T16:00:24.483Z"),
  topicSlug: "observation-and-care",
  navigationReady: false,
  activeMemberCount: 0,
  activeContributionCount: 0,
  activeObjectCount: 0,
  coverUrl: null,
  coverFocalX: null,
  coverFocalY: null,
  coverIntrinsicWidth: null,
  coverIntrinsicHeight: null,
  qualityClass: "verified" as const,
};

/** What Next throws to say "this page is dynamic" during a prerender. */
function prerenderBailout() {
  return Object.assign(new Error("Dynamic server usage: headers"), {
    digest: "DYNAMIC_SERVER_USAGE",
  });
}

describe("the community directory under a prerender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PUBLIC_SITE_URL", "https://over.garden");
    vi.stubEnv("BETTER_AUTH_URL", "https://over.garden");
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.readPublicCommunityDirectory.mockResolvedValue([community]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /**
   * The defect: `currentViewerScope` caught the bail-out `headers()` throws
   * during a prerender, the render walked on into the cached directory read,
   * the aborted prerender cancelled it, and the page's own `catch` rendered
   * "temporarily unavailable" — on production, for weeks, with nothing in any
   * log. Both catches let Next's signal through now.
   */
  it("lets a prerender bail-out from the session read reach Next", async () => {
    const { renderCommunityDirectory } = await import("./page");
    mocks.getCurrentSession.mockRejectedValueOnce(prerenderBailout());

    await expect(renderCommunityDirectory("uk")).rejects.toMatchObject({
      digest: "DYNAMIC_SERVER_USAGE",
    });
    expect(mocks.readPublicCommunityDirectory).not.toHaveBeenCalled();
  });

  it("lets a prerender bail-out from the directory read reach Next", async () => {
    const { renderCommunityDirectory } = await import("./page");
    mocks.readPublicCommunityDirectory.mockRejectedValueOnce(
      prerenderBailout(),
    );

    await expect(renderCommunityDirectory("uk")).rejects.toMatchObject({
      digest: "DYNAMIC_SERVER_USAGE",
    });
  });

  it("treats a failed session read as a guest and renders the directory", async () => {
    const { renderCommunityDirectory } = await import("./page");
    mocks.getCurrentSession.mockRejectedValueOnce(new Error("session store"));

    const html = renderToStaticMarkup(await renderCommunityDirectory("uk"));
    expect(html).toContain('data-state="ready"');
    expect(html).toContain('data-count="1"');
    expect(mocks.readPublicCommunityDirectory).toHaveBeenCalledTimes(1);
  });

  it("degrades on a real read failure, and says so in one log line", async () => {
    const { renderCommunityDirectory } = await import("./page");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.readPublicCommunityDirectory.mockRejectedValueOnce(
      Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    );

    const html = renderToStaticMarkup(await renderCommunityDirectory("bg"));
    expect(html).toContain('data-state="error"');
    const line = error.mock.calls.map(([value]) => String(value)).find((v) =>
      v.includes("public_surface_degraded"),
    );
    expect(line).toBeDefined();
    const event = JSON.parse(line!);
    expect(event).toMatchObject({
      event: "public_surface_degraded",
      surface: "community_directory",
      locale: "bg",
    });
    // The class and a digest, never the message: a driver error can carry a
    // statement and its parameters.
    expect(line).not.toContain("ECONNREFUSED");
    expect(event.digest).toMatch(/^[0-9A-Z]{7}$/);
  });
});
