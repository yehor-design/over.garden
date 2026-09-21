import { ArrowSquareOutIcon as ExternalLink } from "@/components/icons/ArrowSquareOut";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { MySocialLayout } from "@/components/social/my-social-layout";
import {
  ShelfNotice,
  ShelfRemoveButton,
  ShelfRow,
} from "@/components/social/shelf";
import { Button, buttonVariants } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { HiddenField } from "@/components/ui/hidden-field";
import { iconButtonVariants } from "@/components/ui/icon-button";
import { Pagination } from "@/components/ui/pagination";
import type { CatalogKind } from "@/db/schema";
import { resolveIllustration } from "@/lib/illustrations";
import { CATALOG_BROWSE_PATH } from "@/lib/public-catalog-browse";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";
import {
  listWishlistShelfItems,
  type WishlistShelfItem,
} from "@/server/wishlist-repository";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  addCatalogPublicSlugToWishlistAction,
  removeCatalogPublicSlugFromWishlistAction,
} from "@/app/(default)/wishlist/actions";

const PAGE_SIZE = 12;

interface LocalizedWishlistRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: LocalizedWishlistRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam) ? localeParam : "uk";
  const copy = getSocialSurfaceCopy(locale);
  return {
    title: `${copy.wishlist.title} | OverGarden`,
    description: copy.wishlist.description,
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(locale, "/wishlist"),
          languages: buildLanguageAlternates("/wishlist"),
        }
      : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function LocalizedWishlistRoute({
  params,
  searchParams,
}: LocalizedWishlistRouteProps) {
  const [{ locale: localeParam }, query] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  if (!isPublicLocale(localeParam)) notFound();
  const copy = getSocialSurfaceCopy(localeParam);
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) {
    return (
      <MySocialLayout
        locale={localeParam}
        active="wishlist"
        title={copy.wishlist.title}
        description={copy.wishlist.description}
      >
        <SignInPrompt
          locale={localeParam}
          next={localizedPath(localeParam, "/wishlist")}
          description={copy.wishlist.signIn}
        />
      </MySocialLayout>
    );
  }

  const filter = parseFilter(firstParam(query.kind));
  const page = parsePage(firstParam(query.page));
  const undoSlug = parseUndoSlug(firstParam(query.undoSlug));
  const allItems = await listWishlistShelfItems(
    scopedToUser(userId, getSessionId(session)),
  );
  const filtered = allItems.filter((item) =>
    filter === "all" ? true : item.catalog.catalogKind === filter,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const items = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <MySocialLayout
      locale={localeParam}
      active="wishlist"
      title={copy.wishlist.title}
      description={copy.wishlist.description}
      count={filtered.length}
      controls={<WishlistFilters locale={localeParam} active={filter} />}
      notice={
        undoSlug ? (
          <ShelfNotice
            regionLabel={copy.common.noticeRegion}
            title={copy.wishlist.removedNotice}
            dismissLabel={copy.common.dismissNotice}
            undo={
              <OwnerScopedProgressiveForm
                action={addCatalogPublicSlugToWishlistAction}
              >
                <HiddenField name="catalogPublicSlug" value={undoSlug} />
                <HiddenField name="locale" value={localeParam} />
                <HiddenField
                  name="returnTo"
                  value={localizedPath(localeParam, "/wishlist")}
                />
                <Button type="submit" variant="secondary" size="sm">
                  {copy.common.undo}
                </Button>
              </OwnerScopedProgressiveForm>
            }
          />
        ) : null
      }
    >
      {items.length === 0 ? (
        filter === "all" ? (
          <EmptyState
            illustration={resolveIllustration("empty-wishlist")}
            title={copy.wishlist.emptyTitle}
            description={copy.wishlist.empty}
            action={
              <Link
                href={localizedPath(localeParam, CATALOG_BROWSE_PATH)}
                className={buttonVariants()}
              >
                {copy.wishlist.emptyAction}
              </Link>
            }
          />
        ) : (
          <EmptyState
            variant="no-results"
            title={copy.common.noResultsTitle}
            description={copy.common.noResultsDescription}
            action={
              <Link
                href={localizedPath(localeParam, "/wishlist")}
                className={buttonVariants({ variant: "secondary" })}
              >
                {copy.common.clearFilters}
              </Link>
            }
          />
        )
      ) : (
        <ul className="grid">
          {items.map((item) => (
            <WishlistRow key={item.key} item={item} locale={localeParam} />
          ))}
        </ul>
      )}
      {pageCount > 1 ? (
        <Pagination
          label={copy.wishlist.title}
          previousLabel={copy.common.previous}
          previousHref={
            currentPage > 1
              ? wishlistHref(localeParam, filter, currentPage - 1)
              : null
          }
          nextLabel={copy.common.next}
          nextHref={
            currentPage < pageCount
              ? wishlistHref(localeParam, filter, currentPage + 1)
              : null
          }
          status={copy.common.pagePlace(currentPage, pageCount)}
        />
      ) : null}
    </MySocialLayout>
  );
}

