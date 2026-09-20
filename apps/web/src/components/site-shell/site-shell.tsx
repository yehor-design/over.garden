"use client";

import Link from "next/link";
import { Menu as MenuIcon, SquarePen, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AuthenticatedUtilityRegion } from "@/components/auth/authenticated-utility-region";
import {
  OwnerScopeProvider,
  useOwnerScopeControl,
} from "@/components/auth/owner-scope";
import { SessionSignalBoundary } from "@/components/auth/session-signal-boundary";
import { SignOutControl } from "@/components/auth/sign-out-control";
import { SignOutProvider } from "@/components/auth/sign-out-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from "@/components/ui/command-palette";
import { IconButton } from "@/components/ui/icon-button";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import type { InterfaceMarket } from "@/lib/interface-market";
import {
  getOperatorMenuCopy,
  OPERATOR_MENU_LINKS,
} from "@/lib/operator-menu-copy";
import {
  getInterfaceLanguageControlPlacement,
  isSafeExitRoute,
} from "@/lib/interface-route-policy";
import {
  getSiteShellNavigation,
  getSiteShellRouteContext,
  isSiteShellComposerRoute,
  type SiteShellNavigation,
  type SiteShellNavigationItem,
  type SiteShellNavigationKey,
} from "@/lib/site-shell-navigation";
import type { SiteShellSessionInput } from "@/lib/site-shell-session-state";
import {
  SiteShellMobileNavigation,
  SiteShellMobileUtilities,
  SiteShellNavigationList,
} from "./site-shell-navigation";
import {
  SiteShellContextRailOutlet,
  SiteShellContextRailProvider,
} from "./site-shell-context-rail";
import { SiteShellFooter } from "./site-shell-footer";
import { SiteShellLocaleProvider } from "./site-shell-locale-context";
import { OverGardenLogo } from "./over-garden-logo";
import {
  ShellPathnameRegion,
  ShellRegion,
  ShellSessionRegion,
  ShellSettledSessionRegion,
  ShellStateProvider,
  useInitialShellSession,
  useSettledShellSession,
  useSettledShellSessionReader,
  useShellPathname,
  useShellSession,
} from "./shell-session";

/**
 * One shell for both halves of the product (ADR-0031 D4, DESIGN.md §3.2).
 *
 * ```
 * < lg        [ header 56 ]  [ content ]  [ tab bar 56 ]
 * lg → xl     [ rail 240 ]   [ content max 704 ]
 * ≥ xl        [ rail 240 ]   [ content max 704 ]  [ context 300 ]
 * ```
 *
 * The `<header>` element is one element in two shapes: a 56 px top bar below
 * `lg`, the 240 px left rail at `lg` and above. That is what keeps the `banner`
 * landmark present at every width while criterion 1 — exactly one top-level
 * `<header>` — stays literally true. The `<main>` is the page's own; the shell
 * renders the region it goes in and never a second one.
 *
 * The rail carries brand → navigation → **the one primary action** → account,
 * the order X, Substack, Threads, Digg, Circle and Whop all arrived at. The
 * action used to render in the rail *and* the header, which is two primaries on
 * one screen (DESIGN.md §4.4).
 */
export function SiteShell({
  children,
  locale,
  market,
  session,
  communitiesReady = false,
  document = "request",
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  /**
   * A fact about the reader, so a static document does not have one. A
   * request-time document passes it; nothing the chrome draws depends on it.
   */
  market?: InterfaceMarket;
  /** A value in a request-time document, a promise in a static one. */
  session: SiteShellSessionInput;
  communitiesReady?: boolean;
  /**
   * Which of the two documents this chrome belongs to (ADR-0032 D1). A static
   * one is always the framed shell: the two unframed shapes are workspace
   * routes, and choosing between them takes the address, which a static
   * document may not read outside a region of its own.
   */
  document?: "static" | "request";
}) {
  return (
    <ShellStateProvider session={session} document={document}>
      <SiteShellLocaleProvider locale={locale}>
        {document === "request" ? (
          <RequestSiteShell
            locale={locale}
            market={market}
            communitiesReady={communitiesReady}
          >
            {children}
          </RequestSiteShell>
        ) : (
          <FramedSiteShell locale={locale} communitiesReady={communitiesReady}>
            {children}
          </FramedSiteShell>
        )}
      </SiteShellLocaleProvider>
    </ShellStateProvider>
  );
}

