import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { type PublicLocale } from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";

/**
 * The reader's own pages: the feed they follow, Activity, Bookmarks and the
 * wishlist, each under one header (`OVE-456`).
 *
 * They were four tabs over one strip. The shell's navigation and its account
 * menu reach all four now, so the strip — and the helper that built it — is
 * gone (`OVE-502`): a second row of the same destinations under the page title
 * was a second way to say where the reader already was. Filters are chips
 * (DESIGN.md §5.1), shown only where there is something to filter.
 */
export type SocialTab = "feed" | "notifications" | "bookmarks" | "wishlist";

export function MySocialLayout({
  locale,
  active,
  title,
  description,
  count,
  countLabel,
  controls,
  actions,
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
  /** Links beside the count — the Activity page's settings (`OVE-501`). */
  actions?: ReactNode;
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
          typeof count === "number" || actions ? (
            <div className="flex flex-wrap items-center gap-3">
              {typeof count === "number" ? (
                <p
                  data-my-social-count={count}
                  className="text-body-sm whitespace-nowrap text-text-muted tabular-nums"
                >
                  {countLabel ?? copy.common.itemCount(count)}
                </p>
              ) : null}
              {actions}
            </div>
          ) : undefined
        }
      />
      {controls ? <div className="flex flex-col gap-3">{controls}</div> : null}
      {children}
      {notice}
    </main>
  );
}
