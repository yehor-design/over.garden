import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRequestInterfaceLocale: vi.fn() }));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("./reset-password-form", () => ({
  ResetPasswordForm: ({ locale }: { locale: string }) => (
    <div data-reset-password-form={locale} />
  ),
}));

describe("/auth/reset-password", () => {
  beforeEach(() => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
  });

  it("localizes metadata, loading, and the form locale without exposing a token", async () => {
    const { default: ResetPasswordPage, generateMetadata } =
      await import("./page");
    const html = renderToStaticMarkup(await ResetPasswordPage());
    const metadata = await generateMetadata();

    expect(metadata.title).toBe("Сбросить пароль");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(html).toContain('lang="ru"');
    expect(html).toContain('data-reset-password-form="ru"');
    expect(html).not.toMatch(/token=|raw-token|session-token/i);
  });
});
