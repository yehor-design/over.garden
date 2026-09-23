import { BookOpenIcon as BookOpen } from "@/components/icons/BookOpen";
import { QuestionIcon as HelpCircle } from "@/components/icons/Question";
import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";
import { TagIcon as Tags } from "@/components/icons/Tag";

import { CatalogFrontDoor } from "@/components/public/catalog-front-door";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { getFilterBarChromeCopy } from "@/lib/filter-bar-copy";
import { FilterBar } from "@/components/ui/filter-bar";
import { Link } from "@/components/ui/link";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildPublicKnowledgeHref,
  type PublicKnowledgeRequest,
} from "@/lib/public-knowledge-content";
import {
  formatPublicKnowledgeEvidenceCount,
  type PublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type { PlantObjectKind } from "@/db/schema";
import type { PublicKnowledgeSubject } from "@/server/public-seo-content";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { Field } from "@/components/ui/field";
import { SearchInput } from "@/components/ui/search-input";

export type PublicKnowledgeHubState = "ready" | "empty" | "loading" | "error";

/**
 * One row of the hub (`OVE-498`): an answer or a guide says what it is about
 * and, for advice, how many sources it cites; a topic says how many
 * gardeners' entries it holds and how recent the last one is. Nothing says
 * whether a search engine may index it (OG-UX-032).
 */
export type PublicKnowledgeHubItem =
  | {
      kind: "guide" | "answer";
      path: string;
      title: string;
      description: string;
      objectKinds: readonly PlantObjectKind[];
      subject: PublicKnowledgeSubject;
      sourceCount: number;
      updatedDate: string;
      /** Everything a reader can find it by: its own words. */
      searchText: string;
    }
  | {
      kind: "topic";
      path: string;
      title: string;
      description: string;
      objectKinds: readonly PlantObjectKind[];
      entryCount: number;
      latestPublishedAt: Date | string | null;
    };

export function PublicKnowledgeHub({
  locale,
  copy,
  request,
  items,
  state,
  topicsUnavailable = false,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  request: PublicKnowledgeRequest;
  items: readonly PublicKnowledgeHubItem[];
  state: PublicKnowledgeHubState;
  /**
   * The topics could not be read, and the answers and guides — which are in
   * the code — still can: the hub shows what it has and says what it lacks,
   * rather than an error in place of everything.
   */
  topicsUnavailable?: boolean;
  jsonLd?: Record<string, unknown> | null;
}) {
  const chrome = getFilterBarChromeCopy(locale);

  return (
    <main
      lang={locale}
      data-public-knowledge-hub="true"
      data-public-knowledge-state={state}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializePublicSurfaceJsonLd(jsonLd ?? null) ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializePublicSurfaceJsonLd(jsonLd ?? null) ?? "",
          }}
        />
      ) : null}
      <PageHeader title={copy.heading} description={copy.intro} />

      {/* The same bar `/journals` and `/catalog` use, so a reader who has
          filtered one has filtered all three: search, one mode, a draft
          filter panel and chips above the results (DESIGN.md §5.1). */}
      <FilterBar
        /* A query view may be a `/q` twin (ADR-0032): let Proxy decide, for
           the controls and for the chips (`public-query-twin.ts`). */
        documentNavigation
        documentLinks
        action={buildPublicKnowledgeHref(locale, {
          query: "",
          type: "all",
          kind: "all",
        })}
        search={
          <div className="flex items-end gap-2">
            <Field
              label={copy.searchLabel}
              id="knowledge-hub-search"
              className="min-w-0 flex-1"
            >
              <SearchInput
                name="q"
                defaultValue={request.query}
                maxLength={112}
                placeholder={copy.searchPlaceholder}
              />
            </Field>
            <Button type="submit" className="shrink-0">
              <Search aria-hidden="true" />
              {copy.applyFilters}
            </Button>
          </div>
        }
        facets={[
          {
            key: "type",
            label: copy.typeLabel,
            value: request.type === "all" ? [] : [request.type],
            anyLabel: copy.filters.types.all,
            options: Object.entries(copy.filters.types)
              .filter(([value]) => value !== "all")
              .map(([value, label]) => ({ value, label })),
          },
        ]}
        /* Plants or animals is the hub's one primary split: a mode, in one
           place (OVE-482). */
        modes={(["all", "plant", "animal"] as const).map((kind) => ({
          label: copy.filters.kinds[kind],
          href: buildPublicKnowledgeHref(locale, { ...request, kind }),
          current: request.kind === kind,
        }))}
        hidden={request.kind === "all" ? {} : { kind: request.kind }}
        carry={{ q: request.query }}
        clearFiltersHref={buildPublicKnowledgeHref(locale, {
          ...request,
          type: "all",
        })}
        chips={buildKnowledgeChips(locale, copy, request)}
        clearAllHref={buildPublicKnowledgeHref(locale, {
          query: "",
          type: "all",
          kind: "all",
        })}
        labels={{
          filters: copy.filtersLabel,
          openFilters: chrome.filtersWithCount(request.type === "all" ? 0 : 1),
          sheetDescription: chrome.panelDescription,
          apply: chrome.showResults,
          close: chrome.close,
          clear: chrome.clearFilters,
          clearAll: copy.resetFilters,
          activeFilters: copy.filtersLabel,
          sort: copy.typeLabel,
          modes: chrome.modes,
          pending: chrome.pending,
        }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
        <h2 className="text-h2 text-text-heading">{copy.resultsTitle}</h2>
        {/* Always rendered, so the node survives a filter change and the new
            number is announced into it rather than arriving with a fresh
            document that announces nothing. */}
        <p
          data-knowledge-result-count="true"
          aria-live="polite"
          className="text-body-sm text-text-muted tabular-nums"
        >
          {state === "ready" || state === "empty"
            ? formatCount(items.length, locale)
            : ""}
        </p>
      </div>

      {state === "loading" ? (
        <KnowledgeLoading label={copy.loadingLabel} />
      ) : null}
      {state === "error" ? (
        <KnowledgeError locale={locale} copy={copy} request={request} />
      ) : null}
      {state === "empty" ? (
        <KnowledgeEmpty locale={locale} copy={copy} />
      ) : null}
      {state === "ready" ? (
        <KnowledgeResults locale={locale} copy={copy} items={items} />
      ) : null}
      {topicsUnavailable && (state === "ready" || state === "empty") ? (
        <div
          data-knowledge-topics-unavailable="true"
          className="grid gap-2 border-y border-border py-4"
        >
          <p className="font-semibold text-text">
            {copy.topicsUnavailableTitle}
          </p>
          <p className="max-w-prose text-body-sm text-text-muted">
            {copy.errorBody}
          </p>
          {/* The same view again, as a document (`public-query-twin.ts`). */}
          <a
            href={buildPublicKnowledgeHref(locale, request)}
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: "w-fit",
            })}
          >
            {copy.retry}
          </a>
        </div>
      ) : null}

      <section className="border-t border-border pt-6">
        <CatalogFrontDoor locale={locale} />
      </section>
    </main>
  );
}

