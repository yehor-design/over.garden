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

import { GardenWorkspaceServiceState } from "./garden-workspace-service-state";

describe("GardenWorkspaceServiceState online-only boundary", () => {
  it("renders publication and privacy support without server-media queue claims", () => {
    const html = renderToStaticMarkup(
      <GardenWorkspaceServiceState
        locale="uk"
        nextAction={{ href: "/garden", label: "Next" }}
        recent={[]}
        inbox={{ notificationCount: 1, claimCount: 0 }}
      />,
    );

    expect(html).toContain("До успішної публікації");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toMatch(/серверна чернетка|фото в обробці|офлайн/i);
  });
});
