import { postgresRejection } from "@test/postgres-rejection";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import type {
  NotificationEvent,
  NotificationObjectSubject,
  NotificationPage,
} from "@/server/social-return-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceViewer: vi.fn(),
  listNotificationCenterPage: vi.fn(),
}));

vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));
// Only the read is mocked: the grouping, the filter names and the categories
// are the repository's own, so the rows below are the rows a reader gets.
vi.mock("@/server/social-return-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/social-return-repository")
  >()),
  listNotificationCenterPage: mocks.listNotificationCenterPage,
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

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const CURSOR = "eyJjcmVhdGVkQXQiOjE3ODM4NzIwMDAwMDB9";
const uk = getSocialSurfaceCopy("uk").notifications;

// Two tomatoes on the balcony and two in the greenhouse, each added on its
// own day (`OVE-501`, criterion 1): four reminders that used to read the same.
const BALCONY_FIRST = tomato("20000000-0000-4000-8000-000000000001", {
  spaceName: "Балкон",
  addedOn: "2026-04-01",
  lastEntryDate: "2026-06-01",
});
const BALCONY_SECOND = tomato("20000000-0000-4000-8000-000000000002", {
  spaceName: "Балкон",
  addedOn: "2026-04-15",
});
const GREENHOUSE_FIRST = tomato("20000000-0000-4000-8000-000000000003", {
  spaceName: "Теплиця",
  addedOn: "2026-05-01",
  lastEntryDate: "2026-06-20",
});
const GREENHOUSE_SECOND = tomato("20000000-0000-4000-8000-000000000004", {
  spaceName: "Теплиця",
  addedOn: "2026-05-20",
});
const TWINS = [
  BALCONY_FIRST,
  BALCONY_SECOND,
  GREENHOUSE_FIRST,
  GREENHOUSE_SECOND,
];
const TWIN_KEYS = ["a", "b", "c", "d"].map((hex) => hex.repeat(32));

async function renderActivity(
  query: Record<string, string> = {},
  locale: string = "uk",
) {
  const { default: LocalizedNotificationsRoute } = await import("./page");
  return renderToStaticMarkup(
    await LocalizedNotificationsRoute({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve(query),
    }),
  );
}

