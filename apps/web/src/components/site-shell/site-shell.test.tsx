// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

import { SiteShell } from "./site-shell";

/** `import.meta.url` is not a file URL under jsdom, so resolve from the root. */
const readShellSource = () =>
  readFile(
    resolve(process.cwd(), "src/components/site-shell/site-shell.tsx"),
    "utf8",
  );

/**
 * The landmark contract of DESIGN.md §3.3, asserted by role and accessible
 * name rather than by class or marker. What shipped before this rewrite: two
 * unnamed `navigation` landmarks, two unnamed `complementary` landmarks, and no
 * `contentinfo` at all.
 */
describe("the shell's landmarks", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("renders exactly one banner and one contentinfo, and no main of its own", () => {
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Route content</main>
      </SiteShell>,
    );

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    // The page owns its `<main>`. A shell that rendered one too would give
    // every page two, which is the landmark defect in the other direction.
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main").textContent).toBe("Route content");
  });

  it("names every navigation and complementary landmark it renders", () => {
    mocks.pathname = "/garden";
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        isAuthenticated
        ownerUserId="00000000-0000-4000-8000-000000000001"
      >
        <main>Сад</main>
      </SiteShell>,
    );

    const navigations = screen.getAllByRole("navigation");
    expect(navigations.length).toBeGreaterThan(0);
    const names = navigations.map((landmark) =>
      landmark.getAttribute("aria-label"),
    );
    expect(names.every((name) => Boolean(name && name.length > 0))).toBe(true);
    // Every name is distinct: two landmarks that read the same are no better
    // than two that read nothing.
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Основна навігація");
    expect(names).toContain("Моє");
    expect(names).toContain("Навігація в підвалі");
    expect(names).toContain("Основна мобільна навігація");
    expect(names).toContain("Вибір мови інтерфейсу");

    for (const complementary of screen.queryAllByRole("complementary")) {
      expect(complementary.getAttribute("aria-label")).toBe(
        "Додатковий контекст",
      );
    }
  });

  it("puts the skip link first in the tab order and shows it on focus", () => {
    const { container } = render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Route content</main>
      </SiteShell>,
    );

    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    expect(first?.textContent).toBe("Перейти до основного вмісту");
    expect(first?.getAttribute("href")).toBe("#main-content");
    expect(first?.className).toContain("sr-only");
    expect(first?.className).toContain("focus:not-sr-only");
    expect(
      container.querySelector("#main-content")?.getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("grows the bar around 200 % text instead of clipping it", () => {
    // The rule used to live in `globals.css` as `.site-shell-header-inner {
    // min-height }`; the class is gone and the guarantee moved here with the
    // markup. A fixed height would cut a Cyrillic label in half at 200 % text
    // (WCAG 1.4.4, DESIGN.md §2.6).
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Route content</main>
      </SiteShell>,
    );

    const banner = screen.getByRole("banner");
    expect(banner.className).toContain("min-h-14");
    expect(banner.className).not.toMatch(/(?:^|\s)h-14(?:\s|$)/);
  });

  it("marks the active navigation item and nothing else", () => {
    mocks.pathname = "/journals";
    const { container } = render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Журнали</main>
      </SiteShell>,
    );

    const current = [...container.querySelectorAll('[aria-current="page"]')];
    expect(current.length).toBeGreaterThan(0);
    for (const item of current) {
      expect(item.textContent).toContain("Журнали");
    }
  });
});

