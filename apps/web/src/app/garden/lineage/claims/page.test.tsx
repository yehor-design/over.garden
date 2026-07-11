import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  listLineageClaimInbox: vi.fn(),
  resolvePilotWriteAccess: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "session-1"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/pilot-write-access", () => ({
  resolvePilotWriteAccess: mocks.resolvePilotWriteAccess,
}));

vi.mock("@/server/lineage-repository", () => ({
  listLineageClaimInbox: mocks.listLineageClaimInbox,
}));

vi.mock("../../garden-auth-panel", () => ({
  GardenAuthPanel: () => <section>Sign in to continue</section>,
}));

vi.mock("./actions", () => ({
  confirmLineageClaimAction: vi.fn(),
  declineLineageClaimAction: vi.fn(),
}));

describe("/garden/lineage/claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.resolvePilotWriteAccess.mockResolvedValue({ invited: true });
    mocks.listLineageClaimInbox.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000201",
        consentState: "proposed",
        visibilityPolicy: "owner_only_until_confirmed",
        erasureState: "active",
        createdAt: new Date("2026-07-03T18:00:00.000Z"),
        subjectObject: {
          id: "00000000-0000-4000-8000-000000000101",
          displayName: "Balcony tomato",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
        sourceObject: {
          id: "00000000-0000-4000-8000-000000000102",
          displayName: "Seed mother",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
      },
    ]);
  });

  it("requires auth before reading lineage claims", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const { default: LineageClaimInboxPage } = await import("./page");
    const html = renderToStaticMarkup(await LineageClaimInboxPage());

    expect(html).toContain("Sign in to continue");
    expect(mocks.listLineageClaimInbox).not.toHaveBeenCalled();
    expect(mocks.resolvePilotWriteAccess).not.toHaveBeenCalled();
  });

  it("renders bounded proposed claim cards without private payload fields", async () => {
    const { default: LineageClaimInboxPage } = await import("./page");
    const html = renderToStaticMarkup(await LineageClaimInboxPage());

    expect(mocks.listLineageClaimInbox).toHaveBeenCalledOnce();
    expect(html).toContain("Lineage claims");
    expect(html).toContain("Balcony tomato claims provenance from Seed mother");
    expect(html).toContain("Balcony tomato · Red Cherry");
    expect(html).toContain("Seed mother · Red Cherry");
    expect(html).toContain("Proposed lineage");
    expect(html).toContain("Confirm lineage");
    expect(html).toContain("Decline");
    expect(html).not.toMatch(
      /journal body|quarantine|derivative|media key|ip_address|ipaddress|user_agent|useragent|user-agent|email|phone|coarse_region|location_visibility|coordinates|@private|https?:\/\//i,
    );
  });

  it("shows a bounded completion state after an invitation decision", async () => {
    const { default: LineageClaimInboxPage } = await import("./page");
    const html = renderToStaticMarkup(
      await LineageClaimInboxPage({
        searchParams: Promise.resolve({ invitation: "confirmed" }),
      }),
    );

    expect(html).toContain("Invitation confirmed");
    expect(html).toContain("recorded visibility policy");
    expect(html).not.toMatch(/token|private-payload|opaque\.sealed/i);
  });
});
