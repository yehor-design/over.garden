import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST } from "@/lib/public-community-view";
import type {
  PublicCommunityDirectoryItem,
  PublicCommunityPageModel,
} from "@/server/community-repository";

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  // The rail's modules, printed where a test can read them.
  SiteShellContextRailRegistration: ({ modules }: { modules: unknown }) => (
    <template data-test-rail={JSON.stringify(modules)} />
  ),
  SiteShellContextRailModules: () => null,
}));

vi.mock("@/app/[locale]/communities/[slug]/actions", () => ({
  setCommunityMembershipAction: vi.fn(),
  contributeJournalToCommunityAction: vi.fn(),
  reportCommunityContributionAction: vi.fn(),
  blockCommunityContributionAuthorAction: vi.fn(),
}));

const DIRECTORY_ITEM: PublicCommunityDirectoryItem = {
  id: "00000000-0000-4000-8000-000000000184",
  slug: "observation-and-care",
  contentKey: "observation-and-care",
  topicSlug: "observation-and-care",
  topicLabel: "Спостереження і догляд",
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
};

const COMMUNITY: PublicCommunityPageModel = {
  ...DIRECTORY_ITEM,
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
  contributors: [
    {
      handle: "demo_olena",
      label: "Олена",
      href: "/@demo_olena",
      avatarUrl: null,
      entryCount: 3,
    },
  ],
  contributions: {
    items: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        href: "/@demo_olena/tomato-after-heat",
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
        coverCaption: "Перша стигла китиця",
        viewerReportState: null,
        viewerIsAuthor: false,
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

const EMPTY_COMMUNITY: PublicCommunityPageModel = {
  ...COMMUNITY,
  activeMemberCount: 0,
  activeContributionCount: 0,
  activeObjectCount: 0,
  contributors: [],
  contributions: { items: [], nextCursor: null },
};

describe("PublicCommunityDirectory", () => {
  it("shows what a community has, and prints no count of zero", async () => {
    const { PublicCommunityDirectory } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityDirectory
        locale="uk"
        communities={[
          DIRECTORY_ITEM,
          {
            ...DIRECTORY_ITEM,
            id: "00000000-0000-4000-8000-000000000185",
            slug: "quiet-start",
            activeMemberCount: 0,
            activeContributionCount: 0,
            activeObjectCount: 0,
          },
        ]}
      />,
    );

    expect(html).toContain('data-public-community-card="observation-and-care"');
    expect(html).toContain('data-community-facts="3"');
    // The whole of criterion 1. The quiet community says what it is — new and
    // open — rather than `0 Записи · 0 Живі об'єкти · 0 Учасники`.
    expect(html).toContain('data-community-facts="none"');
    expect(html).toContain("Нова спільнота");
    expect(html).not.toMatch(/>0</u);
    // And nothing here reaches for the pre-redesign palette.
    expect(html).not.toContain("text-muted-foreground");
    expect(html).not.toContain("text-foreground");
  });

  it("offers an empty directory one illustrated state, not a bare sentence", async () => {
    const { PublicCommunityDirectory } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityDirectory locale="bg" communities={[]} />,
    );

    expect(html).toContain('data-screen-state="empty-first-run"');
    expect(html).toContain("/illustrations/empty-community.webp");
    expect(html).toContain("В момента няма достъпни общности.");
  });
});

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
        request={{ query: "домати", kind: "all", cursor: null }}
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
        request={{ query: "волога", kind: "plant", cursor: "eyJpZCI6IjEifQ" }}
      />,
    );

    expect(html).toContain('data-public-community="observation-and-care"');
    expect(html).toContain("Спостереження і догляд");
    expect(html).toContain("Томат після тижня спеки");
    expect(html).toContain('href="/@demo_olena/tomato-after-heat"');
    expect(html).toContain(
      'href="/communities/observation-and-care/discussions/00000000-0000-4000-8000-000000000201"',
    );
    expect(html).toContain('href="/topics/observation-and-care"');
    // The photograph is described by the gardener's own caption; it was
    // always alt="" here, captioned or not (OG-UX-029, OVE-478).
    expect(html).toContain('alt="Перша стигла китиця"');
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

  it("puts the rules of participation on the page at every width", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={COMMUNITY}
        viewer="guest"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );

    // `OVE-454` criterion 5. The rules used to live in a section marked
    // `xl:hidden`, so above `xl` — where the rail took them — the community's
    // own page carried no rules at all.
    const rules = html.slice(html.indexOf('id="community-rules"'));
    expect(rules).toContain("Правила спільноти");
    expect(rules).toContain(
      "Публікуйте власні спостереження та вказуйте, що саме перевірили.",
    );
    expect(html).not.toMatch(/xl:hidden[^>]*>\s*<h2[^>]*>Правила/u);
  });

  it("gives an empty community one first-run state, not a stack of empty sections", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={EMPTY_COMMUNITY}
        viewer="guest"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );

    expect(html).toContain('data-public-community-screen="empty-first-run"');
    expect(html).toContain('data-screen-state="empty-first-run"');
    expect(html).toContain("Тут ще немає записів");
    expect(html).toContain("Додати перший запис");
    // `OVE-500`, OG-UX-035: the first-run action is this community's own
    // step, never a garden setup with no community in it.
    expect(html).toContain('data-community-add-entry="first-run"');
    expect(html).toContain('href="#community-contribute"');
    expect(html).not.toContain('href="/garden/new"');
    expect(html).toContain('id="community-contribute"');
    // No filter bar over nothing, no "Записи · 0" heading, no result count.
    expect(html).not.toContain('data-slot="filter-bar"');
    expect(html).not.toContain("data-community-result-count");
    expect(html).toContain('data-community-facts="none"');
    // The rules stay: they are what a first contributor is agreeing to.
    expect(html).toContain('id="community-rules"');
  });

  it("separates a filtered miss from an empty community", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={{
          ...COMMUNITY,
          contributions: { items: [], nextCursor: null },
        }}
        viewer="guest"
        request={{ query: "нічого", kind: "plant", cursor: null }}
      />,
    );

    expect(html).toContain('data-screen-state="empty-no-results"');
    expect(html).not.toContain("/illustrations/empty-community.webp");
    expect(html).toContain("нічого");
    expect(html).toContain("Скинути фільтри");
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
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );

    expect(html).toContain("Наблюдения и грижи");
    expect(html).toContain('name="membershipState" value="left"');
    expect(html).toContain('name="journalEntryId"');
    expect(html).toContain("Следваща проверка");
    expect(html).toContain('action="/bg/communities/observation-and-care"');
    expect(html).toContain('name="contributionId"');
    expect(html).not.toContain('action="/auth/intent/start"');
    // The moderator's way into this community's queue is a link, not a
    // second surface — and unprefixed, because `/account/**` has no
    // `[locale]` twin and the proxy answers 404 for `/bg/account/…`.
    expect(html).toContain('href="/account/communities/observation-and-care"');
    expect(html).not.toContain('href="/bg/account/communities');
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
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
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

  it("puts the action where the empty state's anchor points", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={{
          ...EMPTY_COMMUNITY,
          viewer: {
            membershipState: "active",
            isModerator: false,
            eligibleJournals: [
              {
                id: "00000000-0000-4000-8000-000000000401",
                title: "Наступна перевірка",
                entryDate: "2026-07-13",
                publicSlug: "next-check",
                objectDisplayName: "Томат",
                objectKind: "plant",
              },
            ],
          },
        }}
        viewer="member"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );

    // A member who can write is offered the picker itself; the empty state's
    // one action is an anchor to it, and an anchor to a section that is not on
    // the page is a button that does nothing.
    expect(html).toContain('href="#community-contribute"');
    expect(html).toContain('id="community-contribute"');
    expect(html).toContain('name="journalEntryId"');
    // Still one state: no filter bar, no result count over nothing.
    expect(html).not.toContain('data-slot="filter-bar"');
    expect(html).not.toContain("data-community-result-count");
  });

  it("names the people writing here, and nobody who only joined", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={COMMUNITY}
        viewer="guest"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );

    // Membership is a fact this product has never published; a contributor
    // published their own participation by publishing an entry.
    expect(html).toContain('id="community-contributors"');
    expect(html).toContain("Хто пише тут");
    expect(html).toContain("Олена");
    expect(html).toContain("3 записи");
  });
});

