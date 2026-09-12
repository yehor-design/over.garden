import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText, Leaf, Sprout } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { publicCatalogRegisterHubPath } from "@/lib/catalog/addresses";
import {
  CATALOG_BROWSE_INITIALS,
  buildPublicCatalogBrowseHref,
  type CatalogBrowseInitial,
  type CatalogBrowseKingdom,
  type PublicCatalogBrowseRequest,
} from "@/lib/public-catalog-browse";
import type { PublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import type {
  CatalogBrowseCard,
  CatalogBrowseKingdomSummary,
  CatalogBrowsePage,
} from "@/server/public-catalog-browse-repository";

/**
 * The catalog's front door (OVE-431).
 *
 * Every navigation on this page is an `<a href>` rendered on the server: a
 * crawler with JavaScript switched off walks kingdoms, then initials, then
 * organisms, and so does a reader on a slow connection (ADR-0024). Nothing
 * here is a button that needs hydration to go anywhere.
 */
export function PublicCatalogBrowse({
  locale,
  copy,
  request,
  kingdoms,
  firstHand,
  registerHubs,
  page,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicCatalogBrowseCopy;
  request: PublicCatalogBrowseRequest;
  kingdoms: readonly CatalogBrowseKingdomSummary[];
  firstHand: readonly CatalogBrowseCard[];
  registerHubs?: readonly { slug: string; name: string; total: number }[];
  page: CatalogBrowsePage | null;
  jsonLd?: Record<string, unknown> | null;
}) {
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const activeKingdom = request.kingdom;

  return (
    <main
      lang={locale}
      data-public-catalog-browse="true"
      data-catalog-browse-kingdom={activeKingdom ?? "all"}
      className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-4 sm:px-6 sm:py-5"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-semibold text-foreground sm:text-4xl">
          {activeKingdom ? copy.kingdom[activeKingdom] : copy.title}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {copy.description}
        </p>
        {activeKingdom ? (
          <Link
            href={localizedPath(locale, "/species")}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" />
            {copy.backToKingdoms}
          </Link>
        ) : null}
      </header>

      {!activeKingdom && firstHand.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sprout className="size-4 text-primary" />
              {copy.firstHandHeading}
            </h2>
            <p className="text-sm text-muted-foreground">
              {copy.firstHandDescription}
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {firstHand.map((card) => (
              <li key={card.id}>
                <Link
                  href={localizedPath(locale, card.path)}
                  className="inline-flex rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:border-primary"
                >
                  {card.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!activeKingdom && registerHubs && registerHubs.length > 0 ? (
        // The register hubs (OVE-433). They are the substantive pages in the
        // catalog — an aggregation over cards that are `noindex` on their own
        // (ADR-0026 D9) — so the browse root links them before the kingdoms.
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FileText className="size-4 text-primary" />
            {copy.registersHeading}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {registerHubs.map((hub) => (
              <li key={hub.slug}>
                <Link
                  href={localizedPath(
                    locale,
                    publicCatalogRegisterHubPath(hub.slug),
                  )}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:border-primary"
                >
                  {hub.name}
                  <span className="text-xs text-muted-foreground">
                    {hub.total}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!activeKingdom ? (
        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Leaf className="size-4 text-primary" />
            {copy.kingdomsHeading}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {kingdoms.map((summary) => (
              <li
                key={summary.kingdom}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={buildPublicCatalogBrowseHref(locale, {
                      kingdom: summary.kingdom,
                    })}
                    className="text-base font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    {copy.kingdom[summary.kingdom]}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {copy.organismCount(summary.total)}
                  </p>
                </div>
                <InitialRow
                  locale={locale}
                  kingdom={summary.kingdom}
                  initials={summary.initials}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeKingdom ? (
        <section className="flex flex-col gap-4">
          <InitialRow
            locale={locale}
            kingdom={activeKingdom}
            initials={
              kingdoms.find((summary) => summary.kingdom === activeKingdom)
                ?.initials ?? []
            }
            active={request.initial}
            allLabel={copy.allInitials}
          />

          {page && page.cards.length > 0 ? (
            <>
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {page.cards.map((card) => (
                  <li key={card.id}>
                    <Link
                      href={localizedPath(locale, card.path)}
                      className="block rounded-md px-2 py-1 text-sm text-foreground underline-offset-4 hover:bg-muted hover:underline"
                    >
                      {card.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <nav className="flex items-center justify-between gap-3 border-t border-border pt-4">
                {request.page > 1 ? (
                  <Link
                    href={buildPublicCatalogBrowseHref(locale, {
                      ...request,
                      page: request.page - 1,
                    })}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <ArrowLeft className="size-4" />
                    {copy.previousPage}
                  </Link>
                ) : (
                  <span />
                )}
                <p className="text-xs text-muted-foreground">
                  {copy.pageOf(request.page, page.pageCount)}
                </p>
                {request.page < page.pageCount ? (
                  <Link
                    href={buildPublicCatalogBrowseHref(locale, {
                      ...request,
                      page: request.page + 1,
                    })}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {copy.nextPage}
                    <ArrowRight className="size-4" />
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.emptyInitial}</p>
          )}
        </section>
      ) : null}
    </main>
  );
}

function InitialRow({
  locale,
  kingdom,
  initials,
  active,
  allLabel,
}: {
  locale: PublicLocale;
  kingdom: CatalogBrowseKingdom;
  initials: readonly { initial: CatalogBrowseInitial; total: number }[];
  active?: CatalogBrowseInitial | null;
  allLabel?: string;
}) {
  const counts = new Map(
    initials.map((entry) => [entry.initial, entry.total] as const),
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {allLabel ? (
        <Link
          href={buildPublicCatalogBrowseHref(locale, { kingdom })}
          data-catalog-browse-initial="all"
          aria-current={active ? undefined : "page"}
          className={
            active
              ? "rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              : "rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground"
          }
        >
          {allLabel}
        </Link>
      ) : null}
      {CATALOG_BROWSE_INITIALS.map((initial) => {
        const total = counts.get(initial) ?? 0;
        if (total === 0) {
          return (
            <span
              key={initial}
              aria-hidden="true"
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground/40 uppercase"
            >
              {initial}
            </span>
          );
        }
        return (
          <Link
            key={initial}
            href={buildPublicCatalogBrowseHref(locale, { kingdom, initial })}
            data-catalog-browse-initial={initial}
            aria-current={active === initial ? "page" : undefined}
            title={`${initial.toUpperCase()} · ${total}`}
            className={
              active === initial
                ? "rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground uppercase"
                : "rounded px-1.5 py-0.5 text-xs text-foreground uppercase hover:bg-muted"
            }
          >
            {initial}
          </Link>
        );
      })}
    </div>
  );
}
