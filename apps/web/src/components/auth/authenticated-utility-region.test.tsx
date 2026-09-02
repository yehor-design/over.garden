import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/sign-out-control", () => ({
  SignOutControl: ({ presentation }: { presentation: string }) => (
    <button type="button" data-sign-out-control={presentation}>
      Изход от профила
    </button>
  ),
}));
vi.mock("@/components/public/language-switcher", () => ({
  InterfaceLanguageControl: ({ market }: { market: "ukraine" | "bulgaria" }) =>
    market === "bulgaria" ? (
      <nav data-interface-language-control="site-shell-interface-language-control" />
    ) : null,
}));

describe("authenticated utility region", () => {
  it("covers real operator paths only", async () => {
    const { isAuthenticatedUtilityPath } =
      await import("./authenticated-utility-region");
    const { INTERFACE_UTILITY_CONTROL_PREFIXES } =
      await import("@/lib/interface-route-policy");

    for (const prefix of INTERFACE_UTILITY_CONTROL_PREFIXES) {
      expect(isAuthenticatedUtilityPath(prefix)).toBe(true);
      expect(isAuthenticatedUtilityPath(`${prefix}/nested`)).toBe(true);
    }
    expect(isAuthenticatedUtilityPath("/skeleton")).toBe(false);
  });

  it("renders a localized, identity-free operator session control", async () => {
    const { AuthenticatedUtilityRegion } =
      await import("./authenticated-utility-region");
    const html = renderToStaticMarkup(
      <AuthenticatedUtilityRegion
        locale="bg"
        market="bulgaria"
        pathname="/garden/catalog/curation"
        isAuthenticated
      />,
    );

    expect(html).toContain('data-authenticated-utility-region="true"');
    expect(html).toContain('data-sign-out-control="utility"');
    expect(html).toContain(
      'data-interface-language-control="site-shell-interface-language-control"',
    );
    expect(html).toContain("Управление на текущата сесия");
    expect(html).toContain("Изход от профила");
    expect(html).not.toMatch(/user[-_ ]?id|session[-_ ]?id|email|token/i);
  });

  it("keeps the Bulgaria utility language control for guests without sign-out", async () => {
    const { AuthenticatedUtilityRegion } =
      await import("./authenticated-utility-region");
    const html = renderToStaticMarkup(
      <AuthenticatedUtilityRegion
        locale="ru"
        market="bulgaria"
        pathname="/health"
        isAuthenticated={false}
      />,
    );

    expect(html).toContain(
      'data-interface-language-control="site-shell-interface-language-control"',
    );
    expect(html).not.toContain("data-sign-out-control");
  });
});
