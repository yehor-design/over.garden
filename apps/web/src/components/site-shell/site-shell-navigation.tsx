"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bookmark,
  BookOpenText,
  GitBranch,
  Heart,
  LayoutDashboard,
  ListFilter,
  LogIn,
  Newspaper,
  NotebookText,
  ShieldCheck,
  Sprout,
  SquarePen,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  isSiteShellItemActive,
  type SiteShellNavigationItem,
  type SiteShellNavigationKey,
} from "@/lib/site-shell-navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAVIGATION_ICONS: Record<SiteShellNavigationKey, LucideIcon> = {
  feed: Newspaper,
  catalogue: Sprout,
  journals: NotebookText,
  communities: UsersRound,
  knowledge: BookOpenText,
  garden: LayoutDashboard,
  "new-entry": SquarePen,
  "followed-feed": ListFilter,
  notifications: Bell,
  bookmarks: Bookmark,
  wishlist: Heart,
  "lineage-claims": GitBranch,
  profile: UserRound,
  "sign-in": LogIn,
};

export function siteShellNavigationIcon(key: SiteShellNavigationKey) {
  return NAVIGATION_ICONS[key];
}

/**
 * One group of rail navigation: a heading and the links under it.
 *
 * The group's heading names the `<nav>` (DESIGN.md §3.3). Two unlabelled
 * `navigation` landmarks is what the product shipped until this rewrite, and a
 * screen-reader user could not tell them apart.
 */
export function SiteShellNavigationList({
  items,
  pathname,
  compact = false,
  ariaLabel,
}: {
  items: readonly SiteShellNavigationItem[];
  pathname: string;
  compact?: boolean;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel}>
      <ul className={cn("flex flex-col gap-0.5", compact && "gap-0")}>
        {items.map((item) => (
          <li key={item.key}>
            <SiteShellNavigationLink
              item={item}
              pathname={pathname}
              compact={compact}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteShellMobileNavigation({
  items,
  pathname,
  ariaLabel,
}: {
  items: readonly SiteShellNavigationItem[];
  pathname: string;
  ariaLabel: string;
}) {
  return (
    <nav
      data-site-shell-region="mobile-navigation"
      aria-label={ariaLabel}
      className="site-shell-safe-bottom fixed inset-x-0 bottom-0 z-rail border-t border-border bg-surface lg:hidden"
    >
      <ul className="mx-auto grid min-h-14 max-w-lg grid-cols-5">
        {items.map((item) => {
          const Icon = NAVIGATION_ICONS[item.key];
          const active = isSiteShellItemActive(pathname, item);

          return (
            <li key={item.key} className="min-w-0">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                data-active={active || undefined}
                className="flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-text-secondary transition-colors duration-instant ease-out outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring data-[active]:text-action-subtle-text"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                <span className="max-w-full text-center text-caption leading-none font-medium break-words">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteShellMobileUtilities({
  privacyHref,
  privacyLabel,
  children,
}: {
  privacyHref: string;
  privacyLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-site-shell-mobile-utilities="true"
      className="flex flex-col gap-2"
    >
      <Link
        href={privacyHref}
        className={buttonVariants({
          variant: "ghost",
          className: "justify-start",
        })}
      >
        <ShieldCheck data-icon="inline-start" aria-hidden="true" />
        {privacyLabel}
      </Link>
      {children}
    </div>
  );
}

function SiteShellNavigationLink({
  item,
  pathname,
  compact,
}: {
  item: SiteShellNavigationItem;
  pathname: string;
  compact: boolean;
}) {
  const Icon = NAVIGATION_ICONS[item.key];
  const active = isSiteShellItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-active={active || undefined}
      data-site-shell-nav-item={item.key}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-body-sm font-medium text-text-secondary transition-colors duration-instant ease-out outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring data-[active]:bg-action-subtle data-[active]:text-action-subtle-text",
        compact && "min-h-9 py-1.5",
      )}
    >
      <Icon aria-hidden="true" className="size-4.5 shrink-0" />
      <span className="min-w-0 break-words">{item.label}</span>
    </Link>
  );
}