describe("the one primary action", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  /**
   * One per viewport, not one per document. The rail and the tab bar are drawn
   * at mutually exclusive widths — that is what `OVE-444` added — so the
   * contract is that exactly one of them is a reader's, never both, and never
   * two inside the same region the way the rail and the header used to be. The
   * *rendered* version of this assertion is in `tests/site-shell.spec.ts`,
   * which measures visibility at 375, 1024, 1280 and 1440.
   */
  it("lives in the rail and in the tab bar, and in neither twice", () => {
    const { container } = render(
      <SiteShell
        locale="uk"
        market="ukraine"
        isAuthenticated
        ownerUserId="00000000-0000-4000-8000-000000000001"
      >
        <main>Сад</main>
      </SiteShell>,
    );

    const actions = [
      ...container.querySelectorAll('[data-site-shell-action="new-entry"]'),
    ];
    expect(actions).toHaveLength(2);
    const banner = screen.getByRole("banner");
    const tabBar = screen.getByRole("navigation", {
      name: "Основна мобільна навігація",
    });
    expect(actions.filter((node) => banner.contains(node))).toHaveLength(1);
    expect(actions.filter((node) => tabBar.contains(node))).toHaveLength(1);
    for (const action of actions) {
      expect(action.getAttribute("href")).toBe("/garden#first-entry-composer");
    }
    // The rail's copy is drawn only from `lg`; the bar carrying the other is
    // hidden from `lg`. A reader is never offered both.
    expect(
      actions.find((node) => banner.contains(node))!.parentElement?.className,
    ).toContain("lg:block");
    expect(tabBar.className).toContain("lg:hidden");
  });

  it("goes through sign-in for a signed-out reader, and returns to the composer", () => {
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Стрічка</main>
      </SiteShell>,
    );

    for (const action of screen.getAllByRole("link", { name: "Новий запис" })) {
      const href = action.getAttribute("href") ?? "";
      expect(href).toContain("/auth/sign-in?next=");
      expect(href).toContain("intent=create_entry");
      expect(decodeURIComponent(href)).toContain("first-entry-composer");
    }
  });
});

describe("the tab bar", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("is a named nav of five slots, and Sign in is not one of them", () => {
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Стрічка</main>
      </SiteShell>,
    );

    const bar = screen.getByRole("navigation", {
      name: "Основна мобільна навігація",
    });
    const tabs = [...bar.querySelectorAll("[data-site-shell-tab]")];
    expect(tabs.map((tab) => tab.getAttribute("data-site-shell-tab"))).toEqual([
      "feed",
      "catalogue",
      "new-entry",
      "journals",
      "you",
    ]);
    expect(bar.textContent).not.toContain("Увійти");
    expect(bar.textContent).toContain("Ви");
  });

  it("marks the active tab and only it", () => {
    mocks.pathname = "/journals";
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Журнали</main>
      </SiteShell>,
    );

    const bar = screen.getByRole("navigation", {
      name: "Основна мобільна навігація",
    });
    const current = [...bar.querySelectorAll('[aria-current="page"]')];
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("data-site-shell-tab")).toBe("journals");
  });

  it("stays off the screen the editor owns on its own", () => {
    mocks.pathname =
      "/garden/entries/11111111-1111-4111-8111-111111111111/edit";
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        isAuthenticated
        ownerUserId="00000000-0000-4000-8000-000000000001"
      >
        <main>Редагування</main>
      </SiteShell>,
    );

    expect(
      screen.queryByRole("navigation", {
        name: "Основна мобільна навігація",
      }),
    ).toBeNull();
    // The rest of the shell is untouched: only the bar goes.
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  });
});

describe("the footer the product has never had", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("links the three pages nothing linked, and the catalogue", () => {
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Стрічка</main>
      </SiteShell>,
    );

    const footer = screen.getByRole("contentinfo");
    const hrefs = [...footer.querySelectorAll("a[href]")].map((link) =>
      link.getAttribute("href"),
    );
    expect(hrefs).toContain("/privacy");
    expect(hrefs).toContain("/support");
    expect(hrefs).toContain("/first-publication-disclosure");
    expect(hrefs).toContain("/objects");
  });

  it("carries the data-source attributions and no thiings.co credit", () => {
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Стрічка</main>
      </SiteShell>,
    );

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain("Catalogue of Life");
    expect(footer.textContent).toContain("EPPO");
    // DESIGN.md §2.9, the owner's position of 2026-09-17: the free tier and no
    // attribution anywhere, this footer included. ADR-0031 D10's first draft
    // asked for the credit and was wrong about what had been decided.
    expect(document.body.textContent).not.toContain("thiings");
  });

  it("is the one home of the language control", () => {
    const { container } = render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Стрічка</main>
      </SiteShell>,
    );

    const controls = container.querySelectorAll(
      "[data-interface-language-control]",
    );
    expect(controls).toHaveLength(1);
    expect(screen.getByRole("contentinfo").contains(controls[0]!)).toBe(true);
  });
});

