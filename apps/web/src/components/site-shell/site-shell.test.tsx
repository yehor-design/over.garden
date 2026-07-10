import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

describe("production site shell", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("renders the guest desktop and mobile information architecture", async () => {
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" isAuthenticated={false}>
        <article>Route content</article>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="root"');
    expect(html).toContain('data-site-shell-region="header"');
    expect(html).toContain('data-site-shell-region="sidebar"');
    expect(html).toContain('data-site-shell-region="content"');
    expect(html).toContain('data-site-shell-region="context"');
    expect(html).toContain('data-site-shell-region="mobile-navigation"');
    expect(html).toContain('aria-label="Основна мобільна навігація"');
    expect(html).toContain("Route content");
    expect(html).toContain('href="/objects"');
    expect(html).toContain('href="/journals"');
    expect(html).toContain('href="/knowledge"');
    expect(html).toContain("Живі об&#x27;єкти");
    expect(html).toContain("Увійти");
    expect(html).toContain('aria-label="Відкрити навігацію"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain(">Моє<");
  });

  it("adds the complete Bulgarian My rail without serializing account data", async () => {
    mocks.pathname = "/garden";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="bg" isAuthenticated={true}>
        <article>Лично съдържание</article>
      </SiteShell>,
    );

    expect(html).toContain(">Моето<");
    expect(html).toContain("Моята градина");
    expect(html).toContain("Добавяне на обект");
    expect(html).toContain("Нов запис");
    expect(html).toContain("Чернови");
    expect(html).toContain("Следвани записи");
    expect(html).toContain("Известия");
    expect(html).toContain("Отметки");
    expect(html).toContain("Желани");
    expect(html).toContain("Заявки за произход");
    expect(html).toContain("Профил");
    expect(html).toContain('data-site-shell-action="add-mobile"');
    expect(html).toContain('data-site-shell-action="add-desktop"');
    expect(html).toContain('aria-label="Нов запис"');
    expect(html).toContain('href="/bg"');
    expect(html).toContain('href="/bg/notifications"');
    expect(html).not.toMatch(
      /private@example|private-user|private-session|owner_user_id/i,
    );
  });

  it("keeps internal operational pages outside the product shell", async () => {
    mocks.pathname = "/admin";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" isAuthenticated={true}>
        <main>Admin control plane</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="excluded"');
    expect(html).toContain("Admin control plane");
    expect(html).not.toContain('data-site-shell-region="sidebar"');
    expect(html).not.toContain('data-site-shell-region="mobile-navigation"');
  });

  it("keeps privacy reachable from the mobile menu utilities", async () => {
    const { SiteShellMobileUtilities } =
      await import("./site-shell-navigation");
    const html = renderToStaticMarkup(
      <SiteShellMobileUtilities
        privacyHref="/bg/privacy"
        privacyLabel="Поверителност"
      />,
    );

    expect(html).toContain('data-site-shell-mobile-utilities="true"');
    expect(html).toContain('href="/bg/privacy"');
    expect(html).toContain("Поверителност");
  });
});
