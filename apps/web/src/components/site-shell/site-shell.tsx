"use client";

import Link from "next/link";
import { ListIcon as MenuIcon } from "@/components/icons/List";
import { NotePencilIcon as SquarePen } from "@/components/icons/NotePencil";
import { WarningIcon as TriangleAlert } from "@/components/icons/Warning";
import { UserIcon as UserRound } from "@/components/icons/User";
import { useCallback, useEffect } from "react";

import { AuthenticatedUtilityRegion } from "@/components/auth/authenticated-utility-region";
import {
  OwnerScopeProvider,
  useOwnerScopeControl,
} from "@/components/auth/owner-scope";
import { SessionSignalBoundary } from "@/components/auth/session-signal-boundary";
import { InterfaceLanguageControl } from "@/components/public/language-switcher";
import { SignOutProvider } from "@/components/auth/sign-out-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from "@/components/ui/command-palette";
import { IconButton } from "@/components/ui/icon-button";
import { Separator } from "@/components/ui/separator";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import type { InterfaceMarket } from "@/lib/interface-market";
import {
  getInterfaceLanguageControlPlacement,
  isSafeExitRoute,
} from "@/lib/interface-route-policy";
import {
  getSiteShellNavigation,
  canonicalSiteShellPath,
  isSiteShellItemActive,
  isSiteShellComposerRoute,
  type SiteShellNavigation,
  type SiteShellNavigationItem,
} from "@/lib/site-shell-navigation";
import type {
  SiteShellSessionInput,
  SiteShellSessionState,
} from "@/lib/site-shell-session-state";
import { useOnDemandComponent } from "@/lib/use-on-demand-component";
import {
  SiteShellMobileNavigation,
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
 * lg → xl     [ rail 208 ]   [ content max 704 ]
 * ≥ xl        [ rail 208 ]   [ content max 704 ]  [ context 280 ]
 * ```
 *
 * The `<header>` element is one element in two shapes: a 56 px top bar below
 * `lg`, the 208 px left rail at `lg` and above. That is what keeps the `banner`
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
            <CommandPaletteProvider
              locale={locale}
              actions={readPaletteActions}
            >
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

                <div
                  data-site-shell-grid="true"
                  className="mx-auto grid w-full min-w-0 flex-1 lg:max-w-shell-compact lg:grid-cols-shell lg:gap-x-6 lg:px-5 xl:max-w-shell-frame xl:grid-cols-shell-wide"
                >
                  <header
                    data-site-shell-region="header"
                    className="sticky top-0 z-header flex min-h-14 min-w-0 items-center gap-1 border-b border-border bg-surface px-2 lg:h-dvh lg:flex-col lg:items-stretch lg:gap-0 lg:self-start lg:overflow-y-auto lg:border-b-0 lg:px-0 lg:py-4"
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
                      <OverGardenLogo className="h-7 w-auto shrink-0 lg:h-12" />
                      <span className="sr-only">OverGarden</span>
                    </Link>

                    {/* Search retains a native route before enhancement;
                        primary destinations are ordinary links (ADR-0031 D7). */}
                    <div className="hidden min-w-0 flex-col gap-4 lg:flex">
                      <CommandPaletteTrigger
                        label={copy.palette.open}
                        fallbackHref={guestNavigation.searchHref}
                      />
                      <ShellPathnameRegion
                        render={(pathname) => (
                          <SiteShellNavigationList
                            items={guestNavigation.publicItems}
                            pathname={pathname}
                            ariaLabel={guestNavigation.labels.siteNavigation}
                          />
                        )}
                      />
                      {/* Stable personal destinations: guests receive sign-in
                          return paths, members receive the direct links. */}
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
                        fallbackHref={guestNavigation.searchHref}
                        label={copy.palette.open}
                      />
                    </div>

                    <div className="flex shrink-0 lg:hidden">
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
                            sessionStore={resolved?.sessionStore ?? "reachable"}
                            compact
                          />
                        )}
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
                            sessionStore={resolved?.sessionStore ?? "reachable"}
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
                      <ShellPathnameRegion
                        render={(pathname) => (
                          <SecondaryNavigation
                            pathname={pathname}
                            navigation={guestNavigation}
                            locale={locale}
                          />
                        )}
                      />
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

                  <SiteShellContextRailOutlet
                    fallback={null}
                    label={guestNavigation.labels.contextRail}
                  />
                </div>

                {/* Five stable slots in both states. Protected destinations resume
                    through sign-in for guests; session resolution changes only
                    their links, never the surrounding page. */}
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

/** Secondary discovery links are destinations within Explore, not rail roots. */
function SecondaryNavigation({
  pathname,
  navigation,
  locale,
}: {
  pathname: string | null;
  navigation: SiteShellNavigation;
  locale: InterfaceLocale;
}) {
  const normalized = pathname ? canonicalSiteShellPath(pathname) : null;
  const copy = getInterfaceCopy(locale);
  const groups = [
    {
      key: "catalogue",
      label: copy.navigation.explore,
      items: navigation.exploreItems,
    },
    {
      key: "feed",
      label: copy.navigation.feed,
      items: [
        {
          key: "latest",
          label: copy.navigation.feed,
          href: navigation.publicItems[0]!.href,
        },
        {
          key: "following",
          label: copy.navigation.followedFeed,
          href: navigation.publicItems[0]!.href.replace(/\/$/, "") + "/feed",
        },
      ],
    },
  ];
  return (
    <>
      {groups.map((group) => (
        <nav
          key={group.key}
          data-site-shell-secondary={group.key}
          aria-label={group.label}
          className="hidden min-w-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-4 py-1"
        >
          {group.items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={
                pathname &&
                ("matchPaths" in item
                  ? isSiteShellItemActive(pathname, item)
                  : normalized === canonicalSiteShellPath(item.href))
                  ? "page"
                  : undefined
              }
              className="flex min-h-11 shrink-0 items-center rounded-md px-3 text-body-sm font-medium text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ))}
    </>
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
    //
    // It does carry the one language control every document has (DESIGN.md
    // §6): a person asking to be erased in the wrong language must be able
    // to read what they are asking for. It had none (`OVE-478`). The control
    // on an unprefixed route writes the preference and navigates nowhere.
    const safeExit = (
      <div data-site-shell="safe-exit" data-site-shell-safe-exit="erasure">
        {children}
        <footer
          data-site-shell-region="footer"
          className="mt-12 border-t border-border px-4 py-6 sm:px-6"
        >
          <div className="mx-auto flex w-full max-w-content">
            <InterfaceLanguageControl
              locale={locale}
              market={market}
              pathname={pathname}
              compact
            />
          </div>
        </footer>
      </div>
    );
    return (
      <>
        <SessionSignalBoundary locale={locale} ownerUserId={ownerUserId} />
        {isAuthenticated ? (
          <OwnerScopeProvider locale={locale} ownerUserId={ownerUserId}>
            {safeExit}
          </OwnerScopeProvider>
        ) : (
          safeExit
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
  const items = [
    ...navigation.publicItems,
    ...navigation.personalItems,
    ...navigation.exploreItems,
    ...navigation.utilityItems,
    navigation.primaryAction,
  ];
  return [...new Map(items.map((item) => [item.key, item])).values()].map(
    (item) => ({
      key: "actions" as const,
      id: `actions:${item.key}`,
      label: item.label,
      detail: null,
      href: item.href,
      language: null,
    }),
  );
}

/**
 * The shared writing entry point. Until the routed composer ships, it opens
 * the owned inventory where each object has a working contextual composer.
 * Guests resume the same destination after sign-in. Navigation owns the href
 * so the desktop action and mobile tab cannot drift apart.
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

/** The foot of the rail: who you are, and the way out. */
function AccountRegion({
  locale,
  navigation,
  isAuthenticated,
  hasOperatorAccess,
  sessionStore,
  compact = false,
}: {
  locale: InterfaceLocale;
  navigation: SiteShellNavigation;
  isAuthenticated: boolean;
  hasOperatorAccess: boolean;
  sessionStore: SiteShellSessionState["sessionStore"];
  compact?: boolean;
}) {
  const copy = getInterfaceCopy(locale);
  const privacyHref =
    navigation.footerLinks.find((link) => link.key === "privacy")?.href ??
    "/privacy";

  // `OVE-457` criterion 8: the chrome stops disagreeing with the page. A null
  // session during an outage is Better Auth swallowing a read failure, not a
  // guest — and offering "Sign in" over a workspace page that has already said
  // the store is unreachable is the product contradicting itself.
  if (sessionStore === "unreachable") {
    if (compact)
      return (
        <div role="status" data-site-shell-session="unreachable">
          <span className="sr-only">{copy.shell.sessionUnavailable}</span>
          <Link
            href={navigation.signIn.href}
            aria-label={`${copy.shell.sessionUnavailable}. ${copy.shell.sessionUnavailableRetry}`}
            className={buttonVariants({
              variant: "ghost",
              className: "min-h-11 min-w-11 px-2",
            })}
          >
            <TriangleAlert aria-hidden="true" />
          </Link>
        </div>
      );
    return (
      <p
        role="status"
        data-site-shell-session="unreachable"
        className="flex flex-col gap-1 rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-body-sm text-warning-text"
      >
        <span className="flex items-center gap-2">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {copy.shell.sessionUnavailable}
        </span>
        <a
          href={navigation.signIn.href}
          className="w-fit rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {copy.shell.sessionUnavailableRetry}
        </a>
      </p>
    );
  }

  if (!isAuthenticated) {
    return (
      <Link
        aria-label={compact ? navigation.signIn.label : undefined}
        data-site-shell-action="sign-in"
        href={navigation.signIn.href}
        className={buttonVariants({
          variant: "secondary",
          className: compact
            ? "min-h-11 min-w-11 px-2"
            : "w-full justify-start",
        })}
      >
        <UserRound aria-hidden="true" />
        {compact ? null : navigation.signIn.label}
      </Link>
    );
  }

  return (
    <AccountMenuLauncher
      locale={locale}
      navigation={navigation}
      hasOperatorAccess={hasOperatorAccess}
      privacyHref={privacyHref}
      compact={compact}
    />
  );
}

/**
 * The account menu's code arrives on the first press (`OVE-468`). Until then
 * the shell draws a button that looks and is named exactly as the menu's own
 * trigger; a press that lands before the code does is kept, and the menu
 * arrives open. Pointing at the button or focusing it starts the download.
 */
const loadAccountMenu = () =>
  import("./site-shell-account-menu").then(
    (module) => module.SiteShellAccountMenu,
  );

function AccountMenuLauncher(props: {
  locale: InterfaceLocale;
  navigation: SiteShellNavigation;
  hasOperatorAccess: boolean;
  privacyHref: string;
  compact: boolean;
}) {
  const {
    Component: AccountMenu,
    request,
    preload,
  } = useOnDemandComponent(loadAccountMenu);

  if (AccountMenu) return <AccountMenu {...props} defaultOpen />;
  return (
    <Button
      type="button"
      variant="ghost"
      data-site-shell-account-menu-trigger="true"
      aria-haspopup="menu"
      aria-expanded={false}
      aria-label={
        props.compact ? props.navigation.labels.openAccount : undefined
      }
      className={
        props.compact ? "min-h-11 min-w-11 px-2" : "w-full justify-start"
      }
      onPointerEnter={preload}
      onFocus={preload}
      onClick={() => void request()}
    >
      <UserRound aria-hidden="true" />
      {props.compact ? null : props.navigation.labels.accountRegion}
    </Button>
  );
}

/**
 * The narrow bar's menu. Its sheet arrives on the first press (`OVE-468`):
 * until then this is a button that looks and is named exactly as the sheet's
 * own trigger, and a press that lands before the code does is kept — the sheet
 * arrives open. Pointing at the button or focusing it starts the download.
 */
const loadMobileSheet = () =>
  import("./site-shell-mobile-sheet").then(
    (module) => module.SiteShellMobileSheet,
  );

function MobileMenu({
  navigation,
  isAuthenticated,
}: {
  navigation: SiteShellNavigation;
  isAuthenticated: boolean;
}) {
  const {
    Component: MobileSheet,
    request,
    preload,
  } = useOnDemandComponent(loadMobileSheet);

  return (
    <div className="flex shrink-0 items-center lg:hidden">
      {MobileSheet ? (
        <MobileSheet
          navigation={navigation}
          isAuthenticated={isAuthenticated}
          defaultOpen
        />
      ) : (
        <IconButton
          variant="ghost"
          data-cwv-interaction-target="site-menu"
          label={navigation.labels.openMenu}
          aria-haspopup="dialog"
          aria-expanded={false}
          onPointerEnter={preload}
          onFocus={preload}
          onClick={() => void request()}
        >
          <MenuIcon aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}
