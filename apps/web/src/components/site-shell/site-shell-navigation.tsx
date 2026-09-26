"use client";

import Link from "next/link";
import type { InterfaceIcon } from "@/components/icons";
import { BellIcon as Bell } from "@/components/icons/Bell";
import { BookmarkSimpleIcon as Bookmark } from "@/components/icons/BookmarkSimple";
import { BookOpenTextIcon as BookOpenText } from "@/components/icons/BookOpenText";
import { UserCircleIcon as CircleUserRound } from "@/components/icons/UserCircle";
import { GitBranchIcon as GitBranch } from "@/components/icons/GitBranch";
import { SquaresFourIcon as LayoutDashboard } from "@/components/icons/SquaresFour";
import { FunnelIcon as ListFilter } from "@/components/icons/Funnel";
import { SignInIcon as LogIn } from "@/components/icons/SignIn";
import { NewspaperIcon as Newspaper } from "@/components/icons/Newspaper";
import { NotebookIcon as NotebookText } from "@/components/icons/Notebook";
import { ShieldCheckIcon as ShieldCheck } from "@/components/icons/ShieldCheck";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@/components/icons/SlidersHorizontal";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import { NotePencilIcon as SquarePen } from "@/components/icons/NotePencil";
import { UserIcon as UserRound } from "@/components/icons/User";
import { UsersIcon as UsersRound } from "@/components/icons/Users";

import {
  isSiteShellItemActive,
  type SiteShellNavigationItem,
  type SiteShellNavigationKey,
} from "@/lib/site-shell-navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAVIGATION_ICONS: Record<SiteShellNavigationKey, InterfaceIcon> = {
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
  "lineage-claims": GitBranch,
  profile: UserRound,
  you: CircleUserRound,
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
  pathname: string | null;
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

/**
 * The five-slot bar below `lg`: **Feed · Catalogue · New entry · Journals ·
 * You** (DESIGN.md §3.2, ADR-0031 D4).
 *
 * What it replaces spent a slot on "Sign in" while the product's central verb —
 * writing an entry — had no place on a phone at all, on a product whose whole
 * purpose is gardeners publishing. Authentication is not a tab: a signed-out
 * visitor sees "You", which leads to sign-in and back.
 *
 * Three measurements rather than three opinions. Each slot is at least
 * 44 × 44 at 320 px, which is five 64 px columns with room to spare. The label
 * is `text-caption` and wraps rather than truncating, because Bulgarian
 * "Дневници" is a third longer than Ukrainian "Журнали" and WCAG 1.4.12's
 * letter-spacing override adds another tenth on top (§2.6). And the bar pads
 * itself by `env(safe-area-inset-bottom)` while the content column pads itself
 * by the bar's height plus the same inset, so nothing hides underneath it.
 */
export function SiteShellMobileNavigation({
  items,
  pathname,
  ariaLabel,
  primaryActionKey,
}: {
  items: readonly SiteShellNavigationItem[];
  pathname: string | null;
  ariaLabel: string;
  /** The one slot drawn as a filled action rather than a destination. */
  primaryActionKey?: SiteShellNavigationKey;
}) {
  return (
    <nav
      data-site-shell-region="mobile-navigation"
      aria-label={ariaLabel}
      className="site-shell-safe-bottom fixed inset-x-0 bottom-0 z-rail border-t border-border bg-surface lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-tab-bar items-stretch">
        {items.map((item) => {
          const Icon = NAVIGATION_ICONS[item.key];
          const active =
            pathname !== null && isSiteShellItemActive(pathname, item);
          const isPrimary = item.key === primaryActionKey;

          return (
            <li key={item.key} className="flex min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={isPrimary ? item.label : undefined}
                data-active={active || undefined}
                data-site-shell-tab={item.key}
                {...(isPrimary
                  ? { "data-site-shell-action": "new-entry" }
                  : {})}
                className="flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 text-text-secondary transition-colors duration-instant ease-out outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring data-[active]:text-action-subtle-text"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex shrink-0 items-center justify-center",
                    isPrimary &&
                      "size-10 rounded-full bg-action text-text-on-fill",
                  )}
                >
                  <Icon selected={active} className="size-5 shrink-0" />
                </span>
                {/* The action's name is on the control, not under it. "Новий
                    запис" is the widest label the product has and this is its
                    narrowest column — at 320 px it wrapped to two lines and
                    spilled past the bar, in every one of the three languages.
                    The filled circle is what makes the slot distinct
                    (ADR-0031 D4); the name is what a screen reader reads. */}
                {isPrimary ? null : (
                  <span className="max-w-full text-center text-caption leading-tight font-medium break-words">
                    {item.label}
                  </span>
                )}
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
  cookiesHref,
  cookiesLabel,
  children,
}: {
  privacyHref: string;
  privacyLabel: string;
  /** «Налаштування cookies» (ADR-0038 D4): changing a choice from the menu. */
  cookiesHref?: string;
  cookiesLabel?: string;
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
      {cookiesHref && cookiesLabel ? (
        <Link
          href={cookiesHref}
          data-site-shell-cookie-settings="true"
          className={buttonVariants({
            variant: "ghost",
            className: "justify-start",
          })}
        >
          <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
          {cookiesLabel}
        </Link>
      ) : null}
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
  pathname: string | null;
  compact: boolean;
}) {
  const Icon = NAVIGATION_ICONS[item.key];
  const active = pathname !== null && isSiteShellItemActive(pathname, item);

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
      <Icon selected={active} aria-hidden="true" className="size-5 shrink-0" />
      <span className="min-w-0 break-words">{item.label}</span>
    </Link>
  );
}
