// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  push: () => {},
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  // The command palette pushes a route when a result is chosen; the shell only
  // needs it to exist here.
  useRouter: () => ({ push: mocks.push }),
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
  useOwnerScopeControl: () => () => undefined,
}));

import { GUEST_SITE_SHELL_SESSION_STATE } from "@/lib/site-shell-session-state";
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
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
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
        session={{
          isAuthenticated: true,
          ownerUserId: "00000000-0000-4000-8000-000000000001",
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
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
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
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
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
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
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
        <main>Журнали</main>
      </SiteShell>,
    );

    const current = [...container.querySelectorAll('[aria-current="page"]')];
    expect(current.length).toBeGreaterThan(0);
    for (const item of current) {
      expect(item.textContent).toContain("Стрічка");
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
        session={{
          isAuthenticated: true,
          ownerUserId: "00000000-0000-4000-8000-000000000001",
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
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
      expect(action.getAttribute("href")).toBe("/garden/new");
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
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
        <main>Стрічка</main>
      </SiteShell>,
    );

    for (const action of screen.getAllByRole("link", { name: "Новий запис" })) {
      const href = action.getAttribute("href") ?? "";
      expect(href).toContain("/auth/sign-in?next=");
      expect(href).toContain("intent=create_entry");
      expect(decodeURIComponent(href)).toContain("/garden/new");
    }
  });
});

describe("the tab bar", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("is a named nav of five slots, and Sign in is not one of them", () => {
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
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
      "garden",
      "notifications",
    ]);
    expect(bar.textContent).not.toContain("Увійти");
    expect(bar.textContent).toContain("Мій сад");
  });

  it("marks the active tab and only it", () => {
    mocks.pathname = "/journals";
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
        <main>Журнали</main>
      </SiteShell>,
    );

    const bar = screen.getByRole("navigation", {
      name: "Основна мобільна навігація",
    });
    const current = [...bar.querySelectorAll('[aria-current="page"]')];
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("data-site-shell-tab")).toBe("feed");
  });

  it("stays off the screen the editor owns on its own", () => {
    mocks.pathname =
      "/garden/entries/11111111-1111-4111-8111-111111111111/edit";
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={{
          isAuthenticated: true,
          ownerUserId: "00000000-0000-4000-8000-000000000001",
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
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
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
        <main>Стрічка</main>
      </SiteShell>,
    );

    const footer = screen.getByRole("contentinfo");
    const hrefs = [...footer.querySelectorAll("a[href]")].map((link) =>
      link.getAttribute("href"),
    );
    expect(hrefs).toContain("/privacy");
    expect(hrefs).toContain("/support");
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/cookies");
    expect(hrefs).not.toContain("/first-publication-disclosure");
    // One catalogue entrance in the footer, as in the rail (`OVE-451`).
    expect(hrefs).toContain("/catalog");
    expect(hrefs).not.toContain("/objects");
  });

  it("carries the data-source attributions and no thiings.co credit", () => {
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
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

  it("is the one home of the language control, in either market", () => {
    // Exactly one per rendered document, in both markets and in all three
    // languages (`docs/INTERFACE_LOCALE_CONTRACT.md`). Production served a
    // Ukrainian page with Bulgarian chrome *and* a control offering Bulgarian
    // to a reader it had just called Bulgarian; one control, named once, is
    // what the contract asks for and what this counts.
    for (const [locale, market] of [
      ["uk", "ukraine"],
      ["bg", "bulgaria"],
      ["ru", "bulgaria"],
      ["uk", "bulgaria"],
      ["bg", "ukraine"],
    ] as const) {
      const { container, unmount } = render(
        <SiteShell
          locale={locale}
          market={market}
          session={GUEST_SITE_SHELL_SESSION_STATE}
        >
          <main>Route content</main>
        </SiteShell>,
      );

      const controls = container.querySelectorAll(
        "[data-interface-language-control]",
      );
      expect(controls, `${market}/${locale}`).toHaveLength(1);
      expect(
        controls[0]!.getAttribute("data-interface-market"),
        `${market}/${locale}`,
      ).toBe(market);
      expect(
        screen.getAllByRole("contentinfo")[0]!.contains(controls[0]!),
        `${market}/${locale}`,
      ).toBe(true);
      // All three languages are offered in either market; the market decides
      // only which one a reader who has chosen nothing starts in.
      expect(
        controls[0]!.querySelectorAll("[data-interface-locale]"),
      ).toHaveLength(3);
      unmount();
    }
  });
});

describe("the context rail is never the only home of an action", () => {
  it("offers nothing the page cannot reach without it", () => {
    mocks.pathname = "/journals";
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
        <main>Журнали</main>
      </SiteShell>,
    );

    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.body.textContent).not.toContain("Почати журнал");
  });
});

