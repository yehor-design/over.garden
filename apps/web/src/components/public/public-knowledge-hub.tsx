import { BookOpen, HelpCircle, Search, Tags } from "lucide-react";

import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { CatalogFrontDoor } from "@/components/public/catalog-front-door";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
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
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { Field } from "@/components/ui/field";
import { SearchInput } from "@/components/ui/search-input";

export type PublicKnowledgeHubState = "ready" | "empty" | "loading" | "error";

export interface PublicKnowledgeHubItem {
  kind: "guide" | "answer" | "topic";
  path: string;
  title: string;
  description: string;
  objectKinds: readonly PlantObjectKind[];
  evidenceCount: number;
  updatedDate: Date | string | null;
  indexable: boolean;
}

export function PublicKnowledgeHub({
  locale,
  copy,
  request,
  items,
  contextItems,
  state,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  request: PublicKnowledgeRequest;
  items: readonly PublicKnowledgeHubItem[];
  contextItems: readonly PublicKnowledgeHubItem[];
  state: PublicKnowledgeHubState;
  jsonLd?: Record<string, unknown> | null;
}) {
  const contextModules = buildPublicKnowledgeContextModules(
    locale,
    copy,
    contextItems,
  );

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
      <SiteShellContextRailRegistration modules={contextModules} />

      <PageHeader title={copy.heading} description={copy.intro} />

      {/* The same bar `/journals` and `/catalog` use, so a reader who has
          filtered one has filtered all three: apply on change, one parameter
          per facet, chips above the results, a sheet below `lg`
          (DESIGN.md §5.1). */}
      <FilterBar
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
          {
            key: "kind",
            label: copy.kindLabel,
            value: request.kind === "all" ? [] : [request.kind],
            anyLabel: copy.filters.kinds.all,
            options: Object.entries(copy.filters.kinds)
              .filter(([value]) => value !== "all")
              .map(([value, label]) => ({ value, label })),
          },
        ]}
        chips={buildKnowledgeChips(locale, copy, request)}
        clearAllHref={buildPublicKnowledgeHref(locale, {
          query: "",
          type: "all",
          kind: "all",
        })}
        labels={{
          filters: copy.filtersLabel,
          openFilters: copy.filtersLabel,
          sheetDescription: copy.intro,
          apply: copy.applyFilters,
          clear: copy.resetFilters,
          clearAll: copy.resetFilters,
          activeFilters: copy.filtersLabel,
          sort: copy.typeLabel,
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

      <section className="border-t border-border pt-6">
        <CatalogFrontDoor locale={locale} />
      </section>

      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
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
      {(["guide", "answer", "topic"] as const).map((kind) => {
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
                on — what it is, how much first-hand evidence stands behind
                it, and when it was last touched. */}
            <ul className="grid list-none">
              {sectionItems.map((item) => (
                <ListRow
                  key={`${item.kind}:${item.path}`}
                  data-trust-state={
                    item.kind === "topic" ? "user-evidence" : "editorial"
                  }
                  href={itemHref(locale, item.path)}
                  title={item.title}
                  description={item.description}
                  meta={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={item.kind === "topic" ? "neutral" : "info"}
                      >
                        {item.kind === "guide" ? (
                          <BookOpen aria-hidden="true" />
                        ) : item.kind === "answer" ? (
                          <HelpCircle aria-hidden="true" />
                        ) : (
                          <Tags aria-hidden="true" />
                        )}
                        {item.kind === "topic"
                          ? copy.journalEvidenceLabel
                          : copy.editorialLabel}
                      </Badge>
                      <span>
                        {formatPublicKnowledgeEvidenceCount(
                          item.evidenceCount,
                          locale,
                          copy,
                        )}
                      </span>
                      {item.objectKinds.map((objectKind) => (
                        <span key={objectKind}>
                          {copy.filters.kinds[objectKind]}
                        </span>
                      ))}
                      {item.updatedDate ? (
                        <time dateTime={toIsoDate(item.updatedDate)}>
                          {copy.updatedLabel}:{" "}
                          {formatDate(item.updatedDate, locale)}
                        </time>
                      ) : null}
                      {item.kind === "topic" ? (
                        <span>
                          {item.indexable
                            ? copy.topicIndexable
                            : copy.topicNoindex}
                        </span>
                      ) : null}
                    </span>
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

function KnowledgeLoading({ label }: { label: string }) {
  return (
    <ul
      aria-label={label}
      aria-busy="true"
      className="grid list-none gap-3"
    >
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

export function buildPublicKnowledgeContextModules(
  locale: PublicLocale,
  copy: PublicKnowledgeCopy,
  items: readonly PublicKnowledgeHubItem[],
): SiteShellContextRailModule[] {
  return (["topic", "guide", "answer"] as const).map((kind) => ({
    key: `knowledge-${kind}`,
    title: sectionTitle(copy, kind),
    items: items
      .filter((item) => item.kind === kind)
      .slice(0, kind === "topic" ? 6 : 3)
      .map((item) => ({
        href: itemHref(locale, item.path),
        label: item.title,
        meta: formatCount(item.evidenceCount, locale),
      })),
    emptyLabel: copy.emptyEvidenceTitle,
  }));
}

function itemHref(locale: PublicLocale, path: string) {
  const localized = localizedPath(locale, path);
  return localized;
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