describe("PublicCommunityDiscussion", () => {
  it("says where a reader is, which entry is discussed, and the way back", async () => {
    const { PublicCommunityDiscussion } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityDiscussion
        locale="uk"
        communitySlug="observation-and-care"
        communityName="Спостереження і догляд"
        entry={{
          id: "00000000-0000-4000-8000-000000000201",
          title: "Томат після тижня спеки",
          href: "/@demo_olena/tomato-after-heat",
          excerpt: "Зафіксувала стан листя і наступну перевірку.",
          authorLabel: "Олена",
          authorHref: "/@demo_olena",
          dateTime: "2026-07-12",
          dateLabel: "12 лип. 2026 р.",
          objectLabel: "Томат Чорний принц",
          objectKind: "plant",
        }}
      >
        <p>thread</p>
      </PublicCommunityDiscussion>,
    );

    expect(html).toContain(
      'data-public-community-discussion="observation-and-care"',
    );
    expect(html).toContain('href="/communities"');
    expect(html).toContain('href="/communities/observation-and-care"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/@demo_olena/tomato-after-heat"');
    expect(html).toContain('dateTime="2026-07-12"');
    expect(html).toContain("Томат Чорний принц");
    // `OVE-500`, criterion 4: the entry under discussion reads as the same
    // post the community lists — its opening, not only its title.
    expect(html).toContain('data-slot="entry-card"');
    expect(html).toContain("Зафіксувала стан листя і наступну перевірку.");
    expect(html).toContain('data-community-discussion-back="true"');
    expect(html).toContain("thread");
  });

  it("says a removed discussion is gone, and leads back to its community", async () => {
    const { PublicCommunityDiscussionUnavailable } =
      await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityDiscussionUnavailable
        locale="ru"
        communitySlug="observation-and-care"
        communityName="Наблюдения и уход"
      />,
    );

    expect(html).toContain(
      'data-public-community-discussion-state="unavailable"',
    );
    expect(html).toContain("Это обсуждение недоступно");
    expect(html).toContain('href="/ru/communities/observation-and-care"');
    expect(html).toContain("К сообществу");
  });
});

