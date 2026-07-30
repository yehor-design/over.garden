import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublicCommunityPageModel } from "@/server/community-repository";

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
}));

vi.mock("@/app/[locale]/communities/[slug]/actions", () => ({
  setCommunityMembershipAction: vi.fn(),
  contributeJournalToCommunityAction: vi.fn(),
  reportCommunityContributionAction: vi.fn(),
  blockCommunityContributionAuthorAction: vi.fn(),
}));

const COMMUNITY: PublicCommunityPageModel = {
  id: "00000000-0000-4000-8000-000000000184",
  slug: "observation-and-care",
  contentKey: "observation-and-care",
  topicSlug: "observation-and-care",
  lifecycleState: "active",
  participationState: "open",
  navigationReady: true,
  activeMemberCount: 17,
  activeContributionCount: 14,
  activeObjectCount: 9,
  coverUrl: null,
  coverFocalX: null,
  coverFocalY: null,
  coverIntrinsicWidth: null,
  coverIntrinsicHeight: null,
  rules: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      key: "share-observed-evidence",
      order: 1,
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      key: "protect-people-and-places",
      order: 2,
    },
  ],
  contributions: {
    items: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        href: "/journal/tomato-after-heat",
        title: "Томат після тижня спеки",
        excerpt:
          "Зафіксувала стан листя, вологість субстрату і наступну перевірку.",
        entryDate: "2026-07-12",
        publishedAt: "2026-07-12T12:00:00.000Z",
        addedAt: "2026-07-12T13:00:00.000Z",
        discussionState: "open",
        author: {
          handle: "demo_olena",
          label: "Олена",
          href: "/@demo_olena",
        },
        object: {
          id: "00000000-0000-4000-8000-000000000301",
          displayName: "Томат Чорний принц",
          kind: "plant",
          href: "/lineage/objects/00000000-0000-4000-8000-000000000301",
        },
        coverUrl: "https://media.example/tomato.webp",
        coverFocalX: 0.5,
        coverFocalY: 0.5,
        coverIntrinsicWidth: 800,
        coverIntrinsicHeight: 600,
        viewerReportState: null,
      },
    ],
    nextCursor: "next-page",
  },
  search: {
    mode: "browse",
    degradedReason: null,
    shortQuery: false,
  },
  viewer: {
    membershipState: null,
    isModerator: false,
    eligibleJournals: [],
  },
};

describe("PublicCommunityView", () => {
  it("announces localized bounded search degradation without blocking controls", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="bg"
        community={{
          ...COMMUNITY,
          search: {
            mode: "bounded_fallback",
            degradedReason: "timeout",
            shortQuery: false,
          },
        }}
        viewer="guest"
        query="домати"
        kind="all"
        cursor=""
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Търсенето временно е ограничено");
    expect(html).toContain('type="search"');
    expect(html).toContain('type="submit"');
  });

  it("keeps reading guest-open and gates only participation and safety mutations", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={COMMUNITY}
        viewer="guest"
        query="волога"
        kind="plant"
        cursor="eyJpZCI6IjEifQ"
      />,
    );

    expect(html).toContain('data-public-community="observation-and-care"');
    expect(html).toContain("Спостереження і догляд");
    expect(html).toContain("Томат після тижня спеки");
    expect(html).toContain('href="/journal/tomato-after-heat"');
    expect(html).toContain(
      'href="/communities/observation-and-care/discussions/00000000-0000-4000-8000-000000000201"',
    );
    expect(html).toContain('href="/topics/observation-and-care"');
    expect(html).toContain('action="/auth/intent/start"');
    expect(html).toContain('name="targetKind" value="collection"');
    expect(html).toContain('name="targetRef" value="observation-and-care"');
    expect(html).toContain('data-auth-intent-control="follow"');
    expect(html).toContain('data-auth-intent-control="report"');
    expect(html).toContain('data-auth-intent-control="block"');
    expect(html).toContain(
      'name="control" value="contribution-00000000-0000-4000-8000-000000000201"',
    );
    expect(html).toContain(
      'name="returnTo" value="/communities/observation-and-care?q=%D0%B2%D0%BE%D0%BB%D0%BE%D0%B3%D0%B0&amp;kind=plant&amp;cursor=eyJpZCI6IjEifQ"',
    );
    expect(html).not.toMatch(
      /email|sessionId|ownerUserId|quarantine|latitude|longitude/i,
    );
  });

  it("shows actor-scoped member controls and canonical contribution choices", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="bg"
        community={{
          ...COMMUNITY,
          viewer: {
            membershipState: "active",
            isModerator: true,
            eligibleJournals: [
              {
                id: "00000000-0000-4000-8000-000000000401",
                title: "Следваща проверка",
                entryDate: "2026-07-13",
                publicSlug: "next-check",
                objectDisplayName: "Градски кошер",
                objectKind: "animal",
              },
            ],
          },
        }}
        viewer="member"
      />,
    );

    expect(html).toContain("Наблюдения и грижи");
    expect(html).toContain('name="membershipState" value="left"');
    expect(html).toContain('name="journalEntryId"');
    expect(html).toContain("Следваща проверка");
    expect(html).toContain('action="/bg/communities/observation-and-care"');
    expect(html).toContain('href="/admin/communities/observation-and-care"');
    expect(html).toContain('name="contributionId"');
    expect(html).toContain(
      'class="relative flex flex-wrap items-center gap-2"',
    );
    expect(html).toContain('class="sm:relative"');
    expect(html).not.toContain('action="/auth/intent/start"');
  });

  it("keeps archived evidence readable, permits leaving, and resumes the exact safety intent", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const control = "contribution-00000000-0000-4000-8000-000000000201";
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={{
          ...COMMUNITY,
          lifecycleState: "archived",
          viewer: {
            membershipState: "active",
            isModerator: false,
            eligibleJournals: [],
          },
        }}
        viewer="member"
        resumeAction="report"
        resumeControl={control}
      />,
    );

    expect(html).toContain("Цю спільноту архівовано");
    expect(html).toContain("Томат після тижня спеки");
    expect(html).toContain('name="membershipState" value="left"');
    expect(html).toContain(`id="profile-report-${control}" open=""`);
    expect(html).toContain(
      `data-auth-intent-control="report" data-auth-intent-control-ref="${control}"`,
    );
  });
});
