import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  localeControlFallback: null as React.ReactNode,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@/components/auth/session-convergence-boundary", () => ({
  SessionConvergenceBoundary: ({
    children,
    localeControlFallback,
  }: {
    children: React.ReactNode;
    localeControlFallback?: React.ReactNode;
  }) => {
    mocks.localeControlFallback = localeControlFallback ?? null;
    return children;
  },
}));

describe("production site shell", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    mocks.localeControlFallback = null;
  });

  it("renders the guest desktop and mobile information architecture", async () => {
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <article>Route content</article>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="root"');
    expect(html).toContain('data-site-shell-region="header"');
    expect(html).toContain('data-site-shell-brand="true"');
    expect(html).toContain("site-shell-header-inner");
    expect(html).toContain("site-shell-brand");
    expect(html).toContain('data-site-shell-region="sidebar"');
    expect(html).toContain('data-site-shell-region="content"');
    expect(html).toContain('data-interface-locale-fragment-safe="true"');
    expect(html).toContain('data-site-shell-region="context"');
    expect(html).toContain('data-site-shell-region="mobile-navigation"');
    expect(html).toContain('aria-label="Основна мобільна навігація"');
    expect(html).toContain("Route content");
    expect(html).toContain('href="/objects"');
    expect(html).toContain('href="/journals"');
    expect(html).toContain('href="/knowledge"');
    expect(html).toContain("Живі об&#x27;єкти");
    expect(html).toContain("Увійти");
    expect(html).toContain('data-site-shell-guest-actions="true"');
    expect(html).toContain('name="action" value="create_object"');
    expect(html).toContain('name="action" value="create_entry"');
    expect(html).toContain('data-site-shell-action="add-guest"');
    expect(html).toContain('data-site-shell-action="sign-in-mobile"');
    expect(html).toContain('aria-label="Увійти"');
    expect(html).toContain("site-shell-header-icon");
    expect(html).toContain('aria-label="Відкрити навігацію"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain(">Моє<");
    expect(html).not.toMatch(/draftCount|owner_user_id|private-user/i);
    expect(html).not.toContain("data-sign-out-control");
    expect(html).not.toContain("data-interface-language-control");
  });

  it("adds the complete Bulgarian My rail without serializing account data", async () => {
    mocks.pathname = "/garden";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="bg" market="bulgaria" isAuthenticated={true}>
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
    expect(html.match(/data-interface-language-control=/g)).toHaveLength(1);
    const fallbackHtml = renderToStaticMarkup(
      <>{mocks.localeControlFallback}</>,
    );
    expect(
      fallbackHtml.match(/data-interface-language-control=/g),
    ).toHaveLength(1);
    expect(fallbackHtml).toContain('disabled=""');
    expect(html).not.toMatch(
      /private@example|private-user|private-session|owner_user_id/i,
    );
  });

  it("keeps internal operational pages outside the product shell", async () => {
    mocks.pathname = "/admin";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={true}>
        <main>Admin control plane</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="excluded"');
    expect(html).toContain('data-authenticated-utility-region="true"');
    expect(html).toContain('data-sign-out-control="utility"');
    expect(html).toContain("Вийти з облікового запису");
    expect(html).toContain("Admin control plane");
    expect(html).not.toContain('data-site-shell-region="sidebar"');
    expect(html).not.toContain('data-site-shell-region="mobile-navigation"');
  });

  it("keeps guest operator boundaries free of authenticated controls", async () => {
    mocks.pathname = "/admin/denied";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Denied boundary</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="excluded"');
    expect(html).not.toContain('data-authenticated-utility-region="true"');
    expect(html).not.toContain("data-sign-out-control");
  });

  it("keeps the deterministic visual environment outside the product shell", async () => {
    mocks.pathname = "/__visual-fixtures";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Visual fixture scenarios</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="excluded"');
    expect(html).toContain("Visual fixture scenarios");
    expect(html).not.toContain('data-site-shell-region="header"');
    expect(html).not.toContain('data-site-shell-region="mobile-navigation"');
    expect(html).not.toContain("data-sign-out-control");
    expect(html).not.toContain("overgarden:session-convergence");
  });

  it("renders the compact Bulgaria control on guest denied and health boundaries", async () => {
    const { SiteShell } = await import("./site-shell");
    for (const pathname of ["/admin/denied", "/health"]) {
      mocks.pathname = pathname;
      const html = renderToStaticMarkup(
        <SiteShell locale="ru" market="bulgaria" isAuthenticated={false}>
          <main>Boundary</main>
        </SiteShell>,
      );

      expect(html).toContain('data-site-shell="excluded"');
      expect(html.match(/data-interface-language-control=/g)).toHaveLength(1);
      expect(html).not.toContain("data-sign-out-control");
      expect(html).not.toContain('data-site-shell-region="header"');
    }
  });

  it("keeps privacy reachable from the mobile menu utilities", async () => {
    const { SiteShellMobileUtilities } =
      await import("./site-shell-navigation");
    const html = renderToStaticMarkup(
      <SiteShellMobileUtilities
        privacyHref="/bg/privacy"
        privacyLabel="Поверителност"
      >
        <button type="button">Изход</button>
      </SiteShellMobileUtilities>,
    );

    expect(html).toContain('data-site-shell-mobile-utilities="true"');
    expect(html).toContain('href="/bg/privacy"');
    expect(html).toContain("Поверителност");
    expect(html).toContain("Изход");
  });

  it("closes both parent sheets before opening the shared sign-out flow", async () => {
    const source = await readFile(
      new URL("./site-shell.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("open={mobileMenuOpen}");
    expect(source).toContain("open={accountMenuOpen}");
    expect(source).toContain(
      "onBeforeRequest={() => setMobileMenuOpen(false)}",
    );
    expect(source).toMatch(
      /onBeforeRequest=\{\(\)\s*=>\s*setAccountMenuOpen\(false\)\s*\}/,
    );
  });

  it("mounts the auth lifecycle only for authenticated shells and gates the entire sign-out provider", async () => {
    const source = await readFile(
      new URL("./site-shell.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("if (!isAuthenticated) return shell;");
    expect(source.indexOf("if (!isAuthenticated) return shell;")).toBeLessThan(
      source.lastIndexOf("<SessionConvergenceBoundary"),
    );
    expect(
      source.match(
        /<SessionConvergenceBoundary\s+locale=\{locale\}\s+localeControlFallback=\{sessionConvergenceLocaleControl\}\s*>[\s\S]*?<SignOutProvider locale=\{locale\}>[\s\S]*?<\/SignOutProvider>[\s\S]*?<\/SessionConvergenceBoundary>/g,
      ),
    ).toHaveLength(2);
    expect(source).not.toMatch(
      /<SignOutProvider locale=\{locale\}>\s*<SessionConvergenceBoundary/,
    );
  });
});
