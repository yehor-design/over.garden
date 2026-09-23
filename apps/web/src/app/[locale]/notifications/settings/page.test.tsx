import { postgresRejection } from "@test/postgres-rejection";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import type { NotificationPreferences } from "@/server/social-return-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceViewer: vi.fn(),
  getNotificationPreferences: vi.fn(),
}));

vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));
vi.mock("@/server/social-return-repository", () => ({
  getNotificationPreferences: mocks.getNotificationPreferences,
}));
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: { next?: string; description?: string }) => (
    <section data-sign-in-prompt="true" data-next={props.next ?? ""}>
      Sign in prompt
      {props.description ?? ""}
    </section>
  ),
}));

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const PREFERENCES: NotificationPreferences = {
  comments: true,
  replies: false,
  follows: true,
  mentions: false,
  claims: true,
  system: false,
};
const uk = getSocialSurfaceCopy("uk").notifications.settingsPage;

async function renderSettings(
  query: Record<string, string> = {},
  locale: string = "uk",
) {
  const { default: NotificationSettingsRoute } = await import("./page");
  return renderToStaticMarkup(
    await NotificationSettingsRoute({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve(query),
    }),
  );
}

describe("/{locale}/notifications/settings (OVE-501)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.getNotificationPreferences.mockResolvedValue(PREFERENCES);
  });

  it.each([
    ["uk", "Налаштування подій | OverGarden", "/notifications/settings"],
    [
      "bg",
      "Настройки на известията | OverGarden",
      "/bg/notifications/settings",
    ],
    ["ru", "Настройки событий | OverGarden", "/ru/notifications/settings"],
  ] as const)(
    "names the page and keeps it out of the index in %s",
    async (locale, title, canonical) => {
      const { generateMetadata } = await import("./page");

      await expect(
        generateMetadata({ params: Promise.resolve({ locale }) }),
      ).resolves.toMatchObject({
        title,
        alternates: { canonical },
        robots: { index: false, follow: false },
      });
    },
  );

  it.each([
    ["uk", "/notifications/settings"],
    ["bg", "/bg/notifications/settings"],
  ] as const)(
    "asks a guest in %s to sign in and brings them back here, reading nothing",
    async (locale, next) => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "sign-in-required",
      });

      const html = await renderSettings({}, locale);

      expect(html).toContain(`data-next="${next}"`);
      expect(html).toContain(
        getSocialSurfaceCopy(locale).notifications.settingsPage.signIn,
      );
      expect(html).not.toContain("data-notification-settings=");
      expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();
    },
  );

  it("says the session could not be read instead of asking a signed-in reader to sign in", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "unavailable",
      failure: describeWorkspaceFailure(postgresRejection("08006")),
    });

    const html = await renderSettings({}, "bg");

    expect(html).toContain('data-section-failure="connection_unavailable"');
    expect(html).toContain(
      getSocialSurfaceCopy("bg").notifications.settingsPage.loadErrorTitle,
    );
    expect(html).toContain(
      'href="/bg/notifications/settings" data-workspace-retry="section"',
    );
    expect(html).not.toContain("data-sign-in-prompt");
    expect(html).not.toContain("data-notification-settings=");
    expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();
  });

  it("renders a failed read as a failure with a retry, never as a form of defaults", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getNotificationPreferences.mockRejectedValue(
      postgresRejection("57014"),
    );

    const html = await renderSettings();

    expect(html).toContain('data-section-failure="query_timeout"');
    expect(html).toContain(uk.loadErrorTitle);
    expect(html).toContain(
      'href="/notifications/settings" data-workspace-retry="section"',
    );
    // A form of defaults would save "everything on" over what is stored.
    expect(html).not.toContain("data-notification-settings=");
    expect(html).not.toContain('type="checkbox"');
    expect(mocks.getNotificationPreferences).toHaveBeenCalledWith(SCOPE);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: "workspace_section_degraded",
      surface: "notification-settings",
      section: "preferences",
      failureClass: "query_timeout",
    });
    log.mockRestore();
  });

  it("shows what is stored, in two groups, as one form that posts the reader's language", async () => {
    const html = await renderSettings();
    const form = elementWith(html, 'data-notification-settings="true"', "form");
    const fieldsets = [...form.matchAll(/<fieldset[\s\S]*?<\/fieldset>/gu)].map(
      (match) => match[0],
    );

    expect(tagWith(form, 'data-notification-settings="true"')).toMatch(
      /action="\/api\/notifications\/preferences"/u,
    );
    expect(tagWith(form, 'data-notification-settings="true"')).toMatch(
      /method="post"/u,
    );
    expect(form).toContain('<input type="hidden" name="locale" value="uk"/>');
    expect(fieldsets).toHaveLength(2);
    // What other gardeners did, then the optional reminders with their rule.
    expect(fieldsets[0]).toContain(
      `<legend class="text-h4 text-text-heading">${uk.social}</legend>`,
    );
    expect(fieldsets[1]).toContain(
      `<legend class="text-h4 text-text-heading">${uk.reminders}</legend>`,
    );
    expect(checkboxNames(fieldsets[0]!)).toEqual([
      "comments",
      "replies",
      "follows",
      "mentions",
      "claims",
    ]);
    expect(checkboxNames(fieldsets[1]!)).toEqual(["system"]);
    expect(fieldsets[1]).toContain(uk.options.system);
    expect(fieldsets[1]).toContain(escapeText(uk.reminderHint));
    for (const [name, checked] of Object.entries(PREFERENCES)) {
      const input = tagWith(form, `name="${name}"`);
      expect(input.includes('checked=""'), name).toBe(checked);
    }
    expect(elementWith(form, 'type="submit"', "button")).toContain(uk.save);
    expect(mocks.getNotificationPreferences).toHaveBeenCalledWith(SCOPE);
    expect(html).not.toContain("data-notification-settings-outcome");
    // The way back is to Activity itself.
    expect(
      attribute(
        tagWith(html, 'data-notification-settings-back="true"'),
        "href",
      ),
    ).toBe("/notifications");
  });

  it("says a saved choice beside the form, politely", async () => {
    const html = await renderSettings({ saved: "1" });
    const notice = elementWith(
      html,
      'id="notification-settings-outcome"',
      "div",
    );

    expect(notice).toContain('data-notification-settings-outcome="saved"');
    expect(notice).toContain('data-tone="success"');
    expect(notice).toContain('role="status"');
    expect(notice).toContain(uk.saved);
    expect(html.indexOf('id="notification-settings-outcome"')).toBeLessThan(
      html.indexOf('data-notification-settings="true"'),
    );
  });

  it("says a failed save as an alert, and still shows what is stored", async () => {
    const html = await renderSettings({ saved: "failed" }, "ru");
    const notice = elementWith(
      html,
      'id="notification-settings-outcome"',
      "div",
    );

    expect(notice).toContain('data-notification-settings-outcome="failed"');
    expect(notice).toContain('data-tone="danger"');
    expect(notice).toContain('role="alert"');
    expect(notice).toContain(
      getSocialSurfaceCopy("ru").notifications.settingsPage.failed,
    );
    expect(html).toContain('<input type="hidden" name="locale" value="ru"/>');
    expect(tagWith(html, 'name="comments"')).toContain('checked=""');
  });

  it("ignores an outcome it did not write", async () => {
    const html = await renderSettings({ saved: "yes" });

    expect(html).not.toContain("data-notification-settings-outcome");
    expect(html).toContain('data-notification-settings="true"');
  });

  it("answers 404 for a language it does not speak, before any read", async () => {
    await expect(renderSettings({}, "de")).rejects.toThrowError(
      /NEXT_HTTP_ERROR_FALLBACK;404/u,
    );
    expect(mocks.resolveWorkspaceViewer).not.toHaveBeenCalled();
    expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();
  });
});

/** Text as React writes it into HTML: "необов'язкові" has an apostrophe. */
function escapeText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function checkboxNames(html: string) {
  return [
    ...html.matchAll(/<input type="checkbox"[^>]*\sname="([^"]+)"/gu),
  ].map((match) => match[1]);
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
