import { postgresRejection } from "@test/postgres-rejection";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getModerationCopy } from "@/lib/moderation-copy";
import type { ModeratedCommunity } from "@/server/community-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  resolveWorkspaceViewer: vi.fn(),
  listModeratedCommunities: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));
vi.mock("@/server/community-repository", () => ({
  listModeratedCommunities: mocks.listModeratedCommunities,
}));
// Mocked only to prove nobody asks it: who may moderate is the repository's
// one rule, not an operator check in front of it.
vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: { next?: string; locale?: string }) => (
    <section
      data-sign-in-prompt="true"
      data-next={props.next ?? ""}
      data-locale={props.locale ?? ""}
    >
      Sign in prompt
    </section>
  ),
}));

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000901",
  sessionId: "moderator-session",
};

const uk = getModerationCopy("uk");

function community(
  overrides: Partial<ModeratedCommunity> = {},
): ModeratedCommunity {
  return {
    id: "00000000-0000-4000-8000-000000000184",
    slug: "observation-and-care",
    contentKey: "observation-and-care",
    topicSlug: "observation-and-care",
    topicLabel: "Спостереження і догляд",
    lifecycleState: "active",
    participationState: "open",
    openReportCount: 3,
    ...overrides,
  };
}

const QUIET_CLOSED = community({
  id: "00000000-0000-4000-8000-000000000185",
  slug: "visual-new-community",
  contentKey: "visual-new-community",
  participationState: "closed",
  openReportCount: 0,
});

const ARCHIVED = community({
  id: "00000000-0000-4000-8000-000000000186",
  slug: "visual-care-across-every-living-object",
  contentKey: "visual-care-across-every-living-object",
  lifecycleState: "archived",
  participationState: "closed",
  openReportCount: 0,
});

async function renderDirectory(): Promise<string> {
  const { default: CommunityModerationDirectory } = await import("./page");
  return renderToStaticMarkup(await CommunityModerationDirectory());
}

