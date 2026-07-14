import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bug,
  Hexagon,
  ImageOff,
  PawPrint,
  Sprout,
} from "lucide-react";

import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  publicObjectCatalogIdentityDescription,
  type PublicObjectCatalogCopy,
} from "@/lib/public-object-catalog-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type {
  PublicObjectCatalogCard,
  PublicObjectCatalogIdentityFilter,
  PublicObjectCatalogKind,
  PublicObjectCatalogPage,
  PublicObjectCatalogRequest,
} from "@/server/public-object-catalog-repository";
import { PublicObjectCatalogSearch } from "./public-object-catalog-search";

export type PublicObjectCatalogState = "ready" | "empty" | "loading" | "error";

export function PublicObjectCatalog({
  locale,
  copy,
  page,
  state,
}: {
  locale: PublicLocale;
  copy: PublicObjectCatalogCopy;
  page: PublicObjectCatalogPage;
  state: PublicObjectCatalogState;
}) {
  const contextModules = buildPublicObjectCatalogContextModules(
    locale,
    copy,
    page,
  );

  return (
    <main
      lang={locale}
      data-public-object-catalog="true"
      data-public-object-catalog-state={state}
      className="mx-auto flex w-full max-w-5xl flex-col px-4 py-4 sm:px-6 sm:py-5"
    >
      <SiteShellContextRailRegistration modules={contextModules} />

      <header className="grid gap-2 border-b border-border pb-4">
        <h1 className="text-3xl font-semibold text-foreground">
          {copy.heading}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.intro}
        </p>
      </header>

      <section className="grid gap-3 border-b border-border py-4">
        <PublicObjectCatalogSearch
          locale={locale}
          copy={copy}
          query={page.request.query}
          kind={page.request.kind}
          identity={page.request.identity}
        />
        <CatalogKindNavigation
          locale={locale}
          copy={copy}
          request={page.request}
        />
        <CatalogIdentityNavigation
          locale={locale}
          copy={copy}
          request={page.request}
        />
      </section>

      <section className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-border py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.resultsTitle}
          </h2>
          {state === "ready" ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {page.totalCount}
            </p>
          ) : null}
        </div>
        {hasActiveFilters(page.request) ? (
          <Link
            href={localizedPath(locale, "/objects")}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {copy.resetFilters}
          </Link>
        ) : null}
      </section>

      {state === "loading" ? <CatalogLoading copy={copy} /> : null}
      {state === "error" ? (
        <CatalogError locale={locale} copy={copy} request={page.request} />
      ) : null}
      {state === "empty" ? <CatalogEmpty locale={locale} copy={copy} /> : null}
      {state === "ready" ? (
        <>
          <ol className="grid gap-4 py-5 sm:grid-cols-2">
            {page.cards.map((card) => (
              <li key={card.key} className="min-w-0">
                <PublicObjectCatalogCardView
                  locale={locale}
                  copy={copy}
                  card={card}
                />
              </li>
            ))}
          </ol>
          <CatalogPagination locale={locale} copy={copy} page={page} />
        </>
      ) : null}

      <div className="mt-6 border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

function CatalogKindNavigation({
  locale,
  copy,
  request,
}: {
  locale: PublicLocale;
  copy: PublicObjectCatalogCopy;
  request: PublicObjectCatalogRequest;
}) {
  const kinds: PublicObjectCatalogKind[] = [
    "all",
    "plant",
    "animal",
    "bee_colony",
  ];

  return (
    <nav
      aria-label={copy.kindFilterLabel}
      className="feed-filter-scroll flex max-w-full overflow-x-auto rounded-lg border border-border bg-muted/40 p-1"
    >
      {kinds.map((kind) => {
        const active = request.kind === kind;
        return (
          <Link
            key={kind}
            href={buildPublicObjectCatalogHref(locale, {
              kind,
              identity: "all",
              query: request.query,
              page: 1,
            })}
            aria-current={active ? "page" : undefined}
            className={buttonVariants({
              variant: active ? "default" : "ghost",
              size: "sm",
              className: "shrink-0",
            })}
          >
            {kind === "plant" ? <Sprout aria-hidden="true" /> : null}
            {kind === "animal" ? <PawPrint aria-hidden="true" /> : null}
            {kind === "bee_colony" ? <Hexagon aria-hidden="true" /> : null}
            {copy.kinds[kind]}
          </Link>
        );
      })}
    </nav>
  );
}

