import { postgresRejection } from "@test/postgres-rejection";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getModerationCopy } from "@/lib/moderation-copy";
import {
  CommunityMutationError,
  type CommunityModerationQueue,
} from "@/server/community-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  resolveWorkspaceViewer: vi.fn(),
  listCommunityModerationQueue: vi.fn(),
  confirmSubmit: vi.fn(),
}));

// The repository is imported for real so the page classifies a refusal with
// the real `communityMutationRefusal`; it must not open a pool on the way,
// because every read here is a mock.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));
vi.mock("@/server/community-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/community-repository")>()),
  listCommunityModerationQueue: mocks.listCommunityModerationQueue,
}));
vi.mock("@/app/(default)/account/communities/[slug]/actions", () => ({
  moderateCommunityContributionAction: vi.fn(),
  moderateCommunityDiscussionAction: vi.fn(),
  moderateCommunityMembershipAction: vi.fn(),
  resolveCommunityReportAction: vi.fn(),
  setCommunityParticipationAction: vi.fn(),
}));
// The question lives in a dialog that opens on hydration, so it is not in the
// served markup. The real control still renders — its submit button is what
// works before the bundle does — and the spy records what it was told to ask.
vi.mock("@/components/ui/confirm-submit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/confirm-submit")>();
  return {
    ConfirmSubmit: (
      props: React.ComponentProps<typeof actual.ConfirmSubmit>,
    ) => {
      mocks.confirmSubmit(props);
      return <actual.ConfirmSubmit {...props} />;
    },
  };
});
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

const SLUG = "observation-and-care";
const SETTINGS_PATH = `/account/communities/${SLUG}/settings`;
const FORM_ID = `community-participation-${SLUG}`;
const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000901",
  sessionId: "moderator-session",
};

const uk = getModerationCopy("uk");

function queue(
  community: Partial<
    Pick<
      CommunityModerationQueue["community"],
      "lifecycleState" | "participationState"
    >
  > = {},
) {
  const read: Pick<
    CommunityModerationQueue["community"],
    "id" | "slug" | "contentKey" | "lifecycleState" | "participationState"
  > = {
    id: "00000000-0000-4000-8000-000000000184",
    slug: SLUG,
    contentKey: "observation-and-care",
    lifecycleState: "active",
    participationState: "open",
    ...community,
  };
  return {
    community: read,
    view: "open",
    items: [],
    counts: { open: 0, resolved: 0 },
  };
}

