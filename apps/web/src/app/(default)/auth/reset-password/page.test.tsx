import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRequestInterfaceLocale: vi.fn() }));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("../auth-actions", () => ({
  resetPasswordAction: async () => ({ status: "idle", message: null }),
}));

vi.mock("./reset-password-form", () => ({
  ResetPasswordForm: ({ locale, token }: { locale: string; token: string }) => (
    <div data-reset-password-form={locale} data-token-length={token.length} />
  ),
}));

async function render(params: Record<string, string>) {
  const { default: ResetPasswordPage } = await import("./page");
  return renderToStaticMarkup(
    await ResetPasswordPage({ searchParams: Promise.resolve(params) }),
  );
}

describe("/auth/reset-password (OVE-504)", () => {
  beforeEach(() => {
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");
  });

  it("localizes metadata and hands the token to the form, in the one focused column", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata();
    const html = await render({ token: "opaque-reset-token" });

    expect(metadata.title).toBe("Сбросить пароль");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(html).toContain('data-auth-frame="reset-password"');
    expect(html).toContain('lang="ru"');
    expect(html).toMatch(/<h1[^>]*>Выберите новый пароль<\/h1>/u);
    expect(html).toContain('data-reset-password-form="ru"');
    // The token reaches the form's hidden field and nothing else on the page.
    expect(html).not.toContain("opaque-reset-token");
  });

  it.each<[Record<string, string>, string]>([
    [{ error: "INVALID_TOKEN" }, "a refused link"],
    [{}, "no token at all"],
    [{ token: "   " }, "an empty token"],
  ])("gives %s its own state with a new-link action", async (params) => {
    const html = await render(params);

    expect(html).toContain('data-reset-link-state="expired"');
    expect(html).toMatch(
      /<h1[^>]*>Ссылка для восстановления недействительна<\/h1>/u,
    );
    expect(html).toContain('href="/auth/help#password-reset"');
    expect(html).toContain("Отправить новую ссылку");
    // No form that could only fail.
    expect(html).not.toContain("data-reset-password-form");
    expect(html).not.toContain("INVALID_TOKEN");
  });
});
