import { Bell, Bookmark, ListFilter, Sprout } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";

type SocialTab = "feed" | "notifications" | "bookmarks" | "wishlist";

const TAB_ICONS = {
  feed: ListFilter,
  notifications: Bell,
  bookmarks: Bookmark,
  wishlist: Sprout,
} as const;

export function MySocialLayout({
  locale,
  active,
  title,
  description,
  count,
  countLabel,
  controls,
  children,
}: {
  locale: PublicLocale;
  active: SocialTab;
  title: string;
  description: string;
  count?: number;
  countLabel?: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const tabs: SocialTab[] = ["feed", "notifications", "bookmarks", "wishlist"];

  return (
    <main
      lang={locale}
      data-my-social-surface={active}
      className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5"
    >
      <header className="grid gap-3 border-b border-border pb-4">
        <p className="text-overline text-text-muted uppercase">
          {copy.my}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1">
            <h1 className="text-h1 break-words text-text-heading">{title}</h1>
            <p className="max-w-prose text-body-sm text-text-muted">
              {description}
            </p>
          </div>
          {typeof count === "number" ? (
            <p className="text-body-sm whitespace-nowrap text-text-muted tabular-nums">
              {countLabel ?? copy.common.itemCount(count)}
            </p>
          ) : null}
        </div>
        <nav className="-mb-4 flex gap-1 overflow-x-auto" aria-label={copy.my}>
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab];
            return (
              <Link
                key={tab}
                href={localizedPath(locale, `/${tab}`)}
                aria-current={active === tab ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-body-sm font-medium transition-colors duration-instant ease-out outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  active === tab
                    ? "border-action text-text-heading"
                    : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {copy.tabs[tab]}
              </Link>
            );
          })}
        </nav>
      </header>

      {controls ? <div className="flex flex-wrap gap-2">{controls}</div> : null}
      {children}
    </main>
  );
}

export function SocialEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border-y border-dashed border-border py-10 text-center text-body-sm text-text-muted">
      {children}
    </div>
  );
}