describe("the community's identity and its one way in (OVE-500)", () => {
  function rail(html: string) {
    const match = /data-test-rail="([^"]*)"/u.exec(html);
    return JSON.parse(
      (match?.[1] ?? "[]")
        .replaceAll("&quot;", '"')
        .replaceAll("&amp;", "&")
        .replaceAll("&#x27;", "'"),
    ) as { key: string; items: { href: string; label: string }[] }[];
  }

  it("says what the community is for, its topic, and how to take part", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="bg"
        community={COMMUNITY}
        viewer="guest"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );

    expect(html).toContain('data-community-identity="true"');
    expect(html).toContain("Членовете добавят тук своите публикувани записи");
    // The topic, in the reader's language and at its address.
    expect(html).toContain('data-community-topic="observation-and-care"');
    expect(html).toContain('href="/bg/topics/observation-and-care"');
    expect(html).toContain("Наблюдения и грижи");
    // Join and add an entry, side by side in the header.
    expect(html).toContain('data-community-add-entry="header"');
    expect(html).toContain("Добавяне на запис");
  });

  it("gives the rail this community's places, and no generic welcome", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={COMMUNITY}
        viewer="guest"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
        otherCommunities={[
          DIRECTORY_ITEM,
          {
            ...DIRECTORY_ITEM,
            id: "00000000-0000-4000-8000-000000000185",
            slug: "visual-care-across-every-living-object",
            contentKey: "visual-care-across-every-living-object",
          },
        ]}
      />,
    );

    const modules = rail(html);
    expect(modules.map((module) => module.key)).toEqual([
      "community-about",
      "community-discover",
    ]);
    expect(modules[0]!.items.map((item) => item.href)).toEqual([
      "/topics/observation-and-care",
      "#community-contribute",
      "#community-rules",
      "#community-contributors",
    ]);
    // The other community, and never this one again.
    expect(modules[1]!.items).toHaveLength(1);
    expect(JSON.stringify(modules)).not.toContain("Переглянути добірку знань");
  });

  it("offers a guest the sign-in that comes back to this step", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={COMMUNITY}
        viewer="guest"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );
    const step = html.slice(html.indexOf('id="community-contribute"'));

    expect(step).toContain('data-community-contribute-step="guest"');
    expect(step).toContain('name="action" value="contribute"');
    expect(step).toContain('name="targetKind" value="collection"');
    expect(step).toContain('name="targetRef" value="observation-and-care"');
    expect(step).toContain('name="control" value="add-entry"');
    expect(step).toContain(
      'name="returnTo" value="/communities/observation-and-care"',
    );
    expect(step).toContain("Увійти, щоб додати запис");
  });

  it("asks a signed-in reader who is not a member to join, and comes back here", async () => {
    const { CommunityContributionStep } = await import("./public-community");
    const html = renderToStaticMarkup(
      <CommunityContributionStep
        locale="uk"
        community={{
          ...COMMUNITY,
          viewer: {
            membershipState: "left",
            isModerator: false,
            eligibleJournals: [],
          },
        }}
        viewer="member"
        communityPath="/communities/observation-and-care"
        freshEntryId="00000000-0000-4000-8000-000000000401"
      />,
    );

    expect(html).toContain('data-community-contribute-step="join"');
    expect(html).toContain('name="membershipState" value="active"');
    expect(html).toContain('name="returnAnchor" value="community-contribute"');
    expect(html).toContain(
      'name="contribute" value="00000000-0000-4000-8000-000000000401"',
    );
    expect(html).toContain(
      'data-auth-intent-control="contribute" data-auth-intent-control-ref="add-entry"',
    );
  });

  it("lets a member choose an entry, the new one first, or write one for this community", async () => {
    const { CommunityContributionStep } = await import("./public-community");
    const html = renderToStaticMarkup(
      <CommunityContributionStep
        locale="uk"
        community={{
          ...COMMUNITY,
          viewer: {
            membershipState: "active",
            isModerator: false,
            eligibleJournals: [
              {
                id: "00000000-0000-4000-8000-000000000401",
                title: "Стара перевірка",
                entryDate: "2026-07-10",
                publicSlug: "old-check",
                objectDisplayName: "Томат",
                objectKind: "plant",
              },
              {
                id: "00000000-0000-4000-8000-000000000402",
                title: "Нова перевірка",
                entryDate: "2026-07-13",
                publicSlug: "new-check",
                objectDisplayName: "Томат",
                objectKind: "plant",
              },
            ],
          },
        }}
        viewer="member"
        communityPath="/communities/observation-and-care"
        freshEntryId="00000000-0000-4000-8000-000000000402"
      />,
    );

    expect(html).toContain('data-community-contribute-step="choose"');
    expect(html).toContain("Запис «Нова перевірка» опубліковано.");
    expect(html).toMatch(
      /<option value="00000000-0000-4000-8000-000000000402" selected="">/u,
    );
    // The composer, opened for this community and coming back to it.
    expect(html).toContain(
      'href="/garden/new?community=observation-and-care&amp;returnTo=%2Fcommunities%2Fobservation-and-care"',
    );
  });

  it("sends a member with nothing to add to write for this community", async () => {
    const { CommunityContributionStep } = await import("./public-community");
    const html = renderToStaticMarkup(
      <CommunityContributionStep
        locale="ru"
        community={{
          ...COMMUNITY,
          viewer: {
            membershipState: "active",
            isModerator: false,
            eligibleJournals: [],
          },
        }}
        viewer="member"
        communityPath="/ru/communities/observation-and-care"
        outcome="already_added"
      />,
    );

    expect(html).toContain('data-community-contribute-step="write"');
    expect(html).toContain("Эта запись уже есть в сообществе.");
    expect(html).toContain('data-action-outcome="already_added"');
    expect(html).toContain(
      'href="/garden/new?community=observation-and-care&amp;returnTo=%2Fru%2Fcommunities%2Fobservation-and-care"',
    );
    expect(html).toContain("Написать запись для сообщества");
  });

  it("says a banned member cannot add, and offers no control", async () => {
    const { CommunityContributionStep } = await import("./public-community");
    const html = renderToStaticMarkup(
      <CommunityContributionStep
        locale="uk"
        community={{
          ...COMMUNITY,
          viewer: {
            membershipState: "banned",
            isModerator: false,
            eligibleJournals: [],
          },
        }}
        viewer="member"
        communityPath="/communities/observation-and-care"
      />,
    );

    expect(html).toContain('data-community-contribute-step="banned"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain('href="/garden/new');
  });

  it("offers no report or block on the reader's own entry", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const own = {
      ...COMMUNITY,
      viewer: {
        membershipState: "active" as const,
        isModerator: false,
        eligibleJournals: [],
      },
      contributions: {
        items: COMMUNITY.contributions.items.map((item) => ({
          ...item,
          viewerIsAuthor: true,
        })),
        nextCursor: null,
      },
    };
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={own}
        viewer="member"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );

    expect(html).toContain('data-community-own-entry="true"');
    expect(html).toContain("Ваш запис");
    expect(html).not.toContain('data-auth-intent-control="report"');
    expect(html).not.toContain('data-auth-intent-control="block"');
  });

  it("offers no way in to a closed community's step", async () => {
    const { PublicCommunityView } = await import("./public-community");
    const html = renderToStaticMarkup(
      <PublicCommunityView
        locale="uk"
        community={{ ...COMMUNITY, participationState: "closed" }}
        viewer="guest"
        request={EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST}
      />,
    );

    expect(html).toContain("Нові внески тимчасово закриті модератором.");
    expect(html).not.toContain('id="community-contribute"');
    expect(html).not.toContain("data-community-add-entry");
  });
});
