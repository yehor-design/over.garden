"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CirclePlus,
  LogIn,
  Menu,
  Search,
  SquarePen,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";

import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { AuthenticatedUtilityRegion } from "@/components/auth/authenticated-utility-region";
import { DocumentMutationGenerationProvider } from "@/components/auth/document-mutation-recovery";
import { ForegroundAutosyncProvider } from "@/components/auth/foreground-autosync-provider";
import { SessionConvergenceBoundary } from "@/components/auth/session-convergence-boundary";
import { SignOutControl } from "@/components/auth/sign-out-control";
import { SignOutProvider } from "@/components/auth/sign-out-provider";
import { InterfaceLanguageControl } from "@/components/public/language-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  getSessionRecheckMode,
  isSessionConvergenceSafeExitRoute,
} from "@/lib/interface-route-policy";
import {
  getSiteShellNavigation,
  getSiteShellRouteContext,
  type SiteShellNavigationItem,
} from "@/lib/site-shell-navigation";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { cn } from "@/lib/utils";
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
import { SiteShellLocaleProvider } from "./site-shell-locale-context";

export function SiteShell({
  children,
  locale,
  market,
  isAuthenticated,
  documentMutationGeneration = null,
  currentSessionBinding = null,
  hasOperatorAccess = false,
  communitiesReady = false,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  market: InterfaceMarket;
  isAuthenticated: boolean;
  documentMutationGeneration?: string | null;
  currentSessionBinding?: string | null;
  hasOperatorAccess?: boolean;
  communitiesReady?: boolean;
}) {
  const pathname = usePathname() || "/";
  const isSessionConvergenceSafeExit =
    isSessionConvergenceSafeExitRoute(pathname);
  const sessionRecheckMode = getSessionRecheckMode(pathname);
  const [routeContextModules, setRouteContextModules] = useState<
    SiteShellContextRailModule[] | null
  >(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const languageControlPlacement =
    getInterfaceLanguageControlPlacement(pathname);
  const sessionConvergenceLocaleControl =
    market === "bulgaria" ? (
      <InterfaceLanguageControl
        locale={locale}
        market={market}
        pathname={pathname}
        compact={languageControlPlacement === "utility"}
      />
    ) : undefined;

  if (isSessionConvergenceSafeExit) {
    // The native erasure page intentionally contains no garden payload or
    // authenticated navigation. Keeping this escape hatch outside the local
    // owner-hydration guard prevents a failed local check from trapping a
    // person in an account while the private workspace remains sealed.
    return (
      <SiteShellLocaleProvider locale={locale}>
        {isAuthenticated ? (
          <DocumentMutationGenerationProvider
            locale={locale}
            transport={documentMutationGeneration}
          >
            <div
              data-site-shell="safe-exit"
              data-session-convergence-safe-exit="erasure"
            >
              {children}
            </div>
          </DocumentMutationGenerationProvider>
        ) : (
          <div
            data-site-shell="safe-exit"
            data-session-convergence-safe-exit="erasure"
          >
            {children}
          </div>
        )}
      </SiteShellLocaleProvider>
    );
  }

  if (languageControlPlacement !== "site-shell") {
    const showUtility =
      languageControlPlacement === "utility" &&
      (isAuthenticated || market === "bulgaria");
    const excludedShell = (
      <SiteShellLocaleProvider locale={locale}>
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
      <SessionConvergenceBoundary
        locale={locale}
        localeControlFallback={sessionConvergenceLocaleControl}
        currentSessionBinding={currentSessionBinding}
        recheckMode={sessionRecheckMode}
      >
        <DocumentMutationGenerationProvider
          locale={locale}
          transport={documentMutationGeneration}
        >
          <ForegroundAutosyncProvider
            documentMutationGeneration={documentMutationGeneration}
            enabled={isAuthenticatedGardenPath(pathname)}
          >
            <SignOutProvider
              locale={locale}
              currentSessionBinding={currentSessionBinding}
            >
              {excludedShell}
            </SignOutProvider>
          </ForegroundAutosyncProvider>
        </DocumentMutationGenerationProvider>
      </SessionConvergenceBoundary>
    );
  }

  const navigation = getSiteShellNavigation(
    locale,
    isAuthenticated,
    communitiesReady,
  );
  const copy = getInterfaceCopy(locale);
  const signOutCopy = getTrustSurfaceCopy(locale).signOut;
  const context = getSiteShellRouteContext(pathname, locale);

  const shell = (
    <SiteShellLocaleProvider locale={locale}>
      <SiteShellContextRailProvider setModules={setRouteContextModules}>
        <TooltipProvider>
          <div
            data-site-shell="root"
            className="flex min-h-dvh min-w-0 flex-1 flex-col bg-background"
          >
            <a
              href="#main-content"
              className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-lg focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:outline-2 focus:outline-offset-2 focus:outline-ring"
            >
              {copy.shell.skipToContent}
            </a>
            <header
              data-site-shell-region="header"
              className="sticky top-0 z-40 border-b border-foreground/15 bg-foreground text-background"
            >
              <div className="site-shell-header-inner mx-auto flex w-full max-w-7xl items-stretch">
                <div className="flex items-center lg:hidden">
                  <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                    <SheetTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          aria-label={navigation.labels.openMenu}
                          className="site-shell-header-icon text-background hover:bg-background/10 hover:text-background"
                        />
                      }
                    >
                      <Menu aria-hidden="true" />
                    </SheetTrigger>
                    <SheetContent
                      side="left"
                      showCloseButton={false}
                      className="w-4/5 max-w-xs gap-0 p-0"
                    >
                      <SheetHeader className="border-b border-border pr-12">
                        <SheetTitle>{navigation.labels.menuTitle}</SheetTitle>
                        <SheetDescription>
                          {navigation.labels.menuDescription}
                        </SheetDescription>
                      </SheetHeader>
                      <SheetClose
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={navigation.labels.closeMenu}
                            className="absolute top-3 right-3"
                          />
                        }
                      >
                        <X aria-hidden="true" />
                      </SheetClose>
                      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
                        <NavigationSection
                          label={navigation.labels.publicSection}
                          items={navigation.publicItems}
                          pathname={pathname}
                          compact
                        />
                        {navigation.personalItems.length > 0 ? (
                          <>
                            <Separator className="my-3" />
                            <NavigationSection
                              label={navigation.labels.personalSection}
                              items={navigation.personalItems}
                              pathname={pathname}
                              compact
                            />
                          </>
                        ) : (
                          <>
                            <Separator className="my-3" />
                            <GuestMutationActions
                              addObjectLabel={copy.navigation.addObject}
                              addEntryLabel={copy.navigation.addUpdate}
                              compact
                            />
                          </>
                        )}
                      </div>
                      <div className="mt-auto flex flex-col gap-3 border-t border-border p-4">
                        <SiteShellMobileUtilities
                          privacyHref={context.secondaryHref}
                          privacyLabel={context.secondaryLabel}
                        >
                          {isAuthenticated ? (
                            <SignOutControl
                              presentation="menu"
                              onBeforeRequest={() => setMobileMenuOpen(false)}
                            />
                          ) : null}
                        </SiteShellMobileUtilities>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>

                <Link
                  data-site-shell-brand="true"
                  href={navigation.publicItems[0]?.href ?? "/"}
                  className="site-shell-brand flex min-w-0 items-center bg-primary font-semibold text-primary-foreground lg:ml-0 lg:w-56"
                >
                  <span className="truncate">OverGarden</span>
                </Link>

                <div className="site-shell-header-actions ml-auto flex items-center">
                  {market === "bulgaria" ? (
                    <div className="rounded-md bg-background text-foreground">
                      <InterfaceLanguageControl
                        locale={locale}
                        market={market}
                        pathname={pathname}
                      />
                    </div>
                  ) : null}
                  <span className="hidden sm:inline-flex">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Link
                            href={navigation.searchHref}
                            aria-label={navigation.labels.search}
                            className={buttonVariants({
                              variant: "ghost",
                              size: "icon",
                              className:
                                "site-shell-header-icon text-background hover:bg-background/10 hover:text-background",
                            })}
                          />
                        }
                      >
                        <Search aria-hidden="true" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {navigation.labels.search}
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  {isAuthenticated ? (
                    <>
                      <span className="md:hidden">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Link
                                data-site-shell-action="add-mobile"
                                href="/garden#first-entry-composer"
                                aria-label={
                                  navigation.personalItems.find(
                                    (item) => item.key === "add-update",
                                  )?.label ?? ""
                                }
                                className={buttonVariants({
                                  variant: "ghost",
                                  size: "icon",
                                  className:
                                    "site-shell-header-icon text-background hover:bg-background/10 hover:text-background",
                                })}
                              />
                            }
                          >
                            <SquarePen aria-hidden="true" />
                          </TooltipTrigger>
                          <TooltipContent>
                            {navigation.personalItems.find(
                              (item) => item.key === "add-update",
                            )?.label ?? ""}
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="hidden md:contents">
                        <Link
                          data-site-shell-action="add-desktop"
                          href="/garden#first-entry-composer"
                          className={buttonVariants({ size: "sm" })}
                        >
                          <SquarePen
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          {navigation.personalItems.find(
                            (item) => item.key === "add-update",
                          )?.label ?? ""}
                        </Link>
                      </span>
                      <span className="inline-flex">
                        <Sheet
                          open={accountMenuOpen}
                          onOpenChange={setAccountMenuOpen}
                        >
                          <SheetTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                data-site-shell-account-menu-trigger="true"
                                aria-label={signOutCopy.openAccountMenu}
                                className="site-shell-header-icon text-background hover:bg-background/10 hover:text-background"
                              />
                            }
                          >
                            <UserRound aria-hidden="true" />
                          </SheetTrigger>
                          <SheetContent
                            side="right"
                            closeLabel={signOutCopy.closeAccountMenu}
                            className="w-11/12 max-w-sm"
                          >
                            <SheetHeader className="border-b border-border">
                              <SheetTitle>
                                {signOutCopy.accountMenuTitle}
                              </SheetTitle>
                              <SheetDescription>
                                {signOutCopy.accountMenuDescription}
                              </SheetDescription>
                            </SheetHeader>
                            <div className="grid gap-2 p-4">
                              <SheetClose
                                render={
                                  <Link
                                    href="/garden/profile"
                                    className={buttonVariants({
                                      variant: "outline",
                                      className: "justify-start",
                                    })}
                                  />
                                }
                              >
                                <UserRound
                                  data-icon="inline-start"
                                  aria-hidden="true"
                                />
                                {signOutCopy.openProfile}
                              </SheetClose>
                              {hasOperatorAccess ? (
                                <SiteShellOperatorMenu
                                  locale={locale}
                                  onNavigate={() => setAccountMenuOpen(false)}
                                />
                              ) : null}
                              <SignOutControl
                                presentation="menu"
                                onBeforeRequest={() =>
                                  setAccountMenuOpen(false)
                                }
                              />
                            </div>
                          </SheetContent>
                        </Sheet>
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        data-site-shell-action="add-guest"
                        className="hidden md:inline-flex"
                      >
                        <AuthIntentTrigger
                          action="create_entry"
                          returnTo="/garden"
                          label={copy.navigation.addUpdate}
                          labelClassName="sr-only md:not-sr-only"
                          icon={<SquarePen aria-hidden="true" />}
                          size="sm"
                          className="border-background/30 bg-background text-foreground hover:bg-background/90"
                        />
                      </span>
                      <span className="md:hidden">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Link
                                data-site-shell-action="sign-in-mobile"
                                href="/garden"
                                aria-label={
                                  navigation.mobileItems.find(
                                    (item) => item.key === "sign-in",
                                  )?.label ?? ""
                                }
                                className={buttonVariants({
                                  variant: "ghost",
                                  size: "icon",
                                  className:
                                    "site-shell-header-icon text-background hover:bg-background/10 hover:text-background",
                                })}
                              />
                            }
                          >
                            <LogIn aria-hidden="true" />
                          </TooltipTrigger>
                          <TooltipContent>
                            {navigation.mobileItems.find(
                              (item) => item.key === "sign-in",
                            )?.label ?? ""}
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="hidden md:inline-flex">
                        <Link
                          href="/garden"
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                            className:
                              "border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background",
                          })}
                        >
                          {navigation.mobileItems.find(
                            (item) => item.key === "sign-in",
                          )?.label ?? ""}
                        </Link>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </header>

            <div className="site-shell-layout mx-auto grid w-full max-w-7xl flex-1">
              <aside
                data-site-shell-region="sidebar"
                className="site-shell-viewport-rail sticky top-14 hidden overflow-y-auto border-r border-border px-3 py-5 lg:block"
              >
                <NavigationSection
                  label={navigation.labels.publicSection}
                  items={navigation.publicItems}
                  pathname={pathname}
                />
                {navigation.personalItems.length > 0 ? (
                  <>
                    <Separator className="my-4" />
                    <NavigationSection
                      label={navigation.labels.personalSection}
                      items={navigation.personalItems}
                      pathname={pathname}
                    />
                  </>
                ) : (
                  <>
                    <Separator className="my-4" />
                    <GuestMutationActions
                      addObjectLabel={copy.navigation.addObject}
                      addEntryLabel={copy.navigation.addUpdate}
                    />
                  </>
                )}
              </aside>

              <div
                id="main-content"
                data-interface-locale-fragment-safe="true"
                data-site-shell-region="content"
                tabIndex={-1}
                className="site-shell-content-safe-bottom min-w-0 outline-none"
              >
                {children}
              </div>

              <aside
                data-site-shell-region="context"
                className="site-shell-viewport-rail sticky top-14 hidden overflow-y-auto border-l border-border px-5 py-6 xl:block"
              >
                {routeContextModules ? (
                  <SiteShellContextRailModules modules={routeContextModules} />
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">
                      {navigation.labels.contextTitle}
                    </p>
                    <h2 className="text-lg font-semibold text-foreground">
                      {context.title}
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {context.description}
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <Link
                        href={context.primaryHref}
                        className={buttonVariants({
                          className: "justify-start",
                        })}
                      >
                        {context.primaryLabel}
                      </Link>
                      <Link
                        href={context.secondaryHref}
                        className={buttonVariants({
                          variant: "outline",
                          className: "justify-start",
                        })}
                      >
                        {context.secondaryLabel}
                      </Link>
                    </div>
                  </div>
                )}
              </aside>
            </div>

            <SiteShellMobileNavigation
              items={navigation.mobileItems}
              pathname={pathname}
              ariaLabel={navigation.labels.mobileNavigation}
            />
          </div>
        </TooltipProvider>
      </SiteShellContextRailProvider>
    </SiteShellLocaleProvider>
  );

  if (!isAuthenticated) return shell;

  return (
    <SessionConvergenceBoundary
      locale={locale}
      localeControlFallback={sessionConvergenceLocaleControl}
      currentSessionBinding={currentSessionBinding}
      recheckMode={sessionRecheckMode}
    >
      <DocumentMutationGenerationProvider
        locale={locale}
        transport={documentMutationGeneration}
      >
        <ForegroundAutosyncProvider
          documentMutationGeneration={documentMutationGeneration}
          enabled={isAuthenticatedGardenPath(pathname)}
        >
          <SignOutProvider
            locale={locale}
            currentSessionBinding={currentSessionBinding}
          >
            {shell}
          </SignOutProvider>
        </ForegroundAutosyncProvider>
      </DocumentMutationGenerationProvider>
    </SessionConvergenceBoundary>
  );
}

