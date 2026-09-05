import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@/components/auth/session-signal-boundary", () => ({
  SessionSignalBoundary: ({ ownerUserId }: { ownerUserId: string | null }) => (
    <span data-session-signal-boundary={ownerUserId ?? "guest"} />
  ),
}));
vi.mock("@/components/auth/owner-scope", () => ({
  OwnerScopeProvider: ({
    children,
    ownerUserId,
  }: {
    children: React.ReactNode;
    ownerUserId: string | null;
  }) => <div data-owner-scope={ownerUserId ?? "guest"}>{children}</div>,
}));
describe("production site shell", () => {
  beforeEach(() => {
    mocks.pathname = "/";
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
    // Without a target there is nothing to sign, so the trigger is a plain
    // link to the one sign-in screen (OVE-378) rather than a POST.
    expect(html).toContain("intent=create_object");
    expect(html).toContain("intent=create_entry");
    expect(html).toContain("/auth/sign-in?next=");
    expect(html).toContain('data-site-shell-action="add-guest"');
    expect(html).toContain('data-site-shell-action="sign-in-mobile"');
    expect(html).toContain('aria-label="Увійти"');
    expect(html).toContain("site-shell-header-icon");
    expect(html).toContain('aria-label="Відкрити навігацію"');
    expect(html).toContain('data-cwv-interaction-target="site-menu"');
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
      <SiteShell
        locale="bg"
        market="bulgaria"
        isAuthenticated={true}
        ownerUserId="00000000-0000-4000-8000-000000000001"
      >
        <article>Лично съдържание</article>
      </SiteShell>,
    );

    expect(html).toContain(">Моето<");
    expect(html).toContain("Моята градина");
    expect(html).toContain("Добавяне на обект");
    expect(html).toContain("Нов запис");
    expect(html).not.toContain("Чернови");
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
    expect(html).not.toMatch(
      /private@example|private-user|private-session|owner_user_id/i,
    );
    expect(html).toContain(
      'data-owner-scope="00000000-0000-4000-8000-000000000001"',
    );
    expect(html).toContain(
      'data-session-signal-boundary="00000000-0000-4000-8000-000000000001"',
    );
    expect(html).not.toContain('data-site-shell-operator-menu="true"');
    expect(html).not.toContain('href="/account/communities"');
    expect(html).not.toContain('href="/account/moderation/comments"');
    expect(html).not.toContain('href="/garden/privacy/erasure-requests"');
  });

  it("adds exactly the four surviving operator links to the sealed owner avatar menu", async () => {
    mocks.pathname = "/garden";
    const { SiteShell, SiteShellOperatorMenu } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated hasOperatorAccess>
        <article>Сад власника</article>
      </SiteShell>,
    );

    const operatorMenuHtml = renderToStaticMarkup(
      <SiteShellOperatorMenu locale="uk" />,
    );
    expect(operatorMenuHtml).toContain('data-site-shell-operator-menu="true"');
    expect(operatorMenuHtml).toContain('href="/account/communities"');
    expect(operatorMenuHtml).toContain('href="/account/moderation/comments"');
    expect(operatorMenuHtml).not.toContain("/garden/catalog/registry");
    expect(operatorMenuHtml).toContain(
      'href="/garden/privacy/erasure-requests"',
    );
    expect(operatorMenuHtml).not.toContain('href="/admin"');
    expect(operatorMenuHtml).not.toContain('href="/admin/users"');
    expect(operatorMenuHtml).not.toContain('href="/garden/pilot-health"');
    expect(operatorMenuHtml).not.toContain('href="/garden/pilot-smoke"');
    expect(html).toContain('href="/garden/profile"');
    expect(html).toContain('aria-label="Відкрити меню облікового запису"');
    expect(html).toContain('data-site-shell-account-menu-trigger="true"');
  });

  it("renders account moderation inside the product shell", async () => {
    mocks.pathname = "/account/communities";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={true}>
        <main>Account moderation</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="root"');
    expect(html).toContain("Account moderation");
    expect(html).toContain('data-site-shell-region="sidebar"');
    expect(html).toContain('data-site-shell-region="mobile-navigation"');
    expect(html).not.toContain('data-authenticated-utility-region="true"');
  });

  it("keeps guest account moderation free of owner links", async () => {
    mocks.pathname = "/account/communities";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Denied boundary</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="root"');
    expect(html).not.toContain('data-authenticated-utility-region="true"');
    expect(html).not.toContain("data-sign-out-control");
    expect(html).not.toContain('href="/account/communities"');
  });

  it("keeps native erasure mutation-capable without mounting private navigation or the local session gate", async () => {
    mocks.pathname = "/erasure";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell
        locale="uk"
        market="ukraine"
        isAuthenticated
        ownerUserId="00000000-0000-4000-8000-000000000001"
      >
        <main>Native erasure request</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="safe-exit"');
    expect(html).toContain('data-site-shell-safe-exit="erasure"');
    expect(html).toContain(
      'data-owner-scope="00000000-0000-4000-8000-000000000001"',
    );
    expect(html).toContain("Native erasure request");
    expect(html).not.toContain('data-authenticated-utility-region="true"');
    expect(html).not.toContain('data-site-shell-region="sidebar"');
    expect(html).not.toContain('data-site-shell-region="mobile-navigation"');
    expect(html).not.toContain("data-sign-out-control");
  });

  it("keeps the server-authorized erasure owner review outside the local garden gate", async () => {
    mocks.pathname = "/garden/privacy/erasure-requests";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated>
        <main>Erasure owner review</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="safe-exit"');
    expect(html).toContain('data-site-shell-safe-exit="erasure"');
    expect(html).toContain("Erasure owner review");
    expect(html).not.toContain('data-authenticated-utility-region="true"');
    expect(html).not.toContain('data-site-shell-region="sidebar"');
    expect(html).not.toContain('data-site-shell-region="mobile-navigation"');
    expect(html).not.toContain("data-sign-out-control");
  });

  it("renders the compact Bulgaria control on guest denied and health boundaries", async () => {
    const { SiteShell } = await import("./site-shell");
    for (const pathname of ["/health"]) {
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

  it("mounts the owner scope and sign-out provider only for authenticated shells", async () => {
    const source = await readFile(
      new URL("./site-shell.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("if (!isAuthenticated) {");
    expect(source.indexOf("if (!isAuthenticated) {")).toBeLessThan(
      source.lastIndexOf("<OwnerScopeProvider"),
    );
    expect(
      source.match(
        /<OwnerScopeProvider locale=\{locale\} ownerUserId=\{ownerUserId\}>\s*<SignOutProvider locale=\{locale\}>[\s\S]*?<\/SignOutProvider>\s*<\/OwnerScopeProvider>/g,
      ),
    ).toHaveLength(2);
    expect(source).not.toMatch(
      /<SignOutProvider locale=\{locale\}>\s*<OwnerScopeProvider/,
    );
    expect(source.match(/<SessionSignalBoundary /g)).toHaveLength(3);
  });
});

describe("every guest sign-in control reaches the form itself", () => {
  it("never routes the reader through an intermediate page", async () => {
    // The defect: the header's "sign in" button read this item's *label* from
    // the navigation and hard-coded `href="/garden"` beside it, so the control
    // landed on the workspace empty state, which offers a second "sign in"
    // before the form. Reported by the owner on 2026-09-04, after OVE-378
    // claimed the two URLs were no longer the same.
    mocks.pathname = "/bg/journals";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell locale="bg" market="bulgaria" isAuthenticated={false}>
        <article>Route content</article>
      </SiteShell>,
    );

    const signInControls = [
      ...html.matchAll(/data-site-shell-action="sign-in[^"]*"[^>]*/g),
    ].map((match) => match[0]);
    expect(signInControls.length).toBeGreaterThanOrEqual(2);
    for (const control of signInControls) {
      expect(control).toMatch(/href="\/auth\/sign-in/);
    }

    // And it brings the reader back to what they were reading, rather than
    // depositing them in the workspace — the defect OVE-378 set out to remove.
    expect(html).toContain("/auth/sign-in?next=%2Fbg%2Fjournals");
  });

  it("offers no sign-in control at all once the reader is signed in", async () => {
    mocks.pathname = "/bg/journals";
    const { SiteShell } = await import("./site-shell");
    const html = renderToStaticMarkup(
      <SiteShell
        locale="bg"
        market="bulgaria"
        isAuthenticated
        ownerUserId="owner-1"
      >
        <article>Route content</article>
      </SiteShell>,
    );

    expect(html).not.toContain('data-site-shell-action="sign-in');
  });
});