/** A request-time document knows its address, and three shapes depend on it. */
function RequestSiteShell({
  children,
  locale,
  market,
  communitiesReady,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  market?: InterfaceMarket;
  communitiesReady: boolean;
}) {
  // A request-time document always knows its address, and reads it from the
  // router as it renders: which of the three shapes to draw has to change in
  // the same commit as the page inside it.
  const pathname = useShellPathname();
  const placement = getInterfaceLanguageControlPlacement(pathname);

  if (isSafeExitRoute(pathname) || placement !== "site-shell") {
    return (
      <UnframedSiteShell
        locale={locale}
        market={market}
        pathname={pathname}
        placement={placement}
      >
        {children}
      </UnframedSiteShell>
    );
  }

  return (
    <FramedSiteShell
      locale={locale}
      market={market}
      communitiesReady={communitiesReady}
    >
      {children}
    </FramedSiteShell>
  );
}

/**
 * The chrome every reader sees. It reads neither the address nor the session
 * itself: each part that depends on one is a region of its own, so the frame,
 * the navigation and the page inside it are plain HTML in a static document's
 * first bytes (ADR-0032 D2, D3).
 *
 * **It holds no state, and nothing it provides changes by itself** (ADR-0032
 * D10). The page is rendered inside this component, and the page is what may
 * still be arriving when the session settles, the address becomes known or a
 * page fills the context rail. Each of those used to render this component
 * again; each is now a leaf that renders itself.
 */
