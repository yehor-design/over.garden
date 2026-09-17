"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, SquarePen, UserRound } from "lucide-react";
import { useState } from "react";

import { AuthenticatedUtilityRegion } from "@/components/auth/authenticated-utility-region";
import { OwnerScopeProvider } from "@/components/auth/owner-scope";
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
} from "@/lib/site-shell-navigation";
import {
  SiteShellMobileNavigation,
  SiteShellMobileUtilities,
  SiteShellNavigationList,
} from "./site-shell-navigation";
import {
  SiteShellContextRailModules,
  SiteShellContextRailProvider,
  type SiteShellContextRailModule,
} from "./site-shell-context-rail";
import { SiteShellFooter } from "./site-shell-footer";
import { SiteShellLocaleProvider } from "./site-shell-locale-context";
import { OverGardenLogo } from "./over-garden-logo";

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
  isAuthenticated,
  ownerUserId = null,
  hasOperatorAccess = false,
  communitiesReady = false,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  market: InterfaceMarket;
  isAuthenticated: boolean;
  ownerUserId?: string | null;
  hasOperatorAccess?: boolean;
  communitiesReady?: boolean;
}) {
  const pathname = usePathname() || "/";
  const isSessionConvergenceSafeExit = isSafeExitRoute(pathname);
  const [routeContextModules, setRouteContextModules] = useState<
    SiteShellContextRailModule[] | null
  >(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const languageControlPlacement =
    getInterfaceLanguageControlPlacement(pathname);
  if (isSessionConvergenceSafeExit) {
    // The native erasure page intentionally contains no garden payload or
    // authenticated navigation. It stays outside the session convergence
    // guard so a failed session recheck cannot trap a person in an account.
    return (
      <SiteShellLocaleProvider locale={locale}>
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
      </SiteShellLocaleProvider>
    );
  }

  if (languageControlPlacement !== "site-shell") {
    // The utility region carries the control on the routes that have no shell.
    const showUtility = languageControlPlacement === "utility";
    const excludedShell = (
      <SiteShellLocaleProvider locale={locale}>
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
      </SiteShellLocaleProvider>
    );

    if (!isAuthenticated || languageControlPlacement !== "utility") {
      return excludedShell;
    }

    return (
      <OwnerScopeProvider locale={locale} ownerUserId={ownerUserId}>
        <SignOutProvider locale={locale}>{excludedShell}</SignOutProvider>
      </OwnerScopeProvider>
    );
  }

  const navigation = getSiteShellNavigation(
    locale,
    isAuthenticated,
    communitiesReady,
    pathname,
  );
  const copy = getInterfaceCopy(locale);
  const context = getSiteShellRouteContext(pathname, locale);

  const shell = (
    <SiteShellLocaleProvider locale={locale}>
      <SessionSignalBoundary locale={locale} ownerUserId={ownerUserId} />
      <SiteShellContextRailProvider setModules={setRouteContextModules}>
        {/* One dialog for however many triggers the shell draws. Mounted
            twice, `⌘K` opened two palettes and a screen reader saw two
            comboboxes — found by driving it, not by reading it. */}
        <CommandPaletteProvider
          locale={locale}
          actions={paletteActions(navigation)}
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

            <div className="grid min-w-0 flex-1 lg:grid-cols-shell xl:grid-cols-shell-wide">
              <header
                data-site-shell-region="header"
                className="sticky top-0 z-header flex min-h-14 min-w-0 items-center gap-1 border-b border-border bg-surface px-2 lg:h-dvh lg:flex-col lg:items-stretch lg:gap-0 lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-3 lg:py-4"
              >
                <MobileMenuTrigger
                  navigation={navigation}
                  pathname={pathname}
                  open={mobileMenuOpen}
                  onOpenChange={setMobileMenuOpen}
                  isAuthenticated={isAuthenticated}
                />

                <Link
                  data-site-shell-brand="true"
                  href={navigation.publicItems[0]?.href ?? "/"}
                  className="flex min-h-11 min-w-0 shrink-0 items-center rounded-md px-2 py-1 text-action outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:mb-4 lg:px-2"
                >
                  <OverGardenLogo className="h-7 w-auto shrink-0 lg:h-8" />
                  <span className="sr-only">OverGarden</span>
                </Link>

                {/* The rail's navigation, at `lg` and above. The palette sits
                  above it: search is a way into everything, and the two plain
                  links below it are the way in without JavaScript
                  (ADR-0031 D7). */}
                <div className="hidden min-w-0 flex-col gap-4 lg:flex">
                  <CommandPaletteTrigger label={copy.palette.open} />
                  <SiteShellNavigationList
                    items={navigation.publicItems}
                    pathname={pathname}
                    ariaLabel={navigation.labels.siteNavigation}
                  />
                  {navigation.personalItems.length > 0 ? (
                    <SiteShellNavigationList
                      items={navigation.personalItems}
                      pathname={pathname}
                      ariaLabel={navigation.labels.personalSection}
                    />
                  ) : null}
                </div>

                {/* The primary action is in the rail above `lg` and in the tab
                  bar below it: one control visible to a reader at any width,
                  and never the two the header and the rail used to draw at
                  once (DESIGN.md §4.4, ADR-0031 D4). */}
                <div className="mt-4 hidden w-full lg:block">
                  <PrimaryAction item={navigation.primaryAction} />
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
                  <AccountRegion
                    locale={locale}
                    navigation={navigation}
                    isAuthenticated={isAuthenticated}
                    hasOperatorAccess={hasOperatorAccess}
                  />
                </div>
              </header>

              {/* The column clears the tab bar, not just the content inside it:
                the footer is the last thing on a short page, and padding the
                content alone left it underneath the bar. */}
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

                <SiteShellFooter
                  locale={locale}
                  market={market}
                  pathname={pathname}
                  links={navigation.footerLinks}
                  navigationLabel={navigation.labels.footerNavigation}
                  tagline={copy.shell.footerTagline}
                  sourcesTitle={copy.shell.sourcesTitle}
                  sourcesDescription={copy.shell.sourcesDescription}
                />
              </div>

              <aside
                data-site-shell-region="context"
                aria-label={navigation.labels.contextRail}
                className="sticky top-0 hidden h-dvh self-start overflow-y-auto border-l border-border px-5 py-6 xl:block"
              >
                {routeContextModules ? (
                  <SiteShellContextRailModules modules={routeContextModules} />
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-overline text-text-muted uppercase">
                      {navigation.labels.contextTitle}
                    </p>
                    <h2 className="text-h4 text-text-heading">
                      {context.title}
                    </h2>
                    <p className="text-body-sm text-text-secondary">
                      {context.description}
                    </p>
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
                )}
              </aside>
            </div>

            {isSiteShellComposerRoute(pathname) ? null : (
              <SiteShellMobileNavigation
                items={navigation.mobileItems}
                pathname={pathname}
                ariaLabel={navigation.labels.mobileNavigation}
                primaryActionKey={navigation.primaryAction.key}
              />
            )}
          </div>
        </CommandPaletteProvider>
      </SiteShellContextRailProvider>
    </SiteShellLocaleProvider>
  );

  if (!isAuthenticated) {
    return shell;
  }

  return (
    <OwnerScopeProvider locale={locale} ownerUserId={ownerUserId}>
      <SignOutProvider locale={locale}>{shell}</SignOutProvider>
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
      <MenuContent
        data-site-shell-account-menu="true"
        align="start"
        side="top"
        className="min-w-56"
      >
        <MenuGroup>
          <MenuGroupLabel>{navigation.labels.accountRegion}</MenuGroupLabel>
          <AccountMenuLink href="/garden/profile">
            {copy.navigation.profile}
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

function MobileMenuTrigger({
  navigation,
  pathname,
  open,
  onOpenChange,
  isAuthenticated,
}: {
  navigation: SiteShellNavigation;
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAuthenticated: boolean;
}) {
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
