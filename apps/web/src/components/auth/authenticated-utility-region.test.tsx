import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/sign-out-control", () => ({
  SignOutControl: ({ presentation }: { presentation: string }) => (
    <button type="button" data-sign-out-control={presentation}>
      Изход от профила
    </button>
  ),
}));

describe("authenticated utility region", () => {
  it("covers real operator and denied-admin paths only", async () => {
    const { isAuthenticatedUtilityPath } =
      await import("./authenticated-utility-region");

    expect(isAuthenticatedUtilityPath("/admin")).toBe(true);
    expect(isAuthenticatedUtilityPath("/admin/denied")).toBe(true);
    expect(isAuthenticatedUtilityPath("/garden/catalog/curation")).toBe(true);
    expect(isAuthenticatedUtilityPath("/garden/pilot-smoke/run")).toBe(true);
    expect(isAuthenticatedUtilityPath("/garden/privacy/erasure-requests")).toBe(
      true,
    );
    expect(isAuthenticatedUtilityPath("/health")).toBe(false);
    expect(isAuthenticatedUtilityPath("/skeleton")).toBe(false);
    expect(isAuthenticatedUtilityPath("/__visual-fixtures/admin")).toBe(false);
  });

  it("renders a localized, identity-free operator session control", async () => {
    const { AuthenticatedUtilityRegion } =
      await import("./authenticated-utility-region");
    const html = renderToStaticMarkup(
      <AuthenticatedUtilityRegion locale="bg" />,
    );

    expect(html).toContain('data-authenticated-utility-region="true"');
    expect(html).toContain('data-sign-out-control="utility"');
    expect(html).toContain("Управление на текущата сесия");
    expect(html).toContain("Изход от профила");
    expect(html).not.toMatch(/user[-_ ]?id|session[-_ ]?id|email|token/i);
  });
});