function FramedSiteShell({
  children,
  locale,
  market,
  communitiesReady,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  market?: InterfaceMarket;
  communitiesReady: boolean;
}) {
  const navigationFor = useCallback(
    (isAuthenticated: boolean, pathname: string | null = null) =>
      getSiteShellNavigation(
        locale,
        isAuthenticated,
        communitiesReady,
        pathname ?? undefined,
      ),
    [communitiesReady, locale],
  );
  const guestNavigation = navigationFor(false);
  const copy = getInterfaceCopy(locale);
  // Known while rendering in a request-time document, and `null` in a static
  // one — where the owner is named later, by `OwnerScopeFromSession`.
  const renderedFor = useInitialShellSession();
  // The palette asks when a query settles, by which time the session has: a
  // dialog nobody has opened is no reason to render the whole chrome again.
  const readSettledSession = useSettledShellSessionReader();
  const readPaletteActions = useCallback(
    () =>
      paletteActions(
        navigationFor(readSettledSession()?.isAuthenticated ?? false),
      ),
    [navigationFor, readSettledSession],
  );

  return (
    <>
      <ShellSessionRegion
        render={(resolved) =>
          resolved ? (
            <SessionSignalBoundary
              locale={locale}
              ownerUserId={resolved.ownerUserId}
            />
          ) : null
        }
      />
      <OwnerScopeProvider
        locale={locale}
        ownerUserId={renderedFor?.ownerUserId ?? null}
      >
        <OwnerScopeFromSession />
        <SignOutProvider locale={locale}>
          <SiteShellContextRailProvider>
            {/* One dialog for however many triggers the shell draws. Mounted
                twice, `⌘K` opened two palettes and a screen reader saw two
                comboboxes — found by driving it, not by reading it. */}
            <CommandPaletteProvider locale={locale} actions={readPaletteActions}>
              <div
                data-site-shell="root"
                className="flex min-h-dvh min-w-0 flex-col bg-surface text-text"
              >
                <a
                  href="#main-content"
                  className="sr-only z-toast rounded-md border border-border bg-surface px-3 py-2 text-body-sm font-medium text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:outline-2 focus:outline-offset-2 focus:outline-focus-ring"
                >
                  {copy.shell.skipToContent}
                </a>

                <div className="grid min-w-0 flex-1 lg:grid-cols-shell xl:grid-cols-shell-wide">
                  <header
                    data-site-shell-region="header"
                    className="sticky top-0 z-header flex min-h-14 min-w-0 items-center gap-1 border-b border-border bg-surface px-2 lg:h-dvh lg:flex-col lg:items-stretch lg:gap-0 lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-3 lg:py-4"
                  >
                    {/* Closed in the served HTML, so what is inside it may
                        wait for the session without a boundary. */}
                    <ShellSettledSessionRegion
                      render={(settled) => (
                        <MobileMenu
                          navigation={navigationFor(
                            settled?.isAuthenticated ?? false,
                          )}
                          isAuthenticated={settled?.isAuthenticated ?? false}
                        />
                      )}
                    />

                    <Link
                      data-site-shell-brand="true"
                      href={guestNavigation.publicItems[0]?.href ?? "/"}
                      className="flex min-h-11 min-w-0 shrink-0 items-center rounded-md px-2 py-1 text-action outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:mb-4 lg:px-2"
                    >
                      <OverGardenLogo className="h-7 w-auto shrink-0 lg:h-8" />
                      <span className="sr-only">OverGarden</span>
                    </Link>

                    {/* The rail's navigation, at `lg` and above. The palette
                        sits above it: search is a way into everything, and the
                        two plain links below it are the way in without
                        JavaScript (ADR-0031 D7). */}
                    <div className="hidden min-w-0 flex-col gap-4 lg:flex">
                      <CommandPaletteTrigger label={copy.palette.open} />
                      <ShellPathnameRegion
                        render={(pathname) => (
                          <SiteShellNavigationList
                            items={guestNavigation.publicItems}
                            pathname={pathname}
                            ariaLabel={guestNavigation.labels.siteNavigation}
                          />
                        )}
                      />
                      {/* A gardener's own destinations. A guest has none, so
                          the static document carries nothing here and the list
                          arrives with the session. */}
                      <ShellRegion
                        render={({ pathname, session: resolved }) => {
                          const personal = navigationFor(
                            resolved?.isAuthenticated ?? false,
                          );
                          return personal.personalItems.length > 0 ? (
                            <SiteShellNavigationList
                              items={personal.personalItems}
                              pathname={pathname}
                              ariaLabel={personal.labels.personalSection}
                            />
                          ) : null;
                        }}
                      />
                    </div>

                    {/* The primary action is in the rail above `lg` and in the
                        tab bar below it: one control visible to a reader at any
                        width, and never the two the header and the rail used to
                        draw at once (DESIGN.md §4.4, ADR-0031 D4). Where it
                        leads is the one thing about it that depends on the
                        reader, so the guest's link is what the document carries
                        and the gardener's replaces it in the same box. */}
                    <div className="mt-4 hidden w-full lg:block">
                      <ShellSessionRegion
                        render={(resolved) => (
                          <PrimaryAction
                            item={
                              navigationFor(resolved?.isAuthenticated ?? false)
                                .primaryAction
                            }
                          />
                        )}
                      />
                    </div>

                    <div
                      data-site-shell-mobile-search="true"
                      className="ml-auto flex shrink-0 items-center lg:hidden"
                    >
                      <CommandPaletteTrigger
                        presentation="icon"
                        label={copy.palette.open}
                      />
                    </div>

                    <div className="mt-auto hidden w-full flex-col gap-2 pt-4 lg:flex">
                      <Separator />
                      <ShellRegion
                        render={({ pathname, session: resolved }) => (
                          <AccountRegion
                            locale={locale}
                            navigation={navigationFor(
                              resolved?.isAuthenticated ?? false,
                              pathname,
                            )}
                            isAuthenticated={resolved?.isAuthenticated ?? false}
                            hasOperatorAccess={
                              resolved?.hasOperatorAccess ?? false
                            }
                          />
                        )}
                      />
                    </div>
                  </header>

                  {/* The column clears the tab bar, not just the content inside
                      it: the footer is the last thing on a short page, and
                      padding the content alone left it underneath the bar. */}
                  <div
                    data-site-shell-column="true"
                    className="site-shell-content-safe-bottom flex min-w-0 flex-col"
                  >
                    <div
                      id="main-content"
                      data-interface-locale-fragment-safe="true"
                      data-site-shell-region="content"
                      tabIndex={-1}
                      className="mx-auto w-full max-w-content min-w-0 flex-1 outline-none"
                    >
                      {children}
                    </div>

                    <ShellPathnameRegion
                      render={(pathname) => (
                        <SiteShellFooter
                          locale={locale}
                          market={market}
                          pathname={pathname}
                          links={guestNavigation.footerLinks}
                          navigationLabel={
                            guestNavigation.labels.footerNavigation
                          }
                          tagline={copy.shell.footerTagline}
                          sourcesTitle={copy.shell.sourcesTitle}
                          sourcesDescription={copy.shell.sourcesDescription}
                        />
                      )}
                    />
                  </div>

                  <aside
                    data-site-shell-region="context"
                    aria-label={guestNavigation.labels.contextRail}
                    className="sticky top-0 hidden h-dvh self-start overflow-y-auto border-l border-border px-5 py-6 xl:block"
                  >
                    <SiteShellContextRailOutlet
                      fallback={
                        <ShellPathnameRegion
                          render={(pathname) => (
                            <DefaultRouteContext
                              locale={locale}
                              pathname={pathname}
                              railTitle={guestNavigation.labels.contextTitle}
                            />
                          )}
                        />
                      }
                    />
                  </aside>
                </div>

                {/* Five slots in both states, and two of them lead somewhere
                    else for a gardener: the action opens the composer instead
                    of the sign-in screen, and "You" opens their profile. Same
                    labels, same icons, same box — the swap moves nothing. */}
                <ShellRegion
                  render={({ pathname, session: resolved }) => {
                    if (
                      pathname !== null &&
                      isSiteShellComposerRoute(pathname)
                    ) {
                      return null;
                    }
                    const mobile = navigationFor(
                      resolved?.isAuthenticated ?? false,
                      pathname,
                    );
                    return (
                      <SiteShellMobileNavigation
                        items={mobile.mobileItems}
                        pathname={pathname}
                        ariaLabel={mobile.labels.mobileNavigation}
                        primaryActionKey={mobile.primaryAction.key}
                      />
                    );
                  }}
                />
              </div>
            </CommandPaletteProvider>
          </SiteShellContextRailProvider>
        </SignOutProvider>
      </OwnerScopeProvider>
    </>
  );
}

