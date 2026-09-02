import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CircleAlert,
  HelpCircle,
  Search,
  Tags,
} from "lucide-react";

import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
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
      className="mx-auto flex w-full max-w-5xl flex-col px-4 py-4 sm:px-6 sm:py-5"
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

      <header className="grid gap-2 border-b border-border pb-4">
        <h1 className="text-3xl font-semibold text-foreground">
          {copy.heading}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy.intro}
        </p>
      </header>

      <form
        method="get"
        action={buildPublicKnowledgeHref(locale, {
          query: "",
          type: "all",
          kind: "all",
        })}
        aria-label={copy.filtersLabel}
        className="grid gap-4 border-b border-border py-4"
      >
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          <span>{copy.searchLabel}</span>
          <span className="flex min-w-0 gap-2">
            <input
              type="search"
              name="q"
              defaultValue={request.query}
              maxLength={112}
              placeholder={copy.searchPlaceholder}
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="submit" className={buttonVariants()}>
              <Search aria-hidden="true" />
              {copy.applyFilters}
            </button>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <KnowledgeSelect
            label={copy.typeLabel}
            name="type"
            value={request.type}
            options={Object.entries(copy.filters.types)}
          />
          <KnowledgeSelect
            label={copy.kindLabel}
            name="kind"
            value={request.kind}
            options={Object.entries(copy.filters.kinds)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={buildPublicKnowledgeHref(locale, {
              query: "",
              type: "all",
              kind: "all",
            })}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {copy.resetFilters}
          </Link>
          {state === "ready" || state === "empty" ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {copy.resultsTitle}: {formatCount(items.length, locale)}
            </span>
          ) : null}
        </div>
      </form>

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

      <div className="mt-6 border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

function KnowledgeSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: "type" | "kind";
  value: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={`${name}:${optionValue}`} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
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
    <div className="grid gap-7 py-5">
      {(["guide", "answer", "topic"] as const).map((kind) => {
        const sectionItems = items.filter((item) => item.kind === kind);
        if (sectionItems.length === 0) return null;

        return (
          <section key={kind} className="grid gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              {sectionTitle(copy, kind)}
            </h2>
            <ol className="grid border-x border-b border-border">
              {sectionItems.map((item) => (
                <li
                  key={`${item.kind}:${item.path}`}
                  className="grid min-w-0 gap-3 border-t border-border p-4"
                  data-trust-state={
                    item.kind === "topic" ? "user-evidence" : "editorial"
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-semibold uppercase">
                      {item.kind === "guide" ? (
                        <BookOpen className="size-4" aria-hidden="true" />
                      ) : item.kind === "answer" ? (
                        <HelpCircle className="size-4" aria-hidden="true" />
                      ) : (
                        <Tags className="size-4" aria-hidden="true" />
                      )}
                      {item.kind === "topic"
                        ? copy.journalEvidenceLabel
                        : copy.editorialLabel}
                    </span>
                    <span className="tabular-nums">
                      {formatPublicKnowledgeEvidenceCount(
                        item.evidenceCount,
                        locale,
                        copy,
                      )}
                    </span>
                  </div>

                  <div className="grid gap-1.5">
                    <Link
                      href={itemHref(locale, item.path)}
                      className="text-xl leading-7 font-semibold text-foreground hover:text-primary"
                    >
                      {item.title}
                    </Link>
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                    </div>
                    <Link
                      href={itemHref(locale, item.path)}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      {itemCta(copy, item.kind)}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function KnowledgeLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid gap-px bg-border py-5"
    >
      {[0, 1, 2].map((item) => (
        <div key={item} className="grid gap-3 bg-background p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
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
    <section className="grid gap-3 border-b border-border py-8">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <CircleAlert className="size-5" aria-hidden="true" />
        {copy.errorTitle}
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {copy.errorBody}
      </p>
      <Link
        href={buildPublicKnowledgeHref(locale, request)}
        className={buttonVariants({ variant: "outline", className: "w-fit" })}
      >
        {copy.retry}
      </Link>
    </section>
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
    <section className="grid gap-3 border-b border-border py-8">
      <h2 className="text-xl font-semibold text-foreground">
        {copy.emptyTitle}
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {copy.emptyBody}
      </p>
      <Link
        href={buildPublicKnowledgeHref(locale, {
          query: "",
          type: "all",
          kind: "all",
        })}
        className={buttonVariants({ variant: "outline", className: "w-fit" })}
      >
        {copy.resetFilters}
      </Link>
    </section>
  );
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

function itemCta(
  copy: PublicKnowledgeCopy,
  kind: PublicKnowledgeHubItem["kind"],
) {
  return {
    guide: copy.readGuide,
    answer: copy.readAnswer,
    topic: copy.exploreTopic,
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