describe("the shell's server HTML", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("draws the brand lockup in the prerendered header and keeps its accessible name", () => {
    const html = renderToStaticMarkup(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
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
        session={{
          isAuthenticated: true,
          ownerUserId: "00000000-0000-4000-8000-000000000001",
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
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
      <SiteShell
        locale="uk"
        market="ukraine"
        session={{
          isAuthenticated: true,
          ownerUserId: null,
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
      >
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
      <SiteShell
        locale="uk"
        market="ukraine"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
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
        session={{
          isAuthenticated: true,
          ownerUserId: "00000000-0000-4000-8000-000000000001",
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
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
    // No garden, no navigation — and still the one language control every
    // document carries (DESIGN.md §6, `OVE-478`).
    expect(
      html.match(
        /data-interface-language-control="site-shell-interface-language-control"/g,
      ),
    ).toHaveLength(1);
  });

  it("keeps the server-authorized erasure owner review outside the local garden gate", () => {
    mocks.pathname = "/garden/privacy/erasure-requests";
    const html = renderToStaticMarkup(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={{
          isAuthenticated: true,
          ownerUserId: null,
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
      >
        <main>Erasure owner review</main>
      </SiteShell>,
    );

    expect(html).toContain('data-site-shell="safe-exit"');
    expect(html).toContain("Erasure owner review");
    expect(html).not.toContain('data-site-shell-region="header"');
    expect(
      html.match(
        /data-interface-language-control="site-shell-interface-language-control"/g,
      ),
    ).toHaveLength(1);
  });

  it("closes the mobile sheet before opening the shared sign-out flow", async () => {
    // The sheet is a module of its own since `OVE-468`: its code arrives on
    // the first press, and it arrives open.
    const source = await readFile(
      resolve(
        process.cwd(),
        "src/components/site-shell/site-shell-mobile-sheet.tsx",
      ),
      "utf8",
    );

    // The menu owns whether it is open — state in the chrome would render the
    // chrome, and the page inside it, for a sheet (ADR-0032 D10).
    expect(source).toContain(
      "const [open, onOpenChange] = useState(defaultOpen);",
    );
    expect(source).toMatch(
      /onBeforeRequest=\{\(\)\s*=>\s*onOpenChange\(false\)\s*\}/,
    );
  });

  it("mounts the owner scope and the sign-out provider once around the framed shell", async () => {
    const source = await readShellSource();
    // They used to wrap the shell only for a signed-in reader. A static
    // document does not know who is reading while it renders (ADR-0032 D2), and
    // wrapping a tree in a provider *after* the session settles is a different
    // element type at the root — React would remount every page under it. So
    // the framed shell always mounts both. The owner's id reaches the scope
    // once it is known — through a leaf beside the page, never as a prop that
    // changes above it (ADR-0032 D10). The order is unchanged: the scope
    // outside, sign-out inside.
    expect(
      source.match(
        /<OwnerScopeProvider\s+locale=\{locale\}\s+ownerUserId=\{renderedFor\?\.ownerUserId \?\? null\}\s*>\s*<OwnerScopeFromSession \/>\s*<SignOutProvider locale=\{locale\}>/g,
      ),
    ).toHaveLength(1);
    // The two unframed shapes are workspace routes in a request-time document,
    // where the session is a value, and keep the rule they had.
    expect(source).toContain(
      'if (!isAuthenticated || placement !== "utility") {',
    );
    expect(source).not.toMatch(
      /<SignOutProvider locale=\{locale\}>\s*<OwnerScopeProvider/,
    );
    // One per shape, and in the framed shell only once the session is known —
    // a boundary that ran with "guest" first would tell every other tab the
    // gardener had signed out.
    expect(source.match(/<SessionSignalBoundary/g)).toHaveLength(3);
  });

  it("holds no state in the component the page renders inside", async () => {
    // ADR-0032 D10. The page is a child of the framed shell, and the page is
    // what may still be arriving when the session settles, the address becomes
    // known or a page fills the rail. Anything that renders this component
    // again by itself hands new props to every boundary it draws, and a context
    // it changes reaches the ones below; React answers both by rendering what
    // it has not hydrated on the client. `shell-state-stability.test.tsx`
    // holds the mechanism; this holds the one place it is easy to undo.
    const source = await readShellSource();
    const framed = source.slice(
      source.indexOf("function FramedSiteShell({"),
      source.indexOf("function OwnerScopeFromSession("),
    );

    expect(framed.length).toBeGreaterThan(1_000);
    expect(framed).not.toMatch(
      /\buse(?:State|Reducer|SyncExternalStore|SettledShellSession|ShellPathnameValue|ShellSession|ValueStore)\(/,
    );
  });

  it("never signals a session it has not been told about", () => {
    mocks.pathname = "/journals";
    const pending = renderToStaticMarkup(
      <SiteShell
        document="static"
        locale="uk"
        session={new Promise(() => undefined)}
      >
        <main>Route content</main>
      </SiteShell>,
    );
    const known = renderToStaticMarkup(
      <SiteShell locale="uk" session={GUEST_SITE_SHELL_SESSION_STATE}>
        <main>Route content</main>
      </SiteShell>,
    );

    expect(pending).not.toContain("data-session-signal-boundary");
    expect(known).toContain('data-session-signal-boundary="guest"');
    // And the static document still carries a guest's working chrome.
    expect(pending).toContain('data-site-shell-action="sign-in"');
    expect(pending).toContain("<main>Route content</main>");
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
      <SiteShell
        locale="bg"
        market="bulgaria"
        session={GUEST_SITE_SHELL_SESSION_STATE}
      >
        <main>Route content</main>
      </SiteShell>,
    );

    const signInControls = [
      ...html.matchAll(
        /(?:data-site-shell-action="sign-in[^"]*"|data-site-shell-tab="garden")[^>]*/g,
      ),
    ].map((match) => match[0]);
    expect(signInControls.length).toBeGreaterThanOrEqual(2);
    for (const control of signInControls) {
      expect(control).toMatch(/href="\/auth\/sign-in/);
    }

    // And it brings the reader back to what they were reading, rather than
    // depositing them in the workspace — by the address's one spelling
    // (ADR-0032 D3): the prefix is how a language is chosen, and the reader who
    // comes back has already chosen.
    expect(html).toContain("/auth/sign-in?next=%2Fjournals");
  });

  it("offers no sign-in control at all once the reader is signed in", () => {
    mocks.pathname = "/bg/journals";
    const html = renderToStaticMarkup(
      <SiteShell
        locale="bg"
        market="bulgaria"
        session={{
          isAuthenticated: true,
          ownerUserId: "owner-1",
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
      >
        <main>Route content</main>
      </SiteShell>,
    );

    expect(html).not.toContain('data-site-shell-action="sign-in');
    // Protected destinations remain jobs; account utilities are in the menu.
    expect(html).toContain('data-site-shell-tab="garden"');
    expect(html).toContain('data-site-shell-account-menu-trigger="true"');
  });
});

describe("the sealed owner's links", () => {
  it("reaches the account menu and nowhere else in the rail", async () => {
    mocks.pathname = "/garden";
    const user = (await import("@testing-library/user-event")).default;
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={{
          isAuthenticated: true,
          ownerUserId: null,
          hasOperatorAccess: true,
          sessionStore: "reachable",
        }}
      >
        <main>Сад власника</main>
      </SiteShell>,
    );

    const banner = screen.getByRole("banner");
    expect(
      within(banner).queryByRole("link", { name: /Спільноти/ }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Акаунт" }));
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

  // `OVE-456` AC5. The menu groups: the reader's own pages, settings, the
  // owner's pages under the sealed role, sign out — and the owner's five links
  // stay exactly five unless the owner approves a sixth.
  it("groups the menu, and the owner's group is exactly its five links", async () => {
    mocks.pathname = "/garden";
    const user = (await import("@testing-library/user-event")).default;
    const { OPERATOR_MENU_LINKS } = await import("@/lib/operator-menu-copy");
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={{
          isAuthenticated: true,
          ownerUserId: null,
          hasOperatorAccess: true,
          sessionStore: "reachable",
        }}
      >
        <main>Сад власника</main>
      </SiteShell>,
    );

    await user.click(screen.getByRole("button", { name: "Акаунт" }));
    const menu = await openAccountMenu();

    const personal = menu.querySelector<HTMLElement>(
      '[data-site-shell-account-pages="true"]',
    );
    expect(personal).not.toBeNull();
    expect(hrefsOf(personal!)).toEqual([
      "/garden/profile",
      "/bookmarks",
      "/garden/lineage/claims",
    ]);

    const settings = menu.querySelector<HTMLElement>(
      '[data-site-shell-account-settings="true"]',
    );
    expect(settings).not.toBeNull();
    // The account's settings and its sign-in, then privacy and erasure
    // (`OVE-503`): the pages the public profile's editor used to carry.
    expect(hrefsOf(settings!)).toEqual([
      "/account/settings",
      "/account/security",
      "/privacy",
      "/erasure",
    ]);

    const operator = menu.querySelector<HTMLElement>(
      '[data-site-shell-operator-menu="true"]',
    );
    expect(operator).not.toBeNull();
    expect(hrefsOf(operator!)).toEqual(
      OPERATOR_MENU_LINKS.map((link) => link.href),
    );
    expect(OPERATOR_MENU_LINKS).toHaveLength(5);
  });

  it("renders nothing of the owner's group for a gardener who is not the owner", async () => {
    mocks.pathname = "/garden";
    const user = (await import("@testing-library/user-event")).default;
    const { OPERATOR_MENU_LINKS } = await import("@/lib/operator-menu-copy");
    render(
      <SiteShell
        locale="uk"
        market="ukraine"
        session={{
          isAuthenticated: true,
          ownerUserId: null,
          hasOperatorAccess: false,
          sessionStore: "reachable",
        }}
      >
        <main>Сад</main>
      </SiteShell>,
    );

    await user.click(screen.getByRole("button", { name: "Акаунт" }));
    const menu = await openAccountMenu();

    expect(
      menu.querySelector('[data-site-shell-operator-menu="true"]'),
    ).toBeNull();
    const hrefs = hrefsOf(menu);
    for (const link of OPERATOR_MENU_LINKS) {
      expect(hrefs).not.toContain(link.href);
    }
    // Their own pages and their settings are still there: the menu is the only
    // place they exist below `lg`, where there is no rail.
    expect(hrefs).toContain("/bookmarks");
    expect(hrefs).toContain("/erasure");
  });
});

function hrefsOf(scope: HTMLElement) {
  return [...scope.querySelectorAll("a[href]")].map((link) =>
    link.getAttribute("href"),
  );
}

async function openAccountMenu() {
  return waitFor(() => {
    const found = document.querySelector<HTMLElement>(
      '[data-site-shell-account-menu="true"]',
    );
    if (!found) throw new Error("account menu did not open");
    return found;
  });
}