/**
 * Names the owner once a static document learns who is reading (ADR-0032 D10).
 * A leaf beside the page: the scope above it does not render again.
 */
function OwnerScopeFromSession() {
  const settled = useSettledShellSession();
  const nameOwner = useOwnerScopeControl();

  useEffect(() => {
    if (settled) nameOwner(settled.ownerUserId);
  }, [nameOwner, settled]);

  return null;
}

/**
 * What the context rail says on a route that feeds it nothing of its own.
 * With no address yet it says nothing: a heading that changes a moment later
 * is worse than a rail that is briefly empty.
 */
function DefaultRouteContext({
  locale,
  pathname,
  railTitle,
}: {
  locale: InterfaceLocale;
  pathname: string | null;
  railTitle: string;
}) {
  if (pathname === null) return null;
  const context = getSiteShellRouteContext(pathname, locale);

  return (
    <div className="flex flex-col gap-3">
      {/* The eyebrow names the rail and the heading names the destination. On
          a route with no destination of its own they are the same word, and
          the rail read "Далі / Далі" until somebody looked at it. */}
      {context.title === railTitle ? null : (
        <p className="text-overline text-text-muted uppercase">{railTitle}</p>
      )}
      <h2 className="text-h4 text-text-heading">{context.title}</h2>
      <p className="text-body-sm text-text-secondary">{context.description}</p>
      <div className="flex flex-col gap-2 pt-1">
        <Link
          href={context.primaryHref}
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "justify-start",
          })}
        >
          {context.primaryLabel}
        </Link>
      </div>
    </div>
  );
}

/**
 * The two shapes that draw no chrome: the erasure exit, and the routes whose
 * language control rides in the utility region. Both are workspace routes, so
 * the document that renders them has already awaited the session and this
 * reads a value, never a pending promise.
 */