function KnowledgeResults({
  locale,
  copy,
  items,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  items: readonly PublicKnowledgeHubItem[];
}) {
  return (
    <div className="grid gap-7">
      {/* Answers first: a gardener's question is why most readers are here.
          Then the topics gardeners write under, then help with OverGarden. */}
      {(["answer", "topic", "guide"] as const).map((kind) => {
        const sectionItems = items.filter((item) => item.kind === kind);
        if (sectionItems.length === 0) return null;

        return (
          <Section
            key={kind}
            id={`knowledge-${kind}`}
            level={3}
            title={sectionTitle(copy, kind)}
            headingClassName="text-h3"
          >
            {/* A list of things is a list (DESIGN.md §4.1). Each row is the
                title, the sentence under it, and the facts a reader chooses
                on — what it is about and what it rests on, or how many
                gardeners wrote under it and when last. */}
            <ul className="grid list-none">
              {sectionItems.map((item) => (
                <ListRow
                  key={`${item.kind}:${item.path}`}
                  data-trust-state={
                    item.kind === "topic" ? "user-evidence" : "editorial"
                  }
                  data-knowledge-subject={
                    item.kind === "topic" ? undefined : item.subject
                  }
                  href={localizedPath(locale, item.path)}
                  title={item.title}
                  description={item.description || undefined}
                  meta={
                    <KnowledgeRowMeta locale={locale} copy={copy} item={item} />
                  }
                />
              ))}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}

function KnowledgeRowMeta({
  locale,
  copy,
  item,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  item: PublicKnowledgeHubItem;
}) {
  if (item.kind === "topic") {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone="neutral">
          <Tags aria-hidden="true" />
          {copy.journalEvidenceLabel}
        </Badge>
        <span>
          {formatPublicKnowledgeEvidenceCount(item.entryCount, locale, copy)}
        </span>
        {item.latestPublishedAt ? (
          <time dateTime={toIsoDate(item.latestPublishedAt)}>
            {copy.topicLatest(formatDate(item.latestPublishedAt, locale))}
          </time>
        ) : null}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={item.subject === "gardening" ? "info" : "neutral"}>
        {item.kind === "guide" ? (
          <BookOpen aria-hidden="true" />
        ) : (
          <HelpCircle aria-hidden="true" />
        )}
        {`${copy.subjects[item.subject]} · ${copy.formats[item.kind]}`}
      </Badge>
      {item.sourceCount > 0 ? (
        <span>{copy.sourcesCount(item.sourceCount)}</span>
      ) : null}
      <time dateTime={toIsoDate(item.updatedDate)}>
        {`${copy.updatedLabel}: ${formatDate(item.updatedDate, locale)}`}
      </time>
    </span>
  );
}

function KnowledgeLoading({ label }: { label: string }) {
  return (
    <ul aria-label={label} aria-busy="true" className="grid list-none gap-3">
      {[0, 1, 2].map((item) => (
        <li key={item} className="grid gap-2 border-b border-border py-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </li>
      ))}
    </ul>
  );
}

function KnowledgeError({
  locale,
  copy,
  request,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  request: PublicKnowledgeRequest;
}) {
  return (
    <ErrorState
      failureClass="unknown"
      digest="0000000"
      title={copy.errorTitle}
      description={copy.errorBody}
      reference={copy.errorTitle}
      retryHref={buildPublicKnowledgeHref(locale, request)}
      retryLabel={copy.retry}
    />
  );
}

function KnowledgeEmpty({
  locale,
  copy,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
}) {
  return (
    // Something does exist and the filters excluded it, so this state carries
    // no illustration — what the reader needs is the way back out
    // (DESIGN.md §5.4).
    <EmptyState
      variant="no-results"
      illustration={null}
      title={copy.emptyTitle}
      description={copy.emptyBody}
      action={
        <Link
          href={buildPublicKnowledgeHref(locale, {
            query: "",
            type: "all",
            kind: "all",
          })}
        >
          {copy.resetFilters}
        </Link>
      }
    />
  );
}

/** The filters a reader has set, each removable on its own. */
function buildKnowledgeChips(
  locale: PublicLocale,
  copy: PublicKnowledgeCopy,
  request: PublicKnowledgeRequest,
) {
  const chips: {
    key: string;
    label: string;
    removeHref: string;
    removeLabel: string;
  }[] = [];
  if (request.query) {
    chips.push({
      key: "q",
      label: request.query,
      removeHref: buildPublicKnowledgeHref(locale, { ...request, query: "" }),
      removeLabel: `${copy.resetFilters}: ${request.query}`,
    });
  }
  if (request.type !== "all") {
    const label = copy.filters.types[request.type];
    chips.push({
      key: `type:${request.type}`,
      label,
      removeHref: buildPublicKnowledgeHref(locale, { ...request, type: "all" }),
      removeLabel: `${copy.resetFilters}: ${label}`,
    });
  }
  if (request.kind !== "all") {
    const label = copy.filters.kinds[request.kind];
    chips.push({
      key: `kind:${request.kind}`,
      label,
      removeHref: buildPublicKnowledgeHref(locale, { ...request, kind: "all" }),
      removeLabel: `${copy.resetFilters}: ${label}`,
    });
  }
  return chips;
}

function sectionTitle(
  copy: PublicKnowledgeCopy,
  kind: PublicKnowledgeHubItem["kind"],
) {
  return {
    guide: copy.guidesTitle,
    answer: copy.answersTitle,
    topic: copy.topicsTitle,
  }[kind];
}

function formatCount(value: number, locale: PublicLocale) {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function toIsoDate(value: Date | string) {
  return new Date(value).toISOString();
}

function localeTag(locale: PublicLocale) {
  return { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale];
}