export function SiteShellOperatorMenu({
  locale,
  onNavigate,
}: {
  locale: InterfaceLocale;
  onNavigate?: () => void;
}) {
  const copy = getOperatorMenuCopy(locale);

  return (
    <section
      data-site-shell-operator-menu="true"
      aria-labelledby="site-shell-operator-menu-title"
      className="grid gap-2"
    >
      <Separator />
      <h3
        id="site-shell-operator-menu-title"
        className="px-1 text-xs font-semibold text-muted-foreground uppercase"
      >
        {copy.sectionTitle}
      </h3>
      <ul className="grid gap-2">
        {OPERATOR_MENU_LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={buttonVariants({
                variant: "outline",
                className: "w-full justify-start",
              })}
              onClick={onNavigate}
            >
              {copy.links[item.key]}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function isAuthenticatedGardenPath(pathname: string) {
  return pathname === "/garden" || pathname.startsWith("/garden/");
}

function GuestMutationActions({
  addObjectLabel,
  addEntryLabel,
  compact = false,
}: {
  addObjectLabel: string;
  addEntryLabel: string;
  compact?: boolean;
}) {
  return (
    <div
      data-site-shell-guest-actions="true"
      className={cn("grid gap-2", compact && "gap-1.5")}
    >
      <AuthIntentTrigger
        action="create_object"
        returnTo="/garden"
        label={addObjectLabel}
        icon={<CirclePlus aria-hidden="true" />}
        variant="outline"
        size="sm"
        formClassName="w-full"
        className="w-full justify-start"
      />
      <AuthIntentTrigger
        action="create_entry"
        returnTo="/garden"
        label={addEntryLabel}
        icon={<SquarePen aria-hidden="true" />}
        size="sm"
        formClassName="w-full"
        className="w-full justify-start"
      />
    </div>
  );
}

function NavigationSection({
  label,
  items,
  pathname,
  compact = false,
}: {
  label: string;
  items: SiteShellNavigationItem[];
  pathname: string;
  compact?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <p
        className={cn(
          "px-2.5 text-xs font-semibold text-muted-foreground uppercase",
          compact && "text-xs",
        )}
      >
        {label}
      </p>
      <SiteShellNavigationList
        items={items}
        pathname={pathname}
        compact={compact}
        ariaLabel={label}
      />
    </section>
  );
}