function CatalogIdentityNavigation({
  locale,
  copy,
  request,
}: {
  locale: PublicLocale;
  copy: PublicObjectCatalogCopy;
  request: PublicObjectCatalogRequest;
}) {
  const identities = identityFiltersForKind(request.kind);

  return (
    <nav
      aria-label={copy.identityFilterLabel}
      className="feed-filter-scroll flex max-w-full gap-2 overflow-x-auto py-0.5"
    >
      {identities.map((identity) => {
        const active = request.identity === identity;
        const label =
          identity === "breed" && request.kind === "bee_colony"
            ? copy.identities.bee_breed
            : copy.identities[identity];
        return (
          <Link
            key={identity}
            href={buildPublicObjectCatalogHref(locale, {
              ...request,
              identity,
              page: 1,
            })}
            aria-current={active ? "page" : undefined}
            className={buttonVariants({
              variant: active ? "secondary" : "outline",
              size: "sm",
              className: "shrink-0",
            })}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function PublicObjectCatalogCardView({
  locale,
  copy,
  card,
}: {
  locale: PublicLocale;
  copy: PublicObjectCatalogCopy;
  card: PublicObjectCatalogCard;
}) {
  const title = card.identityName ?? copy.identityBadges[card.identityState];
  const titleContent = card.catalogPath ? (
    <Link href={card.catalogPath} className="hover:text-primary">
      {title}
    </Link>
  ) : (
    title
  );

  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="relative aspect-4/3 w-full overflow-hidden border-b border-border bg-muted">
        {card.mediaPublicUrl ? (
          <Image
            src={card.mediaPublicUrl}
            alt={`${card.representativeObject.displayName}: ${title}`}
            fill
            sizes="(max-width: 639px) 100vw, 50vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-foreground">
            <ImageOff aria-hidden="true" />
            {copy.noImage}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-0.5">
              {copy.identityBadges[card.identityState]}
            </span>
            <span>{copy.kinds[card.objectKind]}</span>
          </div>
          <h3 className="text-lg font-semibold break-words text-foreground">
            {titleContent}
          </h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {publicObjectCatalogIdentityDescription(
              locale,
              card.objectKind,
              card.identityState,
            )}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1">
            <dt className="sr-only">Objects</dt>
            <dd>{formatCatalogCount(locale, "object", card.objectCount)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only">Journals</dt>
            <dd>{formatCatalogCount(locale, "journal", card.journalCount)}</dd>
          </div>
        </dl>

        <div className="grid gap-1 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {copy.latestJournal}
          </p>
          <Link
            href={card.latestJournal.path}
            className="text-sm font-medium break-words text-foreground hover:text-primary"
          >
            {card.latestJournal.title}
          </Link>
          <time
            dateTime={toIsoDate(card.latestJournal.entryDate)}
            className="text-xs text-muted-foreground"
          >
            {formatCatalogDate(card.latestJournal.entryDate, locale)}
          </time>
        </div>

        <footer className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
          <Link
            href={card.representativeObject.path}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.openPassport}
          </Link>
          <Link
            href={card.latestJournal.path}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <BookOpen aria-hidden="true" />
            {copy.openJournal}
          </Link>
        </footer>
      </div>
    </article>
  );
}

function CatalogPagination({
  locale,
  copy,
  page,
}: {
  locale: PublicLocale;
  copy: PublicObjectCatalogCopy;
  page: PublicObjectCatalogPage;
}) {
  return (
    <nav
      aria-label={copy.pageLabel}
      className="flex min-h-14 items-center justify-between gap-3 border-t border-border py-4"
    >
      {page.hasPreviousPage ? (
        <Link
          href={buildPublicObjectCatalogHref(locale, {
            ...page.request,
            page: page.request.page - 1,
          })}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.previousPage}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        {copy.pageLabel} {page.request.page} / {page.totalPages}
      </span>
      {page.hasNextPage ? (
        <Link
          href={buildPublicObjectCatalogHref(locale, {
            ...page.request,
            page: page.request.page + 1,
          })}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {copy.nextPage}
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function CatalogEmpty({
  locale,
  copy,
}: {
  locale: PublicLocale;
  copy: PublicObjectCatalogCopy;
}) {
  return (
    <section className="flex flex-col items-start gap-3 py-10">
      <Sprout aria-hidden="true" />
      <h2 className="text-xl font-semibold">{copy.emptyTitle}</h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {copy.emptyBody}
      </p>
      <Link
        href={localizedPath(locale, "/objects")}
        className={buttonVariants({ variant: "outline" })}
      >
        {copy.resetFilters}
      </Link>
    </section>
  );
}

function CatalogError({
  locale,
  copy,
  request,
}: {
  locale: PublicLocale;
  copy: PublicObjectCatalogCopy;
  request: PublicObjectCatalogRequest;
}) {
  return (
    <section role="alert" className="flex flex-col items-start gap-3 py-10">
      <Bug aria-hidden="true" />
      <h2 className="text-xl font-semibold">{copy.errorTitle}</h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {copy.errorBody}
      </p>
      <Link
        href={buildPublicObjectCatalogHref(locale, request)}
        className={buttonVariants({ variant: "outline" })}
      >
        {copy.retry}
      </Link>
    </section>
  );
}

function CatalogLoading({ copy }: { copy: PublicObjectCatalogCopy }) {
  return (
    <div
      role="status"
      aria-label={copy.loadingLabel}
      aria-busy="true"
      className="grid gap-4 py-5 sm:grid-cols-2"
    >
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="grid gap-3 rounded-lg border border-border p-4"
        >
          <Skeleton className="aspect-4/3 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-14 w-full" />
        </div>
      ))}
    </div>
  );
}

export function buildPublicObjectCatalogHref(
  locale: PublicLocale,
  request: PublicObjectCatalogRequest,
) {
  const params = new URLSearchParams();
  if (request.kind !== "all") params.set("kind", request.kind);
  if (request.identity !== "all") params.set("identity", request.identity);
  if (request.query) params.set("q", request.query);
  if (request.page > 1) params.set("page", String(request.page));

  const path = localizedPath(locale, "/objects");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function buildPublicObjectCatalogContextModules(
  locale: PublicLocale,
  copy: PublicObjectCatalogCopy,
  page: PublicObjectCatalogPage,
): SiteShellContextRailModule[] {
  const kinds = ["plant", "animal", "bee_colony"] as const;
  return [
    {
      key: "object-kinds",
      title: copy.contextKindsTitle,
      items: kinds.map((kind) => ({
        href: buildPublicObjectCatalogHref(locale, {
          kind,
          identity: "all",
          query: "",
          page: 1,
        }),
        label: copy.kinds[kind],
      })),
    },
    {
      key: "object-evidence",
      title: copy.contextEvidenceTitle,
      emptyLabel: copy.emptyTitle,
      items: page.cards.slice(0, 5).map((card) => ({
        href: card.representativeObject.path,
        label: card.representativeObject.displayName,
        meta: String(card.journalCount),
      })),
    },
  ];
}

function identityFiltersForKind(
  kind: PublicObjectCatalogKind,
): PublicObjectCatalogIdentityFilter[] {
  const shared: PublicObjectCatalogIdentityFilter[] = [
    "all",
    "species",
    "provisional",
    "unknown",
    "unavailable",
  ];
  if (kind === "plant") return ["all", "plant_variety", ...shared.slice(1)];
  if (kind === "animal" || kind === "bee_colony") {
    return ["all", "species", "breed", "provisional", "unknown", "unavailable"];
  }
  return [
    "all",
    "plant_variety",
    "species",
    "breed",
    "provisional",
    "unknown",
    "unavailable",
  ];
}

function hasActiveFilters(request: PublicObjectCatalogRequest) {
  return (
    request.kind !== "all" ||
    request.identity !== "all" ||
    request.query.length > 0 ||
    request.page > 1
  );
}

function formatCatalogCount(
  locale: PublicLocale,
  kind: "object" | "journal",
  count: number,
) {
  const forms = {
    uk: {
      object: {
        one: "об'єкт",
        few: "об'єкти",
        many: "об'єктів",
        other: "об'єкта",
      },
      journal: {
        one: "запис",
        few: "записи",
        many: "записів",
        other: "запису",
      },
    },
    bg: {
      object: { one: "обект", other: "обекта" },
      journal: { one: "запис", other: "записа" },
    },
    ru: {
      object: {
        one: "объект",
        few: "объекта",
        many: "объектов",
        other: "объекта",
      },
      journal: {
        one: "запись",
        few: "записи",
        many: "записей",
        other: "записи",
      },
    },
  } as const;
  const category = new Intl.PluralRules(locale).select(count);
  const selected = forms[locale][kind] as Record<string, string>;
  return `${count} ${selected[category] ?? selected.other}`;
}

function formatCatalogDate(value: Date | string, locale: PublicLocale) {
  return new Intl.DateTimeFormat(
    { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale],
    { day: "numeric", month: "short", year: "numeric" },
  ).format(new Date(value));
}

function toIsoDate(value: Date | string) {
  return (value instanceof Date ? value : new Date(value))
    .toISOString()
    .slice(0, 10);
}