describe("/{locale}/notifications", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.listNotificationCenterPage.mockResolvedValue(
      page([
        socialEvent({
          key: "e".repeat(32),
          kind: "claim",
          summaryKey: "claim_decided",
          actorMention: "@green_thumb",
          targetLabel: "Balcony tomato",
          href: "/garden/lineage/claims",
          actionKind: "review_claims",
          groupKey: "claim:safe",
        }),
      ]),
    );
  });

  it.each([
    ["uk", "Події | OverGarden", "/notifications"],
    ["bg", "Известия | OverGarden", "/bg/notifications"],
    ["ru", "События | OverGarden", "/ru/notifications"],
  ] as const)(
    "names the page and keeps it out of the index in %s",
    async (locale, title, canonical) => {
      const { generateMetadata } = await import("./page");

      await expect(
        generateMetadata({ params: Promise.resolve({ locale }) }),
      ).resolves.toMatchObject({
        title,
        description: getSocialSurfaceCopy(locale).notifications.description,
        alternates: { canonical },
        robots: { index: false, follow: false },
      });
    },
  );

  it.each([
    [
      "uk",
      // `system` is the reminders' old name: the way back uses the new one.
      { filter: "system", unread: "1", view: "individual", cursor: CURSOR },
      `/notifications?filter=reminders&amp;unread=1&amp;view=individual&amp;cursor=${CURSOR}`,
    ],
    [
      "bg",
      { filter: "comments", view: "individual" },
      "/bg/notifications?filter=comments&amp;view=individual",
    ],
  ] as const)(
    "asks a guest to sign in and brings them back to the same view in %s",
    async (locale, query, next) => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "sign-in-required",
      });

      const html = await renderActivity(query, locale);

      expect(html).toContain(`data-next="${next}"`);
      expect(html).toContain(getSocialSurfaceCopy(locale).notifications.signIn);
      expect(html).not.toContain("data-notification-list");
      expect(mocks.listNotificationCenterPage).not.toHaveBeenCalled();
    },
  );

  it("says the session could not be read, with a retry of the same view, instead of asking to sign in", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "unavailable",
      failure: describeWorkspaceFailure(postgresRejection("08006")),
    });

    const html = await renderActivity({ filter: "comments", unread: "1" });

    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).toContain(uk.loadErrorTitle);
    expect(html).toContain(
      'href="/notifications?filter=comments&amp;unread=1" data-workspace-retry="section"',
    );
    expect(html).not.toContain("data-sign-in-prompt");
    expect(html).not.toContain("data-notification-list");
    expect(html).not.toContain(uk.emptyTitle);
    expect(mocks.listNotificationCenterPage).not.toHaveBeenCalled();
  });

  it("renders a failed read as a failure with a retry of the same view, never as an empty list", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listNotificationCenterPage.mockRejectedValue(
      postgresRejection("57014"),
    );

    const html = await renderActivity({
      filter: "reminders",
      view: "individual",
    });

    expect(html).toContain('data-section-failure="query_timeout"');
    expect(html).toContain(uk.loadErrorTitle);
    expect(html).toContain(
      'href="/notifications?filter=reminders&amp;view=individual" data-workspace-retry="section"',
    );
    expect(html).not.toContain("data-notification-list");
    expect(html).not.toContain(uk.emptyTitle);
    expect(html).not.toContain(
      getSocialSurfaceCopy("uk").common.noResultsTitle,
    );
    // The filters stay, so the reader can still change the view.
    expect(html).toContain('data-notification-filters="true"');
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: "workspace_section_degraded",
      surface: "notifications",
      section: "events",
      failureClass: "query_timeout",
    });
    log.mockRestore();
  });

  it("tells four same-named reminders apart and opens the composer for exactly each one", async () => {
    mocks.listNotificationCenterPage.mockResolvedValue(
      page(
        TWINS.map((object, index) =>
          reminderEvent(TWIN_KEYS[index]!, object, `2026-07-0${4 - index}`),
        ),
      ),
    );

    const html = await renderActivity({ filter: "reminders" });

    expect(mocks.listNotificationCenterPage).toHaveBeenCalledWith(SCOPE, "uk", {
      filter: "reminders",
      unreadOnly: false,
      cursor: null,
    });
    const abouts = [
      ...html.matchAll(/data-notification-about="true">([^<]*)<\/span>/gu),
    ].map((match) => match[1]);
    expect(abouts).toEqual([
      `Томат · Рослина · Балкон · Solanum lycopersicum · додано ${day("2026-04-01")}`,
      `Томат · Рослина · Балкон · Solanum lycopersicum · додано ${day("2026-04-15")}`,
      `Томат · Рослина · Теплиця · Solanum lycopersicum · додано ${day("2026-05-01")}`,
      `Томат · Рослина · Теплиця · Solanum lycopersicum · додано ${day("2026-05-20")}`,
    ]);
    expect(new Set(abouts).size).toBe(4);
    expect(
      [...html.matchAll(/data-notification-write="([^"]*)"/gu)].map(
        (match) => match[1],
      ),
    ).toEqual(TWINS.map((object) => object.id));

    const writeLabels = TWINS.map((object, index) => {
      const key = TWIN_KEYS[index]!;
      const row = elementWith(html, `id="notification-${key}"`, "li");
      expect(row).toContain('data-notification-row="reminder"');
      expect(row).toContain('data-notification-read="false"');
      expect(row).toContain('data-notification-unread-count="1"');
      // The title link is described by what it is about and when.
      expect(row).toContain(
        `aria-describedby="notification-${key}-about notification-${key}-meta"`,
      );
      expect(row).toContain(
        `data-notification-origin="reminder">${uk.reminderOrigin}</span>`,
      );
      // Write opens this plant's composer, and Close comes back to this row.
      expect(row).toContain(
        `href="/garden/new?object=${object.id}&amp;returnTo=%2Fnotifications%3Ffilter%3Dreminders%23notification-${key}"`,
      );
      // A reminder is a note about a date, never an alarm.
      expect(row).not.toMatch(/Час|уваги|потребує/u);
      return attribute(
        tagWith(row, `data-notification-write="${object.id}"`),
        "aria-label",
      );
    });
    // A screen reader hears four different Write buttons too.
    expect(new Set(writeLabels).size).toBe(4);
    expect(writeLabels[0]).toBe(
      `Записати: Томат · Балкон · Solanum lycopersicum · додано ${day("2026-04-01")}`,
    );

    // When each was last written about, as the garden list says it.
    const written = elementWith(
      html,
      `id="notification-${TWIN_KEYS[0]}"`,
      "li",
    );
    expect(written).toContain('data-notification-last-entry="2026-06-01"');
    expect(written).toContain("Останній запис: ");
    expect(written).toContain('<time dateTime="2026-06-01">');
    const never = elementWith(html, `id="notification-${TWIN_KEYS[1]}"`, "li");
    expect(never).toContain(
      `data-notification-last-entry="never">${uk.never}</span>`,
    );
  });

  it("tells twins added on the same day apart by the minute", async () => {
    const morning = tomato("20000000-0000-4000-8000-000000000007", {
      addedAt: "2026-04-01T09:00Z",
    });
    const afternoon = tomato("20000000-0000-4000-8000-000000000008", {
      addedAt: "2026-04-01T14:30Z",
    });
    mocks.listNotificationCenterPage.mockResolvedValue(
      page([
        reminderEvent("7".repeat(32), morning, "2026-07-02"),
        reminderEvent("8".repeat(32), afternoon, "2026-07-01"),
      ]),
    );

    const html = await renderActivity();

    const abouts = [
      ...html.matchAll(/data-notification-about="true">([^<]*)<\/span>/gu),
    ].map((match) => match[1]);
    expect(abouts).toEqual([
      `Томат · Рослина · Балкон · Solanum lycopersicum · додано ${day("2026-04-01")} о 09:00`,
      `Томат · Рослина · Балкон · Solanum lycopersicum · додано ${day("2026-04-01")} о 14:30`,
    ]);
  });

  it("tells repeated rows apart by the variety before the day they were added", async () => {
    const cherry = tomato("20000000-0000-4000-8000-000000000005", {
      variety: "Черрі",
    });
    const oxheart = tomato("20000000-0000-4000-8000-000000000006", {
      variety: "Бичаче серце",
    });
    const alone = tomato("20000000-0000-4000-8000-000000000007", {
      spaceName: "Теплиця",
    });
    mocks.listNotificationCenterPage.mockResolvedValue(
      page([
        reminderEvent("1".repeat(32), cherry, "2026-07-03"),
        reminderEvent("2".repeat(32), oxheart, "2026-07-02"),
        reminderEvent("3".repeat(32), alone, "2026-07-01"),
      ]),
    );

    const html = await renderActivity();

    expect(
      [
        ...html.matchAll(/data-notification-about="true">([^<]*)<\/span>/gu),
      ].map((match) => match[1]),
    ).toEqual([
      "Томат · Рослина · Балкон · Solanum lycopersicum · Черрі",
      "Томат · Рослина · Балкон · Solanum lycopersicum · Бичаче серце",
      // Nothing else reads like it, so nothing is added.
      "Томат · Рослина · Теплиця · Solanum lycopersicum",
    ]);
    expect(html).not.toContain("додано");
  });

  it("names who acted on a social row, a group's unread part, and the count the header reads back", async () => {
    const onBalcony = tomato("20000000-0000-4000-8000-000000000008");
    const comment = {
      kind: "comment",
      summaryKey: "comment_on_journal",
      targetLabel: "Полив",
      object: onBalcony,
      href: "/@olena/post/3",
      actionKind: "open_journal",
      groupKey: "journal-3",
    } as const;
    mocks.listNotificationCenterPage.mockResolvedValue(
      page(
        [
          socialEvent({
            ...comment,
            key: "1".repeat(32),
            createdAt: "2026-07-13T12:00:00.000Z",
            actorMention: "@anna",
          }),
          socialEvent({
            ...comment,
            key: "2".repeat(32),
            createdAt: "2026-07-13T11:00:00.000Z",
            actorMention: "@bohdan",
            read: true,
          }),
          socialEvent({
            ...comment,
            key: "3".repeat(32),
            createdAt: "2026-07-13T10:00:00.000Z",
            actorMention: "@vira",
          }),
          socialEvent({
            ...comment,
            key: "4".repeat(32),
            createdAt: "2026-07-13T09:00:00.000Z",
            actorMention: "@galyna",
          }),
          socialEvent({
            key: "5".repeat(32),
            kind: "profile_follow",
            summaryKey: "profile_followed",
            createdAt: "2026-07-13T08:00:00.000Z",
            // The follower's public profile is gone.
            actorMention: null,
            targetLabel: null,
            href: "/@olena",
            actionKind: "open_profile",
            groupKey: "profile-follows",
            read: true,
          }),
        ],
        3,
      ),
    );

    const html = await renderActivity();
    const group = elementWith(
      html,
      `id="notification-${"1".repeat(32)}"`,
      "li",
    );
    const follow = elementWith(
      html,
      `id="notification-${"5".repeat(32)}"`,
      "li",
    );

    expect(group).toContain(`${uk.summaries.comment_on_journal} (4)`);
    expect(group).toContain(
      'data-notification-about="true">«Полив» · Томат · Балкон</span>',
    );
    expect(group).toContain(
      'data-notification-origin="social">Від @anna, @bohdan та ще 2</span>',
    );
    expect(group).toContain('data-notification-unread-count="3"');
    expect(group).toContain(">Непрочитані: 3</span>");
    // One control marks the whole group, all four events at once.
    const readForm = elementWith(
      group,
      'data-notification-receipt="read"',
      "form",
    );
    expect(readForm.match(/name="eventKey"/gu)).toHaveLength(4);
    expect(follow).toContain(
      'data-notification-origin="social">Від іншого садівника</span>',
    );
    expect(follow).toContain('data-notification-read="true"');
    expect(follow).not.toContain("data-notification-about");
    expect(follow).toContain(
      `aria-describedby="notification-${"5".repeat(32)}-meta"`,
    );
    expect(html).toContain('data-my-social-count="3"');
    expect(html).toContain(">Непрочитані: 3</p>");
    expect(
      attribute(
        tagWith(html, 'data-notification-settings-link="true"'),
        "href",
      ),
    ).toBe("/notifications/settings");
  });

  it("says a failed receipt beside the row it was for", async () => {
    mocks.listNotificationCenterPage.mockResolvedValue(
      page(
        TWINS.map((object, index) =>
          reminderEvent(TWIN_KEYS[index]!, object, `2026-07-0${4 - index}`),
        ),
      ),
    );

    const html = await renderActivity({
      filter: "reminders",
      receipt: "failed",
      event: TWIN_KEYS[1]!,
    });
    const row = elementWith(html, `id="notification-${TWIN_KEYS[1]}"`, "li");

    expect(row).toContain('data-notification-outcome="failed"');
    expect(row).toContain('role="alert"');
    expect(row).toContain(uk.outcome.failed);
    expect(html.match(/data-notification-outcome=/gu)).toHaveLength(1);
    expect(html).not.toContain('id="notification-outcome"');
  });

  it("says a dismissal above the list, where the row has gone from", async () => {
    mocks.listNotificationCenterPage.mockResolvedValue(
      page([reminderEvent(TWIN_KEYS[0]!, BALCONY_FIRST, "2026-07-04")]),
    );

    const html = await renderActivity({
      receipt: "dismissed",
      event: "f".repeat(32),
    });
    const notice = elementWith(html, 'id="notification-outcome"', "div");

    expect(notice).toContain('data-notification-outcome="dismissed"');
    expect(notice).toContain('role="status"');
    expect(notice).toContain(uk.outcome.dismissed);
    expect(html.indexOf('id="notification-outcome"')).toBeLessThan(
      html.indexOf("data-notification-list"),
    );
    expect(html.match(/data-notification-outcome=/gu)).toHaveLength(1);
  });

  it("links the settings in the reader's language and counts the unread in their words", async () => {
    const html = await renderActivity({}, "bg");
    const bg = getSocialSurfaceCopy("bg");

    expect(html).toContain('lang="bg"');
    expect(html).toContain(`>${bg.notifications.title}</h1>`);
    expect(
      attribute(
        tagWith(html, 'data-notification-settings-link="true"'),
        "href",
      ),
    ).toBe("/bg/notifications/settings");
    expect(html).toContain(`>${bg.common.unreadCount(1)}</p>`);
  });

  it("renders bounded notification events without private payload fields", async () => {
    const html = await renderActivity();

    expect(mocks.listNotificationCenterPage).toHaveBeenCalledWith(
      SCOPE,
      "uk",
      expect.objectContaining({ filter: "all", unreadOnly: false }),
    );
    expect(html).toContain(uk.title);
    expect(html).toContain(uk.summaries.claim_decided);
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("/garden/lineage/claims");
    expect(html).toContain("/api/notifications/receipts");
    // The filters are chips over a GET form now, not a bordered box of links:
    // `aria-pressed` is valid on a button and an ARIA error on a link, which
    // is why the box had to go (DESIGN.md §5.1).
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*aria-pressed="true"/u);
    expect(html).not.toMatch(/<a[^>]*aria-pressed=/u);
    // AC3: the reader is told what happened, to what, when — and unread is a
    // word as well as a mark (DESIGN.md §8: never colour alone).
    expect(html).toContain('data-notification-read="false"');
    expect(html).toContain(uk.unreadBadge);
    expect(html).toContain("<time");
    expect(html).not.toMatch(
      /00000000-0000|session-1|journal body|private journal|quarantine|derivative|media key|ip_address|user_agent|email|phone|coordinates|invite|token|source_reference_label|client_mutation/i,
    );
  });
});

