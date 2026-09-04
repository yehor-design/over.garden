import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listCommunityModerationQueue: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "owner-session"),
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/community-repository", () => ({
  listCommunityModerationQueue: mocks.listCommunityModerationQueue,
}));
vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
}));
vi.mock("@/app/(default)/account/communities/[slug]/actions", () => ({
  moderateCommunityContributionAction: vi.fn(),
  moderateCommunityDiscussionAction: vi.fn(),
  moderateCommunityMembershipAction: vi.fn(),
  resolveCommunityReportAction: vi.fn(),
  setCommunityParticipationAction: vi.fn(),
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId?: string) => ({
    userId,
    sessionId: sessionId ?? null,
  })),
}));
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: {
    next?: string;
    locale?: string;
    description?: string;
  }) => (
    <section
      data-sign-in-prompt="true"
      data-next={props.next ?? ""}
      data-locale={props.locale ?? ""}
    >
      Sign in prompt
      {props.description ?? ""}
    </section>
  ),
}));

describe("/account/communities/:slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000901" },
    });
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "denied",
    });
  });

  it.each(["denied", "timed_out", "cancelled"] as const)(
    "blocks %s access before the private queue read",
    async (status) => {
      mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({ status });
      const { default: CommunityModerationPage } = await import("./page");
      const html = renderToStaticMarkup(
        await CommunityModerationPage({
          params: Promise.resolve({ slug: "observation-and-care" }),
        }),
      );

      expect(html).toContain('data-operator-access-state="denied"');
      expect(html).not.toContain("data-private-moderation-queue");
      expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
    },
  );

  it("marks the sealed owner's private moderation queue", async () => {
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
    mocks.listCommunityModerationQueue.mockResolvedValue({
      community: { participationState: "open" },
      items: [],
    });
    const { default: CommunityModerationPage } = await import("./page");
    const html = renderToStaticMarkup(
      await CommunityModerationPage({
        params: Promise.resolve({ slug: "observation-and-care" }),
      }),
    );

    expect(html).toContain('data-private-moderation-queue="true"');
    expect(mocks.listCommunityModerationQueue).toHaveBeenCalledTimes(1);
  });
});
