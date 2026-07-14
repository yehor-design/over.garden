"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CirclePlus,
  Menu,
  Search,
  SquarePen,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";

import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { LanguageSwitcher } from "@/components/public/language-switcher";
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
import {
  getLanguageSwitcherLocales,
  stripLocalePrefix,
} from "@/lib/public-localization";
import {
  getSiteShellNavigation,
  getSiteShellRouteContext,
  type SiteShellNavigationItem,
} from "@/lib/site-shell-navigation";
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

const SHELL_EXCLUDED_PREFIXES = [
  "/__visual-fixtures",
  "/admin",
  "/health",
  "/skeleton",
  "/garden/catalog/curation",
  "/garden/pilot-health",
  "/garden/pilot-learning",
  "/garden/pilot-smoke",
  "/garden/privacy/erasure-requests",
] as const;

export function SiteShell({
  children,
  locale,
  isAuthenticated,
  communitiesReady = false,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
  isAuthenticated: boolean;
  communitiesReady?: boolean;
}) {
  const pathname = usePathname() || "/";
  const [routeContextModules, setRouteContextModules] = useState<
    SiteShellContextRailModule[] | null
  >(null);

  if (isSiteShellExcludedPath(pathname)) {
    return (
      <SiteShellLocaleProvider locale={locale}>
        <div data-site-shell="excluded">{children}</div>
      </SiteShellLocaleProvider>
    );
  }

  const navigation = getSiteShellNavigation(
    locale,
    isAuthenticated,
    communitiesReady,
  );
  const copy = getInterfaceCopy(locale);
  const context = getSiteShellRouteContext(pathname, locale);
  const languageBasePath = stripLocalePrefix(pathname).path;
  const languageSwitcherLocales = isLanguageSwitchablePath(languageBasePath)
    ? getLanguageSwitcherLocales(locale)
    : [];

  return (
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
              <div className="mx-auto flex h-14 w-full max-w-7xl items-stretch px-3 sm:px-5">
                <div className="flex items-center lg:hidden">
                  <Sheet>
                    <SheetTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          aria-label={navigation.labels.openMenu}
                          className="text-background hover:bg-background/10 hover:text-background"
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
                        />
                        {languageSwitcherLocales.length > 1 ? (
                          <LanguageSwitcher
                            locale={locale}
                            basePath={languageBasePath}
                            availableLocales={languageSwitcherLocales}
                          />
                        ) : null}
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>

                <Link
                  data-site-shell-brand="true"
                  href={navigation.publicItems[0]?.href ?? "/"}
                  className="ml-1 flex min-w-0 shrink-0 items-center bg-primary px-2.5 text-sm font-semibold text-primary-foreground sm:px-4 lg:ml-0 lg:w-56"
                >
                  <span className="truncate">OverGarden</span>
                </Link>

                <div className="ml-auto flex items-center gap-1.5 pl-3">
                  {languageSwitcherLocales.length > 1 ? (
                    <div className="hidden rounded-md bg-background p-1 text-foreground md:block">
                      <LanguageSwitcher
                        locale={locale}
                        basePath={languageBasePath}
                        availableLocales={languageSwitcherLocales}
                      />
                    </div>
                  ) : null}
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
                              "text-background hover:bg-background/10 hover:text-background",
                          })}
                        />
                      }
                    >
                      <Search aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>{navigation.labels.search}</TooltipContent>
                  </Tooltip>
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
                                    "text-background hover:bg-background/10 hover:text-background",
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
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Link
                              href="/garden/profile"
                              aria-label={navigation.labels.account}
                              className={buttonVariants({
                                variant: "ghost",
                                size: "icon",
                                className:
                                  "text-background hover:bg-background/10 hover:text-background",
                              })}
                            />
                          }
                        >
                          <UserRound aria-hidden="true" />
                        </TooltipTrigger>
                        <TooltipContent>
                          {navigation.labels.account}
                        </TooltipContent>
                      </Tooltip>
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

function isSiteShellExcludedPath(pathname: string) {
  const normalizedPath = stripLocalePrefix(pathname).path;
  return SHELL_EXCLUDED_PREFIXES.some(
    (prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}

function isLanguageSwitchablePath(pathname: string) {
  if (pathname === "/") return true;

  return [
    "/blog",
    "/guides",
    "/answers",
    "/topics",
    "/feed",
    "/notifications",
    "/bookmarks",
    "/wishlist",
    "/privacy",
    "/objects",
    "/journals",
    "/journal",
    "/communities",
    "/knowledge",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
