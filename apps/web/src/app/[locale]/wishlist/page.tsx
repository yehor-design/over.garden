import { ArrowSquareOutIcon as ExternalLink } from "@/components/icons/ArrowSquareOut";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  removeWishlistItemAction,
  restoreWishlistItemAction,
} from "@/app/(default)/wishlist/actions";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { MySocialLayout } from "@/components/social/my-social-layout";
import {
  ShelfNotice,
  ShelfRemoveButton,
  ShelfRow,
} from "@/components/social/shelf";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
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
import {
  readShelfOutcome,
  shelfRowAnchor,
  type ShelfAction,
} from "@/lib/social/shelf-view";
import {
  fillSocialTemplate,
  getSocialSurfaceCopy,
  type SocialSurfaceCopy,
} from "@/lib/social-surface-copy";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import {
  findWishlistCatalogName,
  listWishlistShelfItems,
  type WishlistShelfItem,
} from "@/server/wishlist-repository";

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

type WishlistFilter = "all" | CatalogKind;

interface WishlistOutcomeNotice {
  outcome: "removed" | "restored" | "failed";
  action: ShelfAction;
  catalogItemId: string;
  name: string | null;
  /** Whether the catalogue still offers it, so an Undo can put it back. */
  restorable: boolean;
}

/**
 * The wishlist: species, varieties and breeds a reader wants to grow or keep,
 * as distinct from Bookmarks, which is saved reading (`OVE-502`).
 *
 * One name for it everywhere — «Список бажань» in the menu, the title, the
 * sign-in prompt and every notice; the page itself said «Хочу спробувати».
 * Each row says what kind of organism it is. One the catalogue no longer
 * offers stays on the list, says so and can still be removed; it used to be
 * dropped from the list and could not be removed at all.
 *
 * A removal comes back to the view it was pressed in, names what it removed
 * and offers an Undo; a refused write is said beside its row. The filter chips
 * appear only on a list that has something to filter, and the one read is
 * settled.
 */
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
  const locale = localeParam;
  const copy = getSocialSurfaceCopy(locale);
  const filter = parseFilter(firstParam(query.kind));
  const page = parsePage(firstParam(query.page));
  const viewHref = wishlistHref(locale, filter, page);
  const layout = {
    locale,
    active: "wishlist" as const,
    title: copy.wishlist.title,
    description: copy.wishlist.description,
  };

  const viewer = await resolveWorkspaceViewer();
  if (viewer.status === "unavailable") {
    return (
      <MySocialLayout {...layout}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={viewHref}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </MySocialLayout>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <MySocialLayout {...layout}>
        <SignInPrompt
          locale={locale}
          next={viewHref}
          description={copy.wishlist.signIn}
        />
      </MySocialLayout>
    );
  }

  const outcome = readShelfOutcome(query);
  const settled = await settleSection(
    async () => {
      const [items, named] = await Promise.all([
        listWishlistShelfItems(viewer.scope),
        outcome ? findWishlistCatalogName(outcome.target) : null,
      ]);
      return { items, named };
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface: "wishlist",
      section: "shelf",
    },
  );
  if (settled.status === "error") {
    return (
      <MySocialLayout {...layout}>
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          retryHref={viewHref}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </MySocialLayout>
    );
  }

  const { items: allItems, named } = settled.value;
  const filtered = allItems.filter((item) =>
    filter === "all" ? true : item.catalog.catalogKind === filter,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const items = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const currentView = wishlistHref(locale, filter, currentPage);
  const notice: WishlistOutcomeNotice | null = outcome
    ? {
        outcome: outcome.outcome,
        action: outcome.action,
        catalogItemId: outcome.target,
        name: named?.name ?? null,
        restorable: named?.available ?? false,
      }
    : null;
  // Beside its row when the row is on this page; above the list otherwise.
  const failedRow =
    notice?.outcome === "failed"
      ? items.find((item) => item.catalogItemId === notice.catalogItemId)
      : undefined;

  return (
    <MySocialLayout
      {...layout}
      count={filtered.length}
      controls={
        allItems.length > 0 ? (
          <WishlistFilters locale={locale} active={filter} />
        ) : undefined
      }
      notice={
        notice && notice.outcome !== "failed" ? (
          <ShelfNotice
            regionLabel={copy.common.noticeRegion}
            title={noticeTitle(copy, notice)}
            dismissLabel={copy.common.dismissNotice}
            undo={
              notice.outcome === "removed" && notice.restorable ? (
                <WishlistForm
                  action={restoreWishlistItemAction}
                  catalogItemId={notice.catalogItemId}
                  locale={locale}
                  returnTo={currentView}
                >
                  <Button type="submit" variant="secondary" size="sm">
                    {copy.common.undo}
                  </Button>
                </WishlistForm>
              ) : undefined
            }
          />
        ) : null
      }
    >
      {notice?.outcome === "failed" && !failedRow ? (
        <div id="shelf-outcome" className="scroll-mt-24">
          <Callout
            tone="danger"
            live="assertive"
            data-shelf-outcome="failed"
            actions={
              notice.action === "restore" && notice.restorable ? (
                <WishlistForm
                  action={restoreWishlistItemAction}
                  catalogItemId={notice.catalogItemId}
                  locale={locale}
                  returnTo={currentView}
                >
                  <Button type="submit" variant="secondary" size="sm">
                    {copy.common.retry}
                  </Button>
                </WishlistForm>
              ) : undefined
            }
          >
            <p>{copy.wishlist.failed[notice.action]}</p>
          </Callout>
        </div>
      ) : null}
      {allItems.length === 0 ? (
        <EmptyState
          illustration={resolveIllustration("empty-wishlist")}
          title={copy.wishlist.emptyTitle}
          description={copy.wishlist.empty}
          action={
            <Link
              href={localizedPath(locale, CATALOG_BROWSE_PATH)}
              className={buttonVariants()}
            >
              {copy.wishlist.emptyAction}
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="no-results"
          title={copy.common.noResultsTitle}
          description={copy.common.noResultsDescription}
          action={
            <Link
              href={localizedPath(locale, "/wishlist")}
              className={buttonVariants({ variant: "secondary" })}
            >
              {copy.common.clearFilters}
            </Link>
          }
        />
      ) : (
        <ul
          className="grid"
          aria-label={copy.wishlist.title}
          data-saved-shelf="wishlist"
        >
          {items.map((item) => (
            <WishlistRow
              key={item.key}
              item={item}
              locale={locale}
              returnTo={currentView}
              failed={item === failedRow ? notice!.action : null}
            />
          ))}
        </ul>
      )}
      {pageCount > 1 ? (
        <Pagination
          label={copy.wishlist.title}
          previousLabel={copy.common.previous}
          previousHref={
            currentPage > 1
              ? wishlistHref(locale, filter, currentPage - 1)
              : null
          }
          nextLabel={copy.common.next}
          nextHref={
            currentPage < pageCount
              ? wishlistHref(locale, filter, currentPage + 1)
              : null
          }
          status={copy.common.pagePlace(currentPage, pageCount)}
        />
      ) : null}
    </MySocialLayout>
  );
}

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
  returnTo,
  failed,
}: {
  item: WishlistShelfItem;
  locale: PublicLocale;
  returnTo: string;
  failed: ShelfAction | null;
}) {
  const copy = getSocialSurfaceCopy(locale);
  const name = item.catalog.canonicalName;
  const kindLabel =
    copy.wishlist.kinds[
      item.catalog.catalogKind as keyof typeof copy.wishlist.kinds
    ] ?? copy.wishlist.species;
  return (
    <ShelfRow
      id={shelfRowAnchor(item.catalogItemId)}
      data-saved-item={item.catalog.catalogKind}
      data-saved-available={item.available ? "true" : "false"}
      kindLabel={kindLabel}
      title={name}
      href={item.publicPath ?? undefined}
      meta={
        <>
          {item.available ? null : (
            <span className="block">{copy.wishlist.unavailable}</span>
          )}
          {`${copy.common.saved} ${formatDate(item.addedAt, locale)}`}
        </>
      }
      actions={
        <>
          {item.activationPath ? (
            <Link
              href={item.activationPath}
              aria-label={`${copy.wishlist.start}: ${name}`}
              className={iconButtonVariants({ variant: "primary" })}
            >
              <Sprout aria-hidden="true" className="size-5" />
            </Link>
          ) : null}
          {item.publicPath ? (
            <Link
              href={item.publicPath}
              aria-label={`${copy.common.open}: ${name}`}
              className={iconButtonVariants({ variant: "secondary" })}
            >
              <ExternalLink aria-hidden="true" className="size-5" />
            </Link>
          ) : null}
          <WishlistForm
            action={removeWishlistItemAction}
            catalogItemId={item.catalogItemId}
            locale={locale}
            returnTo={returnTo}
          >
            <ShelfRemoveButton
              label={fillSocialTemplate(copy.wishlist.removeLabel, { name })}
            />
          </WishlistForm>
          {failed ? (
            <div className="basis-full">
              <Callout
                tone="danger"
                live="assertive"
                data-shelf-outcome="failed"
                className="py-2"
              >
                <p>{copy.wishlist.failed[failed]}</p>
              </Callout>
            </div>
          ) : null}
        </>
      }
    />
  );
}

function WishlistForm({
  action,
  catalogItemId,
  locale,
  returnTo,
  children,
}: {
  action: typeof removeWishlistItemAction;
  catalogItemId: string;
  locale: PublicLocale;
  returnTo: string;
  children: React.ReactNode;
}) {
  return (
    <OwnerScopedProgressiveForm action={action}>
      <HiddenField name="catalogItemId" value={catalogItemId} />
      <HiddenField name="locale" value={locale} />
      <HiddenField name="returnTo" value={returnTo} />
      {children}
    </OwnerScopedProgressiveForm>
  );
}

function noticeTitle(copy: SocialSurfaceCopy, notice: WishlistOutcomeNotice) {
  if (!notice.name) {
    return notice.outcome === "restored"
      ? copy.wishlist.restoredNoticeUnnamed
      : copy.wishlist.removedNoticeUnnamed;
  }
  return fillSocialTemplate(
    notice.outcome === "restored"
      ? copy.wishlist.restoredNotice
      : copy.wishlist.removedNotice,
    { name: notice.name },
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
    timeZone: "UTC",
  });
}