async function renderSettings(
  searchParams: Record<string, string> = {},
  slug = SLUG,
): Promise<string> {
  const { default: CommunityModerationSettingsPage } = await import("./page");
  return renderToStaticMarkup(
    await CommunityModerationSettingsPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("/account/communities/:slug/settings — accepting new entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.listCommunityModerationQueue.mockResolvedValue(queue());
  });

  describe("who may change it", () => {
    it("asks a guest to sign in and reads nothing", async () => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "sign-in-required",
      });

      const html = await renderSettings({ result: "done" });

      expect(html).toContain(
        'data-operator-surface="community-moderation-settings"',
      );
      expect(html).toContain('data-operator-access-state="sign-in-required"');
      expect(html).toContain(`data-next="${SETTINGS_PATH}"`);
      expect(html).not.toContain("<form");
      expect(html).not.toContain("data-action-outcome");
      expect(html).not.toContain("data-moderation-tabs");
      expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
    });

    it("says the session could not be read, instead of asking a signed-in moderator to sign in", async () => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "unavailable",
        failure: describeWorkspaceFailure(postgresRejection("08006")),
      });

      const html = await renderSettings();

      expect(html).toContain('data-operator-access-state="unavailable"');
      expect(html).toContain('data-section-failure="connection_unavailable"');
      expect(html).not.toContain("<form");
      expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
    });

    // The read is the access check — the same rule every mutation asks — so
    // a refusal is the only thing this page learns, and all it says.
    it("tells a reader who may not moderate this community so, and offers no control", async () => {
      mocks.listCommunityModerationQueue.mockRejectedValue(
        new CommunityMutationError("moderation_denied"),
      );

      const html = await renderSettings({ result: "done" });

      expect(html).toContain('data-operator-access-state="denied"');
      expect(html).toContain(uk.accessDenied);
      expect(mocks.listCommunityModerationQueue).toHaveBeenCalledTimes(1);
      expect(mocks.listCommunityModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        SLUG,
      );
      for (const leak of [
        "<form",
        "data-moderation-action",
        "data-action-outcome",
        "data-moderation-tabs",
        uk.settings.open,
        uk.settings.closed,
        "Спостереження і догляд",
      ]) {
        expect(html, leak).not.toContain(leak);
      }
    });

    it("answers 404 for a community that does not exist", async () => {
      mocks.listCommunityModerationQueue.mockRejectedValue(
        new CommunityMutationError("community_unavailable"),
      );

      await expect(renderSettings()).rejects.toThrowError(
        /NEXT_HTTP_ERROR_FALLBACK;404/u,
      );
    });

    it("answers 404 for a slug nobody can spell, before any read", async () => {
      await expect(renderSettings({}, "Not A Slug")).rejects.toThrowError(
        /NEXT_HTTP_ERROR_FALLBACK;404/u,
      );
      expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
    });

    it("renders a failed read as its failure class, with a retry to the same page", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.listCommunityModerationQueue.mockRejectedValue(
        postgresRejection("57014"),
      );

      const html = await renderSettings();

      expect(html).toContain('data-operator-access-state="unavailable"');
      expect(html).toContain('data-section-failure="query_timeout"');
      expect(html).toContain(
        `href="${SETTINGS_PATH}" data-workspace-retry="section"`,
      );
      expect(html).not.toContain("<form");
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        event: "workspace_section_degraded",
        surface: "community-moderation-settings",
        section: "participation",
        failureClass: "query_timeout",
      });
      log.mockRestore();
    });
  });

  describe("the one setting", () => {
    // Closing turns people away, so it says what stops and what stays, and
    // asks first.
    it("says an open community takes entries, and asks before closing it", async () => {
      const html = await renderSettings();
      const form = elementWith(html, `id="${FORM_ID}"`, "form");

      expect(html).toContain('data-operator-access-state="allowed"');
      expect(mocks.listCommunityModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        SLUG,
      );
      expect(html).toContain(uk.settings.title);
      expect(html).toContain(uk.settings.open);
      expect(hiddenFields(form)).toEqual({
        slug: SLUG,
        reason: "rule_violation",
        participationState: "closed",
      });
      expect(form).toContain('data-moderation-action="close-participation"');
      expect(form).toContain(`data-confirm-submit="${FORM_ID}"`);
      expect(form).toContain(`form="${FORM_ID}"`);
      expect(form).toContain(uk.settings.close);
      expect(mocks.confirmSubmit).toHaveBeenCalledTimes(1);
      expect(mocks.confirmSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          formId: FORM_ID,
          label: uk.settings.close,
          title: uk.settings.confirmCloseTitle,
          description: uk.settings.confirmCloseBody,
          confirmLabel: uk.settings.close,
          cancelLabel: uk.cancel,
          pendingLabel: uk.pending,
        }),
      );
    });

    // Reopening takes nothing away from anybody: one press, no question.
    it("says a closed community takes nothing new, and reopens it in one press", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue({ participationState: "closed" }),
      );

      const html = await renderSettings();
      const form = elementWith(html, `id="${FORM_ID}"`, "form");

      expect(html).toContain(uk.settings.closed);
      expect(hiddenFields(form)).toEqual({
        slug: SLUG,
        reason: "rule_violation",
        participationState: "open",
      });
      expect(form).toContain('data-moderation-action="open-participation"');
      expect(form).toContain('type="submit"');
      expect(form).toContain(uk.settings.reopen);
      expect(html).not.toContain("data-confirm-submit");
      expect(mocks.confirmSubmit).not.toHaveBeenCalled();
    });

    it("offers no control on an archived community, and says why", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue({ lifecycleState: "archived", participationState: "open" }),
      );

      const html = await renderSettings();

      expect(html).toContain(uk.settings.archived);
      expect(html).not.toContain("<form");
      expect(html).not.toContain("data-moderation-action");
    });

    it("links the community's two sections, the settings marked as current", async () => {
      const html = await renderSettings();
      const tabs = elementWith(html, 'data-moderation-tabs="true"', "nav");

      expect(tabs).toMatch(
        new RegExp(
          `<a aria-current="page"[^>]*href="${SETTINGS_PATH}">${uk.community.tabs.settings}</a>`,
          "u",
        ),
      );
      expect(tabs).toMatch(
        new RegExp(
          `<a (?![^>]*aria-current)[^>]*href="/account/communities/${SLUG}">${uk.community.tabs.reports}</a>`,
          "u",
        ),
      );
    });
  });

  describe("what the last change did", () => {
    it("says nothing when no change came back", async () => {
      const html = await renderSettings();

      expect(html).not.toContain("data-action-outcome");
    });

    it.each([
      ["done", uk.outcome.savedTitle, null],
      ["stale", uk.outcome.staleTitle, uk.outcome.staleBody],
      ["failed", uk.outcome.failedTitle, uk.outcome.failedBody],
      ["denied", uk.outcome.deniedTitle, uk.outcome.deniedBody],
    ] as const)(
      "reads %s back above the setting",
      async (result, title, body) => {
        const html = await renderSettings({ result });
        const notice = elementWith(
          html,
          `data-action-outcome="${result}"`,
          "div",
        );

        expect(notice).toContain(title);
        if (body) expect(notice).toContain(body);
        // The community as it stands now, in a phrase the notice frames — not
        // the section's own sentence, which already says "now" and ends in a
        // full stop.
        expect(notice).toContain(
          '<p data-moderation-now="true">Зараз: спільнота приймає нових учасників і записи.</p>',
        );
        expect(html).not.toContain("Зараз: Зараз");
        expect(notice).not.toContain("..");
        expect(html.indexOf("data-action-outcome")).toBeLessThan(
          html.indexOf('id="community-participation"'),
        );
      },
    );

    it("reads a closed community back as closed", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue({ participationState: "closed" }),
      );

      const html = await renderSettings({ result: "done" });

      expect(html).toContain(
        '<p data-moderation-now="true">Зараз: нові учасники й записи не приймаються.</p>',
      );
      expect(html).not.toContain("Зараз: Зараз");
    });

    it("ignores a result it does not know", async () => {
      const html = await renderSettings({ result: "maybe" });

      expect(html).not.toContain("data-action-outcome");
    });
  });

  it.each(["bg", "ru"] as const)(
    "speaks %s to a moderator who reads it",
    async (locale) => {
      const copy = getModerationCopy(locale);
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);

      const html = await renderSettings({ result: "done" });

      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(copy.settings.title);
      expect(html).toContain(copy.settings.open);
      expect(html).toContain(copy.settings.close);
      expect(html).toContain(copy.outcome.savedTitle);
      expect(html).toContain(
        `<p data-moderation-now="true">${copy.outcome.now}: ${copy.settings.nowOpen}.</p>`,
      );
      expect(html).not.toContain(`${copy.outcome.now}: ${copy.settings.open}`);
      expect(html).toContain(`href="/${locale}/communities/${SLUG}"`);
      expect(html).not.toContain(uk.settings.close);
      expect(mocks.confirmSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: copy.settings.confirmCloseTitle,
          cancelLabel: copy.cancel,
        }),
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

/** What one form posts, by field name. */
function hiddenFields(form: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(
      form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"\/>/gu),
      (match) => [match[1], match[2]],
    ),
  );
}
