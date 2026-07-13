import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Sprout,
  Trash2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MySocialLayout,
  SocialEmptyState,
} from "@/components/social/my-social-layout";
import { buttonVariants } from "@/components/ui/button";
import type { CatalogKind } from "@/db/schema";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import { resolveVisualSocialScenario } from "@/lib/visual-fixtures/social-return-scenarios";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";
import {
  listWishlistShelfItems,
  type WishlistShelfItem,
} from "@/server/wishlist-repository";
import { GardenAuthPanel } from "../../garden/garden-auth-panel";
import { removeCatalogPublicSlugFromWishlistAction } from "../../wishlist/actions";

export const dynamic = "force-dynamic";
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
  return {
    title: "Wishlist | OverGarden",
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
  const visualScenario = resolveVisualSocialScenario(
    query.visualSocial,
    "wishlist",
    process.env,
  );
  const userId = visualScenario?.actorId ?? session?.user?.id;
  if (!userId) {
    return (
      <MySocialLayout
        locale={localeParam}
        active="wishlist"
        title={copy.wishlist.title}
        description={copy.wishlist.description}
      >
        <GardenAuthPanel initialMessage={copy.wishlist.signIn} />
      </MySocialLayout>
    );
  }

  const filter = parseFilter(firstParam(query.kind));
  const page = parsePage(firstParam(query.page));
  const allItems = await listWishlistShelfItems(
    scopedToUser(userId, visualScenario ? null : getSessionId(session)),
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
      controls={
        <WishlistFilters
          locale={localeParam}
          active={filter}
          visualScenarioId={visualScenario?.id ?? null}
        />
      }
    >
      {items.length === 0 ? (
        <SocialEmptyState>{copy.wishlist.empty}</SocialEmptyState>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {items.map((item) => (
            <WishlistRow
              key={item.key}
              item={item}
              locale={localeParam}
              visualScenarioId={visualScenario?.id ?? null}
            />
          ))}
        </ol>
      )}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          {currentPage > 1 ? (
            <Link
              href={wishlistHref(
                localeParam,
                filter,
                currentPage - 1,
                visualScenario?.id,
              )}
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeft className="size-4" />
              {copy.common.previous}
            </Link>
          ) : (
            <span />
          )}
          {currentPage < pageCount ? (
            <Link
              href={wishlistHref(
                localeParam,
                filter,
                currentPage + 1,
                visualScenario?.id,
              )}
              className={buttonVariants({ variant: "outline" })}
            >
              {copy.common.next}
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </MySocialLayout>
  );
}

type WishlistFilter = "all" | CatalogKind;

function WishlistFilters({
  locale,
  active,
  visualScenarioId,
}: {
  locale: PublicLocale;
  active: WishlistFilter;
  visualScenarioId: string | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const filters: Array<[WishlistFilter, string]> = [
    ["all", copy.wishlist.all],
    ["plant_variety", copy.wishlist.plants],
    ["species", copy.wishlist.species],
    ["breed", copy.wishlist.breeds],
  ];
  return (
    <div
      className="flex overflow-x-auto border border-border"
      role="group"
      aria-label={copy.wishlist.filtersLabel}
    >
      {filters.map(([value, label]) => (
        <Link
          key={value}
          href={wishlistHref(locale, value, 1, visualScenarioId)}
          aria-current={active === value ? "true" : undefined}
          className={filterClass(active === value)}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function WishlistRow({
  item,
  locale,
  visualScenarioId,
}: {
  item: WishlistShelfItem;
  locale: PublicLocale;
  visualScenarioId: string | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  return (
    <li className="grid gap-4 py-4 sm:flex sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-1 sm:flex-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          {copy.wishlist.tryLater}
        </p>
        <h2 className="font-semibold text-foreground">
          {item.catalog.canonicalName}
        </h2>
        <time className="text-xs text-muted-foreground">
          {copy.common.saved} {formatDate(item.addedAt, locale)}
        </time>
      </div>
      <div className="flex flex-wrap gap-2">
        {item.activationPath ? (
          <Link
            href={item.activationPath}
            title={copy.wishlist.start}
            className={buttonVariants({ size: "icon" })}
          >
            <Sprout className="size-4" />
            <span className="sr-only">{copy.wishlist.start}</span>
          </Link>
        ) : null}
        {item.publicPath ? (
          <Link
            href={item.publicPath}
            title={copy.common.open}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ExternalLink className="size-4" />
            <span className="sr-only">{copy.common.open}</span>
          </Link>
        ) : null}
        {item.catalog.publicSlug ? (
          <form action={removeCatalogPublicSlugFromWishlistAction}>
            <input
              type="hidden"
              name="catalogPublicSlug"
              value={item.catalog.publicSlug}
            />
            <input type="hidden" name="locale" value={locale} />
            {visualScenarioId ? (
              <input
                type="hidden"
                name="visualSocial"
                value={visualScenarioId}
              />
            ) : null}
            <button
              type="submit"
              title={copy.common.remove}
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">{copy.common.remove}</span>
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

function wishlistHref(
  locale: PublicLocale,
  filter: WishlistFilter,
  page: number,
  visualScenarioId?: string | null,
) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("kind", filter);
  if (page > 1) params.set("page", String(page));
  if (visualScenarioId) params.set("visualSocial", visualScenarioId);
  const path = localizedPath(locale, "/wishlist");
  return params.size ? `${path}?${params}` : path;
}

function filterClass(active: boolean) {
  return `min-h-9 shrink-0 border-r border-border px-3 py-2 text-sm last:border-r-0 ${
    active
      ? "bg-foreground text-background"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
}

function parseFilter(value: string | undefined): WishlistFilter {
  return value === "plant_variety" || value === "species" || value === "breed"
    ? value
    : "all";
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
