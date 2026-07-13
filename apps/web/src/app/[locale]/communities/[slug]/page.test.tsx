import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getPublicCommunityPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  publicCommunityView: vi.fn(
    (props: {
      state: string;
      viewer: string;
      visualScenarioId?: string;
      resumeAction?: string | null;
      resumeControl?: string | null;
    }) => (
      <div
        data-state={props.state}
        data-viewer={props.viewer}
        data-scenario={props.visualScenarioId}
        data-resume-action={props.resumeAction}
        data-resume-control={props.resumeControl}
      />
    ),
  ),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/public/public-community", () => ({
  PublicCommunityView: mocks.publicCommunityView,
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: () => null,
}));
vi.mock("@/server/community-repository", () => ({
  getPublicCommunityPage: mocks.getPublicCommunityPage,
}));

describe("localized community detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VISUAL_FIXTURES_ENABLED", "true");
    vi.stubEnv("VISUAL_FIXTURES_TARGET", "local");
    vi.stubEnv("VISUAL_FIXTURES_DATABASE", "overgarden");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://overgarden:secret@localhost:5432/overgarden",
    );
    vi.stubEnv("R2_ENDPOINT", "http://localhost:9000");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "http://localhost:9000/overgarden-public");
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    mocks.getPublicCommunityPage.mockResolvedValue({
      slug: "visual-care-across-every-living-object",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the exact fixture actor and preserves the deterministic state", async () => {
    const { default: CommunityDetailRoute } = await import("./page");
    const result = await CommunityDetailRoute({
      params: Promise.resolve({
        locale: "uk",
        slug: "visual-care-across-every-living-object",
      }),
      searchParams: Promise.resolve({
        visualCommunity: "ove184-community-loading",
        authIntent: "report",
        authControl: "contribution-00000000-0000-4000-8000-000000000201",
      }),
    });
    const html = renderToStaticMarkup(result);

    expect(html).toContain('data-state="loading"');
    expect(html).toContain('data-viewer="guest"');
    expect(html).toContain('data-scenario="ove184-community-loading"');
    expect(html).toContain('data-resume-action="report"');
    expect(html).toContain(
      'data-resume-control="contribution-00000000-0000-4000-8000-000000000201"',
    );
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();

    const { default: CommunityRouteAgain } = await import("./page");
    await CommunityRouteAgain({
      params: Promise.resolve({
        locale: "uk",
        slug: "visual-observation-and-care",
      }),
      searchParams: Promise.resolve({
        visualCommunity: "ove184-community-member",
      }),
    });
    expect(mocks.getPublicCommunityPage).toHaveBeenLastCalledWith(
      "visual-observation-and-care",
      "uk",
      expect.objectContaining({
        viewerScope: expect.objectContaining({
          userId: expect.any(String),
        }),
      }),
    );
  });

  it("returns 404 for unavailable or cross-community fixture paths", async () => {
    const { default: CommunityDetailRoute } = await import("./page");

    await expect(
      CommunityDetailRoute({
        params: Promise.resolve({
          locale: "uk",
          slug: "visual-community-unavailable",
        }),
        searchParams: Promise.resolve({
          visualCommunity: "ove184-community-unavailable",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    await expect(
      CommunityDetailRoute({
        params: Promise.resolve({
          locale: "uk",
          slug: "visual-observation-and-care",
        }),
        searchParams: Promise.resolve({
          visualCommunity: "ove184-community-dense",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("propagates repository failures to the route error boundary", async () => {
    const { default: CommunityDetailRoute } = await import("./page");
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getPublicCommunityPage.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(
      CommunityDetailRoute({
        params: Promise.resolve({
          locale: "uk",
          slug: "observation-and-care",
        }),
      }),
    ).rejects.toThrow("database unavailable");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