function UnframedSiteShell({
  children,
  locale,
  market,
  pathname,
  placement,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  market?: InterfaceMarket;
  pathname: string;
  placement: ReturnType<typeof getInterfaceLanguageControlPlacement>;
}) {
  const { isAuthenticated, ownerUserId } = useShellSession();

  if (isSafeExitRoute(pathname)) {
    // The native erasure page intentionally contains no garden payload or
    // authenticated navigation. It stays outside the session convergence
    // guard so a failed session recheck cannot trap a person in an account.
    return (
      <>
        <SessionSignalBoundary locale={locale} ownerUserId={ownerUserId} />
        {isAuthenticated ? (
          <OwnerScopeProvider locale={locale} ownerUserId={ownerUserId}>
            <div
              data-site-shell="safe-exit"
              data-site-shell-safe-exit="erasure"
            >
              {children}
            </div>
          </OwnerScopeProvider>
        ) : (
          <div data-site-shell="safe-exit" data-site-shell-safe-exit="erasure">
            {children}
          </div>
        )}
      </>
    );
  }

  // The utility region carries the control on the routes that have no shell.
  const showUtility = placement === "utility";
  const excludedShell = (
    <>
      <SessionSignalBoundary locale={locale} ownerUserId={ownerUserId} />
      <div data-site-shell="excluded">
        {showUtility ? (
          <AuthenticatedUtilityRegion
            locale={locale}
            market={market}
            pathname={pathname}
            isAuthenticated={isAuthenticated}
          />
        ) : null}
        {children}
      </div>
    </>
  );

  if (!isAuthenticated || placement !== "utility") {
    return excludedShell;
  }

  return (
    <OwnerScopeProvider locale={locale} ownerUserId={ownerUserId}>
      <SignOutProvider locale={locale}>{excludedShell}</SignOutProvider>
    </OwnerScopeProvider>
  );
}

/**
 * The palette's fifth group: what the rail can do, as commands. It is built
 * from the same navigation the rail renders, so a group that drifts from the
 * rail is not a thing that can happen.
 */
function paletteActions(navigation: SiteShellNavigation) {
  return [
    ...navigation.publicItems,
    ...navigation.personalItems,
    navigation.primaryAction,
  ].map((item) => ({
    key: "actions" as const,
    id: `actions:${item.key}`,
    label: item.label,
    detail: null,
    href: item.href,
    language: null,
  }));
}

/**
 * The rail's primary action. A signed-out reader reaches the composer through
 * the sign-in screen and comes back to it — never to the workspace around it,
 * which is the extra press `OVE-378` removed once already. The destination for
 * either state is decided in `getSiteShellNavigation`, so the rail and the tab
 * bar cannot drift apart.
 */
