import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  ensureUserPublicProfile: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/public-profile-repository", () => ({
  ensureUserPublicProfile: mocks.ensureUserPublicProfile,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("../garden-auth-panel", () => ({
  GardenAuthPanel: () => <section>Sign in panel</section>,
}));

describe("/garden/profile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getCurrentSession.mockResolvedValue({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
      },
      session: {
        id: "session-1",
      },
    });
    mocks.ensureUserPublicProfile.mockResolvedValue({
      user_id: "00000000-0000-4000-8000-000000000001",
      handle: "green_thumb",
      normalized_handle: "green_thumb",
      display_name: null,
      avatar_url: null,
      created_at: new Date("2026-07-04T08:00:00.000Z"),
      updated_at: new Date("2026-07-04T08:00:00.000Z"),
    });
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
  });

  it("opens the public profile in the selected locale", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValueOnce("bg");
    const { default: GardenPublicProfilePage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPublicProfilePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('href="/bg/@green_thumb"');
  });

  it("ensures a signed-in gardener has one public handle", async () => {
    const { default: GardenPublicProfilePage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPublicProfilePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(mocks.ensureUserPublicProfile).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    expect(html).toContain("@green_thumb");
    expect(html).toContain("/@green_thumb");
    expect(html).toContain("Save handle");
    expect(html).not.toMatch(
      /email|provider|session-1|quarantine|invite|token|00000000-0000/i,
    );
  });

  it("renders deterministic guardrail copy from action status params", async () => {
    const { default: GardenPublicProfilePage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPublicProfilePage({
        searchParams: Promise.resolve({ status: "reserved" }),
      }),
    );

    expect(html).toContain(
      "That handle is reserved for OverGarden routes or support.",
    );
  });

  it("shows the auth panel without creating a profile when signed out", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { default: GardenPublicProfilePage } = await import("./page");
    const html = renderToStaticMarkup(
      await GardenPublicProfilePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Sign in panel");
    expect(mocks.ensureUserPublicProfile).not.toHaveBeenCalled();
  });
});
