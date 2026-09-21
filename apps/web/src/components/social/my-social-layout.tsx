import { BellIcon as Bell } from "@/components/icons/Bell";
import { BookmarkSimpleIcon as Bookmark } from "@/components/icons/BookmarkSimple";
import { HeartIcon as Heart } from "@/components/icons/Heart";
import { FunnelIcon as ListFilter } from "@/components/icons/Funnel";
import type { InterfaceIcon } from "@/components/icons";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { type TabLinkModel } from "@/components/ui/tabs";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";

/**
 * The reader's own pages: one family, one header, one strip (`OVE-456`).
 *
 * They were four tabs and three unrelated pages — the feed, notifications,
 * bookmarks and the wishlist each drawing a header of their own, and each
 * putting its filters in a bordered box below the strip that stopped where its
 * content did. A bar that spans half the page and separates nothing is a line a
 * reader has to work out, so the filters are chips now (DESIGN.md §5.1) and the
 * only rule on the screen is the one the tabs sit on.
 *
 * The strip is `TabLinks` rather than `Tabs`: these are four addresses, so
 * pressing one navigates, and the selected one is in the URL by being the URL —
 * shareable, reloadable and reachable with Back (DESIGN.md §5.7).
 */
export type SocialTab = "feed" | "notifications" | "bookmarks" | "wishlist";

const TAB_ICONS: Record<SocialTab, InterfaceIcon> = {
  feed: ListFilter,
  notifications: Bell,
  bookmarks: Bookmark,
  wishlist: Heart,
};

export const PERSONAL_SURFACE_TABS: readonly SocialTab[] = [
  "feed",
  "notifications",
  "bookmarks",
  "wishlist",
];

export function personalSurfaceTabs(
  locale: PublicLocale,
  active: SocialTab,
): TabLinkModel[] {
  const copy = getSocialSurfaceCopy(locale);
  return PERSONAL_SURFACE_TABS.map((tab) => {
    const Icon = TAB_ICONS[tab];
    return {
      key: tab,
      href: localizedPath(locale, `/${tab}`),
      current: tab === active,
      label: (
        <>
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {copy.tabs[tab]}
        </>
      ),
    };
  });
}

export function MySocialLayout({
  locale,
  active,
  title,
  description,
  count,
  countLabel,
  controls,
  notice,
  children,
}: {
  locale: PublicLocale;
  active: SocialTab;
  title: string;
  description: string;
  count?: number;
  countLabel?: string;
  controls?: ReactNode;
  /** The outcome of the last action, as a toast. Rendered above everything. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const copy = getSocialSurfaceCopy(locale);

  return (
    <main
      lang={locale}
      data-my-social-surface={active}
      className="flex w-full flex-col gap-5 px-4 py-6 sm:px-6"
    >
      <PageHeader
        eyebrow={copy.my}
        title={title}
        description={description}
        className="border-b-0 pb-0"
        actions={
          typeof count === "number" ? (
            <p className="text-body-sm whitespace-nowrap text-text-muted tabular-nums">
              {countLabel ?? copy.common.itemCount(count)}
            </p>
          ) : undefined
        }
      />
      {controls ? <div className="flex flex-col gap-3">{controls}</div> : null}
      {children}
      {notice}
    </main>
  );
}