function page(
  items: NotificationEvent[],
  unreadCount = items.filter((item) => !item.read).length,
): NotificationPage {
  return { items, nextCursor: null, unreadCount };
}

function tomato(
  id: string,
  overrides: Partial<NotificationObjectSubject> = {},
): NotificationObjectSubject {
  return {
    id,
    name: "Томат",
    objectKind: "plant",
    spaceName: "Балкон",
    species: "Solanum lycopersicum",
    variety: null,
    addedOn: "2026-04-01",
    addedAt: `${overrides.addedOn ?? "2026-04-01"}T09:00Z`,
    lastEntryDate: null,
    ...overrides,
  };
}

function reminderEvent(
  key: string,
  object: NotificationObjectSubject,
  day: string,
): NotificationEvent {
  return {
    key,
    kind: "system",
    category: "reminder",
    summaryKey: "stale_journal_prompt",
    createdAt: `${day}T00:00:00.000Z`,
    actorMention: null,
    targetLabel: object.name,
    object,
    href: `/garden/objects/${object.id}`,
    actionKind: "continue_journal",
    groupKey: `stale-${object.id}`,
    read: false,
  };
}

function socialEvent(
  overrides: Partial<NotificationEvent> &
    Pick<NotificationEvent, "key" | "kind" | "summaryKey">,
): NotificationEvent {
  return {
    category: "social",
    createdAt: "2026-07-04T08:00:00.000Z",
    actorMention: "@green_thumb",
    targetLabel: null,
    object: null,
    href: "/notifications",
    actionKind: "open_journal",
    groupKey: overrides.key,
    read: false,
    ...overrides,
  };
}

/** A day as the page writes it: "додано 1 квіт. 2026 р.". */
function day(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("uk", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The element of `tag` that carries `marker`, children and all. */
function elementWith(html: string, marker: string, tag: string): string {
  const at = html.indexOf(marker);
  if (at < 0) return "";
  const start = html.lastIndexOf(`<${tag}`, at);
  const pattern = new RegExp(`<${tag}[\\s>]|</${tag}>`, "gu");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  return html.slice(start);
}

/** The opening tag that carries `marker`. */
function tagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  if (at < 0) return "";
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

function attribute(tag: string, name: string) {
  return new RegExp(`\\s${name}="([^"]*)"`, "u")
    .exec(tag)?.[1]
    ?.replaceAll("&amp;", "&");
}