function PrimaryAction({ item }: { item: SiteShellNavigationItem }) {
  return (
    <Link
      data-site-shell-action="new-entry"
      href={item.href}
      className={buttonVariants({ className: "w-full" })}
    >
      <SquarePen aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

/**
 * The reader's own pages, in the account menu. The rail lists them too; the
 * menu is the only place they exist below `lg`, where there is no rail.
 */
const ACCOUNT_MENU_PERSONAL_KEYS = new Set<SiteShellNavigationKey>([
  "notifications",
  "bookmarks",
  "wishlist",
]);

/** The foot of the rail: who you are, and the way out. */
function AccountRegion({
  locale,
  navigation,
  isAuthenticated,
  hasOperatorAccess,
}: {
  locale: InterfaceLocale;
  navigation: SiteShellNavigation;
  isAuthenticated: boolean;
  hasOperatorAccess: boolean;
}) {
  const copy = getInterfaceCopy(locale);
  const operatorCopy = getOperatorMenuCopy(locale);
  const privacyHref =
    navigation.footerLinks.find((link) => link.key === "privacy")?.href ??
    "/privacy";

  if (!isAuthenticated) {
    return (
      <Link
        data-site-shell-action="sign-in"
        href={navigation.signIn.href}
        className={buttonVariants({
          variant: "secondary",
          className: "w-full justify-start",
        })}
      >
        <UserRound aria-hidden="true" />
        {navigation.signIn.label}
      </Link>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        data-site-shell-account-menu-trigger="true"
        render={
          <Button variant="ghost" className="w-full justify-start">
            <UserRound aria-hidden="true" />
            {navigation.labels.accountRegion}
          </Button>
        }
      />
      {/* Four groups, in the order a reader looks for them (`OVE-456`): their
          own pages, the settings that govern their account, the owner's tools
          under the sealed role, and the way out. It used to be one link and a
          sign-out, with the personal pages reachable only from the rail — so a
          reader on a phone, where there is no rail, had no way to them at all. */}
      <MenuContent
        data-site-shell-account-menu="true"
        align="start"
        side="top"
        className="min-w-56"
      >
        <MenuGroup data-site-shell-account-pages="true">
          <MenuGroupLabel>{copy.shell.accountPagesSection}</MenuGroupLabel>
          <AccountMenuLink href="/garden/profile">
            {copy.navigation.profile}
          </AccountMenuLink>
          {navigation.personalItems
            .filter((item) => ACCOUNT_MENU_PERSONAL_KEYS.has(item.key))
            .map((item) => (
              <AccountMenuLink key={item.key} href={item.href}>
                {item.label}
              </AccountMenuLink>
            ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup data-site-shell-account-settings="true">
          <MenuGroupLabel>{copy.shell.accountSettingsSection}</MenuGroupLabel>
          <AccountMenuLink href={privacyHref}>
            {copy.shell.privacy}
          </AccountMenuLink>
          <AccountMenuLink href="/erasure">
            {copy.shell.erasureRequest}
          </AccountMenuLink>
        </MenuGroup>
        {hasOperatorAccess ? (
          <>
            <MenuSeparator />
            <MenuGroup data-site-shell-operator-menu="true">
              <MenuGroupLabel>{operatorCopy.sectionTitle}</MenuGroupLabel>
              {OPERATOR_MENU_LINKS.map((link) => (
                <AccountMenuLink key={link.href} href={link.href}>
                  {operatorCopy.links[link.key]}
                </AccountMenuLink>
              ))}
            </MenuGroup>
          </>
        ) : null}
        <MenuSeparator />
        <SignOutControl presentation="menu" />
      </MenuContent>
    </Menu>
  );
}

function AccountMenuLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-body-sm text-text outline-none hover:bg-action-subtle hover:text-action-subtle-text focus-visible:bg-action-subtle focus-visible:text-action-subtle-text"
    >
      {children}
    </Link>
  );
}

/** The narrow bar's menu. It owns whether it is open; the chrome does not. */
function MobileMenu({
  navigation,
  isAuthenticated,
}: {
  navigation: SiteShellNavigation;
  isAuthenticated: boolean;
}) {
  const [open, onOpenChange] = useState(false);
  const privacy = navigation.footerLinks.find((link) => link.key === "privacy");

  return (
    <div className="flex shrink-0 items-center lg:hidden">
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger
          render={
            <IconButton
              variant="ghost"
              data-cwv-interaction-target="site-menu"
              label={navigation.labels.openMenu}
            />
          }
        >
          <MenuIcon aria-hidden="true" />
        </SheetTrigger>
        <SheetContent
          side="left"
          closeLabel={navigation.labels.closeMenu}
          className="w-4/5 max-w-xs gap-0 p-0"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>{navigation.labels.menuTitle}</SheetTitle>
            <SheetDescription>
              {navigation.labels.menuDescription}
            </SheetDescription>
          </SheetHeader>
          {/* The sheet opens on a press, so by then the address is always
              known; the region is what keeps this component from reading it
              while the closed trigger is being prerendered. */}
          <ShellPathnameRegion
            render={(pathname) => (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
                <SiteShellNavigationList
                  items={navigation.publicItems}
                  pathname={pathname}
                  compact
                  ariaLabel={navigation.labels.siteNavigation}
                />
                {navigation.personalItems.length > 0 ? (
                  <SiteShellNavigationList
                    items={navigation.personalItems}
                    pathname={pathname}
                    compact
                    ariaLabel={navigation.labels.personalSection}
                  />
                ) : null}
              </div>
            )}
          />
          <div className="mt-auto flex flex-col gap-3 border-t border-border p-4">
            <SiteShellMobileUtilities
              privacyHref={privacy?.href ?? "/privacy"}
              privacyLabel={privacy?.label ?? ""}
            >
              {isAuthenticated ? (
                <SignOutControl
                  presentation="menu"
                  onBeforeRequest={() => onOpenChange(false)}
                />
              ) : null}
            </SiteShellMobileUtilities>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
