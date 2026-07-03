import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getLineageInvitationClaimPreview: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock("@/server/lineage-repository", () => ({
  getLineageInvitationClaimPreview: mocks.getLineageInvitationClaimPreview,
}));

vi.mock("../../../garden-auth-panel", () => ({
  GardenAuthPanel: () => <section>Sign in to continue</section>,
}));

vi.mock("./actions", () => ({
  confirmLineageInvitationClaimAction: vi.fn(async () => {}),
  declineLineageInvitationClaimAction: vi.fn(async () => {}),
}));

async function renderClaimPage(searchParams?: Record<string, string>) {
  const { default: LineageInvitationClaimPage } = await import("./page");
  return renderToStaticMarkup(
    await LineageInvitationClaimPage({
      searchParams: Promise.resolve(searchParams ?? {}),
    }),
  );
}

describe("/garden/lineage/invitations/claim page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stays out of search indexes", async () => {
    const { metadata } = await import("./page");

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("does not reveal invitation details before sign-in", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const html = await renderClaimPage({ token: "v1.payload.signature" });

    expect(html).toContain("Sign in to continue");
    expect(mocks.getLineageInvitationClaimPreview).not.toHaveBeenCalled();
    expect(html).not.toMatch(/Maria saved seeds|Cherokee Purple/i);
  });

  it("renders bounded claim details for a signed-in gardener with a valid token", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000777" },
      session: { id: "session-1" },
    });
    mocks.getLineageInvitationClaimPreview.mockResolvedValue({
      edgeId: "00000000-0000-4000-8000-000000000201",
      consentState: "proposed",
      pendingIdentity: {
        id: "00000000-0000-4000-8000-000000000301",
        displayLabel: "Maria saved seeds",
        inviteState: "pending",
      },
      subjectObject: {
        id: "00000000-0000-4000-8000-000000000101",
        displayName: "Cherokee Purple",
        objectKind: "plant",
        catalogKind: "plant_variety",
        varietyText: "Tomato",
        varietyState: "selected",
      },
      createdAt: new Date("2026-07-03T18:00:00.000Z"),
    });

    const html = await renderClaimPage({ token: "v1.payload.signature" });
    const visibleCopy = html.replace(/value="[^"]*"/g, "");

    expect(mocks.getLineageInvitationClaimPreview).toHaveBeenCalledWith(
      "v1.payload.signature",
    );
    expect(html).toContain("Maria saved seeds");
    expect(html).toContain("Cherokee Purple");
    expect(html).toContain("Pending · no public contribution yet");
    expect(html).toContain("Claim and confirm");
    expect(html).toContain("Decline");
    expect(visibleCopy).not.toMatch(
      /v1\.payload\.signature|email|phone|contact|raw url|referrer|ip address|user agent|coordinate|latitude|longitude|media key|journal body/i,
    );
  });

  it("shows a safe unavailable state for an invalid or handled token", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000777" },
      session: { id: "session-1" },
    });
    mocks.getLineageInvitationClaimPreview.mockResolvedValue(null);

    const html = await renderClaimPage({ token: "v1.invalid.signature" });

    expect(html).toContain(
      "This lineage invitation is unavailable, expired, or already handled.",
    );
    expect(html).not.toMatch(/Claim and confirm|Maria saved seeds/i);
  });
});
