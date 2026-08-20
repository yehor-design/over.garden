import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
}));

import { GardenWorkspaceLocalState } from "./garden-workspace-local-state";

describe("GardenWorkspaceLocalState online-only boundary", () => {
  it("renders server media and privacy support without device queue claims", () => {
    const html = renderToStaticMarkup(
      <GardenWorkspaceLocalState
        locale="uk"
        nextAction={{ href: "/garden", label: "Next" }}
        recent={[]}
        inbox={{ notificationCount: 1, claimCount: 0 }}
        media={{ processingCount: 2, failedCount: 1 }}
      />,
    );

    expect(html).toContain("Фото в обробці: 2");
    expect(html).toContain("Фото, що потребують уваги: 1");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toMatch(/локальна черга|на цьому пристрої|офлайн/i);
  });
});
