import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/session-convergence-boundary", () => ({
  SessionConvergenceBoundary: ({ children }: { children: React.ReactNode }) => (
    <section data-session-convergence-browser-harness="true">
      {children}
    </section>
  ),
}));

import { SessionRecheckVisualFixture } from "./session-recheck-visual-fixture";

describe("session recheck visual fixture", () => {
  it("contains only explicitly synthetic private-race markup", () => {
    const html = renderToStaticMarkup(<SessionRecheckVisualFixture />);

    expect(html).toContain('data-session-convergence-browser-harness="true"');
    expect(html).toContain('data-session-recheck-private-fixture="true"');
    expect(html).toContain('data-session-recheck-private-action="true"');
    expect(html).toContain("Synthetic private action");
  });
});