type WishlistFilter = "all" | CatalogKind;

function WishlistFilters({
  locale,
  active,
}: {
  locale: PublicLocale;
  active: WishlistFilter;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const filters: Array<[Exclude<WishlistFilter, "all">, string]> = [
    ["plant_variety", copy.wishlist.plants],
    ["species", copy.wishlist.species],
    ["breed", copy.wishlist.breeds],
  ];
  return (
    <form
      method="get"
      action={localizedPath(locale, "/wishlist")}
      data-wishlist-filters="true"
      aria-label={copy.wishlist.filtersLabel}
      className="flex max-w-full items-center gap-2 overflow-x-auto py-1"
    >
      <ToggleChip label={copy.wishlist.all} pressed={active === "all"} />
      {filters.map(([value, label]) => {
        const pressed = active === value;
        return (
          <ToggleChip
            key={value}
            {...(pressed ? {} : { name: "kind", value })}
            label={label}
            pressed={pressed}
          />
        );
      })}
    </form>
  );
}

function WishlistRow({
  item,
  locale,
}: {
  item: WishlistShelfItem;
  locale: PublicLocale;
}) {
  const copy = getSocialSurfaceCopy(locale);
  return (
    <ShelfRow
      kindLabel={copy.wishlist.tryLater}
      title={item.catalog.canonicalName}
      href={item.publicPath ?? undefined}
      meta={`${copy.common.saved} ${formatDate(item.addedAt, locale)}`}
      actions={
        <>
          {item.activationPath ? (
            <Link
              href={item.activationPath}
              aria-label={`${copy.wishlist.start}: ${item.catalog.canonicalName}`}
              className={iconButtonVariants({ variant: "primary" })}
            >
              <Sprout aria-hidden="true" className="size-5" />
            </Link>
          ) : null}
          {item.publicPath ? (
            <Link
              href={item.publicPath}
              aria-label={`${copy.common.open}: ${item.catalog.canonicalName}`}
              className={iconButtonVariants({ variant: "secondary" })}
            >
              <ExternalLink aria-hidden="true" className="size-5" />
            </Link>
          ) : null}
          {item.catalog.publicSlug ? (
            <OwnerScopedProgressiveForm
              action={removeCatalogPublicSlugFromWishlistAction}
            >
              <HiddenField
                name="catalogPublicSlug"
                value={item.catalog.publicSlug}
              />
              <HiddenField name="locale" value={locale} />
              <ShelfRemoveButton
                label={`${copy.common.remove}: ${item.catalog.canonicalName}`}
              />
            </OwnerScopedProgressiveForm>
          ) : null}
        </>
      }
    />
  );
}

function wishlistHref(
  locale: PublicLocale,
  filter: WishlistFilter,
  page: number,
) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("kind", filter);
  if (page > 1) params.set("page", String(page));
  const path = localizedPath(locale, "/wishlist");
  return params.size ? `${path}?${params}` : path;
}

function parseFilter(value: string | undefined): WishlistFilter {
  return value === "plant_variety" || value === "species" || value === "breed"
    ? value
    : "all";
}

/**
 * The slug a removal left behind. Re-checked against the catalogue's own slug
 * shape, so an address a reader was handed cannot put anything else into the
 * Undo form's hidden field.
 */
function parseUndoSlug(value: string | undefined) {
  if (!value) return null;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 96
    ? value
    : null;
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page <= 50 ? page : 1;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
