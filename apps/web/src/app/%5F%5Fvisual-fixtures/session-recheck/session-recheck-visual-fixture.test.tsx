import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/session-convergence-boundary", () => ({
  SessionConvergenceBoundary: ({
    children,
    locale,
    recheckMode,
  }: {
    children: React.ReactNode;
    locale: string;
    recheckMode: string;
  }) => (
    <section
      data-session-convergence-browser-harness="true"
      data-locale={locale}
      data-recheck-mode={recheckMode}
    >
      {children}
    </section>
  ),
}));

import { SessionRecheckVisualFixture } from "./session-recheck-visual-fixture";

describe("session recheck visual fixture", () => {
  it("contains only explicitly synthetic private-race markup", () => {
    const html = renderToStaticMarkup(
      <SessionRecheckVisualFixture
        locale="ru"
        recheckMode="effect_closed_non_fencing"
      />,
    );

    expect(html).toContain('data-session-convergence-browser-harness="true"');
    expect(html).toContain('data-session-recheck-private-fixture="true"');
    expect(html).toContain('data-session-recheck-private-action="true"');
    expect(html).toContain('data-recheck-mode="effect_closed_non_fencing"');
    expect(html).toContain('data-locale="ru"');
    expect(html).toContain('data-testid="session-recheck-editor-form"');
    expect(html).toContain('data-testid="session-recheck-locale-control"');
    expect(html).toContain("Синтетическое приватное действие");
  });
});