describe("the context rail is never the only home of an action", () => {
  it("offers nothing the page cannot reach without it", () => {
    mocks.pathname = "/journals";
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Журнали</main>
      </SiteShell>,
    );

    const context = screen.getByRole("complementary");
    const railHrefs = [...context.querySelectorAll("a[href]")].map((link) =>
      link.getAttribute("href"),
    );
    const elsewhere = new Set(
      [...document.querySelectorAll("a[href]")]
        .filter((link) => !context.contains(link))
        .map((link) => link.getAttribute("href")),
    );
    for (const href of railHrefs) {
      expect(elsewhere.has(href), `${href} is only in the context rail`).toBe(
        true,
      );
    }
  });
});

describe("the shell's server HTML", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("draws the brand lockup in the prerendered header and keeps its accessible name", () => {
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={false}>
        <main>Route content</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell-brand="true"');
    // The lockup is inline, so the header of the prerendered shell carries the
    // logo itself rather than a request for one.
    expect(html).toContain('viewBox="0 0 469 235"');
    expect(html).toContain('fill="currentColor"');
    // The mark is decorative; the link's name has to come from real text, or a
    // screen reader reads an unlabelled link to the home page.
    expect(html).toContain('<span class="sr-only">OverGarden</span>');
    // Nothing is left of the old CSS block that positioned the header.
    for (const deleted of [
      "site-shell-brand-logo",
      "site-shell-header-inner",
      "site-shell-header-icon",
      "site-shell-header-actions",
      "site-shell-layout",
      "site-shell-viewport-rail",
    ]) {
      expect(html, `${deleted} outlived its markup`).not.toContain(deleted);
    }
  });

  it("serializes no account data into the signed-in shell", () => {
    mocks.pathname = "/garden";
    const html = renderToStaticMarkup(
      <SiteShell
        locale="bg"
        market="bulgaria"
        isAuthenticated
        ownerUserId="00000000-0000-4000-8000-000000000001"
      >
        <main>Лично съдържание</main>
      </SiteShell>,
    );

    expect(html).toContain("Моята градина");
    expect(html).toContain("Нов запис");
    expect(html).toContain('href="/bg"');
    expect(html).toContain('href="/bg/notifications"');
    expect(html).not.toMatch(
      /private@example|private-user|private-session|owner_user_id/i,
    );
    expect(html).toContain(
      'data-owner-scope="00000000-0000-4000-8000-000000000001"',
    );
    expect(html).toContain(
      'data-session-signal-boundary="00000000-0000-4000-8000-000000000001"',
    );
    expect(html).not.toContain('href="/account/communities"');
    expect(html).not.toContain('href="/account/moderation/comments"');
    expect(html).not.toContain('href="/garden/privacy/erasure-requests"');
  });

  it("renders account moderation inside the product shell", () => {
    mocks.pathname = "/account/communities";
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated={true}>
        <main>Account moderation</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="root"');
    expect(html).toContain("Account moderation");
    expect(html).toContain('data-site-shell-region="header"');
    expect(html).toContain('data-site-shell-region="footer"');
    expect(html).not.toContain('data-authenticated-utility-region="true"');
  });

  it("keeps guest account moderation free of owner links", () => {
    mocks.pathname = "/account/communities";
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

  it("keeps native erasure mutation-capable without mounting private navigation", () => {
    mocks.pathname = "/erasure";
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
    expect(html).not.toContain('data-site-shell-region="header"');
    expect(html).not.toContain('data-site-shell-region="mobile-navigation"');
    expect(html).not.toContain("data-sign-out-control");
  });

  it("keeps the server-authorized erasure owner review outside the local garden gate", () => {
    mocks.pathname = "/garden/privacy/erasure-requests";
    const html = renderToStaticMarkup(
      <SiteShell locale="uk" market="ukraine" isAuthenticated>
        <main>Erasure owner review</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="safe-exit"');
    expect(html).toContain("Erasure owner review");
    expect(html).not.toContain('data-site-shell-region="header"');
  });

  it("closes the mobile sheet before opening the shared sign-out flow", async () => {
    const source = await readShellSource();

    expect(source).toContain("open={mobileMenuOpen}");
    expect(source).toMatch(
      /onBeforeRequest=\{\(\)\s*=>\s*onOpenChange\(false\)\s*\}/,
    );
  });

  it("mounts the owner scope and sign-out provider only for authenticated shells", async () => {
    const source = await readShellSource();
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
  it("never routes the reader through an intermediate page", () => {
    // The defect: the header's "sign in" button read a navigation item's
    // *label* and hard-coded `href="/garden"` beside it, so the control landed
    // on the workspace empty state, which offers a second "sign in" before the
    // form. Reported by the owner on 2026-09-04.
    mocks.pathname = "/bg/journals";
    const html = renderToStaticMarkup(
      <SiteShell locale="bg" market="bulgaria" isAuthenticated={false}>
        <main>Route content</main>
      </SiteShell>,
    );

    const signInControls = [
      ...html.matchAll(
        /(?:data-site-shell-action="sign-in[^"]*"|data-site-shell-tab="you")[^>]*/g,
      ),
    ].map((match) => match[0]);
    expect(signInControls.length).toBeGreaterThanOrEqual(2);
    for (const control of signInControls) {
      expect(control).toMatch(/href="\/auth\/sign-in/);
    }

    // And it brings the reader back to what they were reading, rather than
    // depositing them in the workspace.
    expect(html).toContain("/auth/sign-in?next=%2Fbg%2Fjournals");
  });

  it("offers no sign-in control at all once the reader is signed in", () => {
    mocks.pathname = "/bg/journals";
    const html = renderToStaticMarkup(
      <SiteShell
        locale="bg"
        market="bulgaria"
        isAuthenticated
        ownerUserId="owner-1"
      >
        <main>Route content</main>
      </SiteShell>,
    );

    expect(html).not.toContain('data-site-shell-action="sign-in');
    // And the fifth tab means their profile rather than a form.
    expect(html).toContain('data-site-shell-tab="you"');
    expect(html).toContain('href="/garden/profile"');
  });
});

describe("the sealed owner's links", () => {
  it("reaches the account menu and nowhere else in the rail", async () => {
    mocks.pathname = "/garden";
    const user = (await import("@testing-library/user-event")).default;
    render(
      <SiteShell locale="uk" market="ukraine" isAuthenticated hasOperatorAccess>
        <main>Сад власника</main>
      </SiteShell>,
    );

    const banner = screen.getByRole("banner");
    expect(
      within(banner).queryByRole("link", { name: /Спільноти/ }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Обліковий запис" }));
    // Scoped by marker, not by role: the language control in the footer is a
    // `role="menu"` disclosure that is always in the document, so the first
    // `menu` in the tree is not this one.
    const menu = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(
        '[data-site-shell-account-menu="true"]',
      );
      if (!found) throw new Error("account menu did not open");
      return found;
    });
    expect(menu.getAttribute("role")).toBe("menu");
    const hrefs = [...menu.querySelectorAll("a[href]")].map((link) =>
      link.getAttribute("href"),
    );
    expect(hrefs).toContain("/garden/profile");
    expect(hrefs).toContain("/account/communities");
    expect(hrefs).toContain("/account/moderation/comments");
    expect(hrefs).toContain("/garden/privacy/erasure-requests");
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/garden/catalog/registry");
    expect(
      within(menu).getByRole("button", { name: /Вийти|Вихід/ }),
    ).toBeTruthy();
  });
});
