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
      resumeAction?: string | null;
      resumeControl?: string | null;
    }) => (
      <div
        data-state={props.state}
        data-viewer={props.viewer}
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