describe("/account/communities — the communities a reader may moderate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.listModeratedCommunities.mockResolvedValue([community()]);
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "denied",
    });
    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      new Error("Admin access denied."),
    );
  });

  it("asks a guest to sign in, and reads nothing", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "sign-in-required",
    });

    const html = await renderDirectory();

    expect(html).toContain('data-operator-surface="communities-moderation"');
    expect(html).toContain('data-operator-access-state="sign-in-required"');
    expect(html).toContain(uk.communities.title);
    expect(html).toContain('data-next="/account/communities"');
    expect(html).not.toContain("data-private-moderation-queue");
    expect(html).not.toContain("data-moderation-tabs");
    expect(mocks.listModeratedCommunities).not.toHaveBeenCalled();
  });

  it("says the session could not be read, instead of asking a signed-in moderator to sign in", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "unavailable",
      failure: describeWorkspaceFailure(postgresRejection("08006")),
    });

    const html = await renderDirectory();

    expect(html).toContain('data-operator-access-state="unavailable"');
    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).not.toContain("data-sign-in-prompt");
    expect(mocks.listModeratedCommunities).not.toHaveBeenCalled();
  });

  // Nothing to moderate is an answer about the reader, not about the
  // communities: an empty list would read as "all quiet".
  it("tells a reader who moderates nothing that they have no access, not that all is quiet", async () => {
    mocks.listModeratedCommunities.mockResolvedValue(null);

    const html = await renderDirectory();

    expect(html).toContain('data-operator-access-state="denied"');
    expect(html).toContain(uk.accessDenied);
    expect(html).not.toContain(uk.communities.empty);
    expect(html).not.toContain("data-private-moderation-queue");
    expect(html).not.toContain("data-moderated-community");
    expect(html).not.toContain("data-moderation-tabs");
    expect(mocks.listModeratedCommunities).toHaveBeenCalledTimes(1);
    expect(mocks.listModeratedCommunities).toHaveBeenCalledWith(SCOPE);
  });

  it("says in words when there is no community yet", async () => {
    mocks.listModeratedCommunities.mockResolvedValue([]);

    const html = await renderDirectory();

    expect(html).toContain('data-operator-access-state="allowed"');
    expect(html).toContain(uk.communities.empty);
    expect(html).not.toContain("data-moderated-community");
  });

  // `OVE-500`, criterion 5. The page used to be one hard-coded card for
  // `observation-and-care`, behind an operator-only check — so a second
  // community had no way in, and a moderator the server would let act was
  // shown "unavailable".
  it("lists every community the repository says this reader moderates, with no operator check in front", async () => {
    mocks.listModeratedCommunities.mockResolvedValue([
      community(),
      QUIET_CLOSED,
      ARCHIVED,
    ]);

    const html = await renderDirectory();

    expect(html).toContain('data-operator-access-state="allowed"');
    expect(html).toContain('data-private-moderation-queue="true"');
    expect(html.match(/data-moderated-community=/gu)?.length ?? 0).toBe(3);
    expect(mocks.resolveAdminCapabilityAccessBounded).not.toHaveBeenCalled();
    expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
  });

  it("gives each community its name, its state, the work waiting in it, and both of its pages", async () => {
    mocks.listModeratedCommunities.mockResolvedValue([
      community(),
      QUIET_CLOSED,
      ARCHIVED,
    ]);

    const html = await renderDirectory();
    const busy = elementWith(
      html,
      'data-moderated-community="observation-and-care"',
      "li",
    );
    const quiet = elementWith(
      html,
      'data-moderated-community="visual-new-community"',
      "li",
    );
    const archived = elementWith(
      html,
      'data-moderated-community="visual-care-across-every-living-object"',
      "li",
    );

    expect(busy).toMatch(
      /<a [^>]*href="\/account\/communities\/observation-and-care"[^>]*>Спостереження і догляд<\/a>/u,
    );
    expect(busy).toContain(uk.communities.states.open);
    expect(busy).toContain("Відкритих скарг: 3");
    expect(busy).toContain('data-moderated-community-open-reports="true"');
    expect(busy).toMatch(
      /<a [^>]*href="\/communities\/observation-and-care"[^>]*>Сторінка спільноти<\/a>/u,
    );

    expect(quiet).toContain("Нова спільнота без записів");
    expect(quiet).toContain(uk.communities.states.closed);
    expect(quiet).toContain('href="/account/communities/visual-new-community"');
    // DESIGN.md §5.10: a count of zero is the absence of a fact. An empty
    // queue says so in words, and no row of zeros is printed.
    expect(quiet).toContain(uk.communities.noOpenReports);
    expect(quiet).not.toContain("data-moderated-community-open-reports");

    // An archived community says so, whatever its participation state.
    expect(archived).toContain(uk.communities.states.archived);
    expect(archived).not.toContain(uk.communities.states.closed);

    expect(html).not.toMatch(/: 0</u);
  });

  it("links the two moderation areas, the communities marked as current", async () => {
    const html = await renderDirectory();
    const areas = elementWith(html, 'data-moderation-tabs="true"', "nav");

    expect(areas).toContain(`aria-label="${uk.sections.label}"`);
    expect(areas).toMatch(
      /<a aria-current="page"[^>]*href="\/account\/communities">Спільноти<\/a>/u,
    );
    expect(areas).toMatch(
      /<a (?![^>]*aria-current)[^>]*href="\/account\/moderation\/comments">Коментарі<\/a>/u,
    );
  });

  it("renders a failed read as its failure class, never as an empty list", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listModeratedCommunities.mockRejectedValue(
      postgresRejection("57014"),
    );

    const html = await renderDirectory();

    expect(html).toContain('data-operator-access-state="unavailable"');
    expect(html).toContain('data-section-failure="query_timeout"');
    expect(html).toContain(
      'href="/account/communities" data-workspace-retry="section"',
    );
    expect(html).not.toContain(uk.communities.empty);
    expect(html).not.toContain("data-private-moderation-queue");
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: "workspace_section_degraded",
      surface: "communities-moderation",
      section: "communities",
      failureClass: "query_timeout",
    });
    log.mockRestore();
  });

  // The public page has no workspace twin, so its link carries the reader's
  // language prefix; the moderation page itself does not.
  it.each([
    ["uk", "Спостереження і догляд", "/communities/observation-and-care"],
    ["bg", "Наблюдения и грижи", "/bg/communities/observation-and-care"],
    ["ru", "Наблюдения и уход", "/ru/communities/observation-and-care"],
  ] as const)(
    "speaks %s, and links the public page in that language",
    async (locale, name, publicHref) => {
      const copy = getModerationCopy(locale);
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      mocks.listModeratedCommunities.mockResolvedValue([
        community(),
        QUIET_CLOSED,
      ]);

      const html = await renderDirectory();
      const card = elementWith(
        html,
        'data-moderated-community="observation-and-care"',
        "li",
      );

      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(copy.communities.title);
      expect(html).toContain(copy.communities.noOpenReports);
      expect(card).toContain(name);
      expect(card).toContain(
        copy.communities.openReports.replace("{count}", "3"),
      );
      expect(card).toContain(copy.communities.states.open);
      expect(card).toContain(`href="${publicHref}"`);
      expect(card).toContain(
        'href="/account/communities/observation-and-care"',
      );
    },
  );
});

/** The element that carries `marker`, with everything inside it. */
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
