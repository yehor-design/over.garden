"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bookmark,
  BookOpenText,
  CirclePlus,
  Files,
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
  "living-objects": Sprout,
  journals: NotebookText,
  communities: UsersRound,
  knowledge: BookOpenText,
  garden: LayoutDashboard,
  "add-object": CirclePlus,
  "add-update": SquarePen,
  drafts: Files,
  "followed-feed": ListFilter,
  notifications: Bell,
  bookmarks: Bookmark,
  wishlist: Heart,
  "lineage-claims": GitBranch,
  profile: UserRound,
  "sign-in": LogIn,
};

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
      <ul className={cn("flex flex-col gap-1", compact && "gap-0.5")}>
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
      className="site-shell-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid h-17 max-w-lg grid-cols-5">
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
                className="flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active]:text-primary"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                <span className="site-shell-mobile-label max-w-full text-center leading-3 font-medium break-words">
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
}: {
  privacyHref: string;
  privacyLabel: string;
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
      className={cn(
        "flex min-h-9 items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active]:bg-accent data-[active]:text-accent-foreground",
        compact && "min-h-8 py-1.5",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 break-words">{item.label}</span>
    </Link>
  );
}
