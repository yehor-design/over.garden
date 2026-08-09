import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/garden/garden-auth-panel", () => ({
  GardenAuthPanel: (props: Record<string, unknown>) => (
    <div data-testid="garden-auth-panel" data-props={JSON.stringify(props)} />
  ),
}));

import { AuthIntentSurface } from "./auth-intent-surface";

describe("AuthIntentSurface", () => {
  it("renders one accessible desktop-dialog/mobile-sheet route for a valid action", () => {
    const html = renderToStaticMarkup(
      <AuthIntentSurface
        locale="uk"
        intent={{
          action: "comment",
          returnTo: "/journal/balcony-tomato-check#comments",
          target: { kind: "journal", ref: "balcony-tomato-check" },
        }}
        token="opaque-intent-token"
        state="ready"
        googleSignInEnabled
      />,
    );

    expect(html).toContain('data-auth-intent-surface="ready"');
    expect(html).toContain('data-auth-intent-desktop="dialog"');
    expect(html).toContain('data-auth-intent-mobile="sheet"');
    expect(html).toContain("Увійдіть, щоб коментувати");
    expect(html).toContain("Публічне читання залишається відкритим");
    expect(html).toContain('href="/journal/balcony-tomato-check#comments"');
    expect(html).toContain("Скасувати й продовжити читання");
    expect(html).toContain("/auth/intent/resume?intent=opaque-intent-token");
    expect(html).toContain('aria-labelledby="auth-intent-title"');
    expect(html).not.toContain("prefillDevelopmentDefaults");
    expect(html).toContain("&quot;locale&quot;:&quot;uk&quot;");
    expect(html).not.toMatch(
      /person@example|private journal|latitude|longitude|media key/i,
    );
  });

  it.each([
    ["bg", "invalid", "Заявката за вход не е налична"],
    ["ru", "expired", "Срок действия этого запроса на вход истёк"],
  ] as const)(
    "renders a bounded %s %s recovery without an auth loop",
    (locale, state, expectedTitle) => {
      const html = renderToStaticMarkup(
        <AuthIntentSurface
          locale={locale}
          intent={null}
          token={null}
          state={state}
          googleSignInEnabled={false}
        />,
      );

      expect(html).toContain(`data-auth-intent-surface="${state}"`);
      expect(html).toContain(expectedTitle);
      expect(html).toContain('href="/"');
      expect(html).not.toContain("garden-auth-panel");
      expect(html).not.toContain("intent=");
    },
  );
});
