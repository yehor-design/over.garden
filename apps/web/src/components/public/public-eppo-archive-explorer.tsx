import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";
import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { DocumentLink, Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import {
  getEppoArchiveCopy,
  type EppoArchiveCopy,
} from "@/lib/catalog-source/eppo-archive-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import type {
  EppoArchivePage,
  PublicEppoSourceRecord,
} from "@/server/catalog-source/public-eppo-explorer-repository";

export type EppoArchiveExplorerState =
  | "loading"
  | "ready"
  | "empty"
  | "degraded"
  | "not_found";

export type EppoArchiveExplorerMessage = "invalid_query" | "unavailable";

/**
 * The EPPO archive (`OVE-499`): EPPO's own records as OverGarden received
 * them, for reference.
 *
 * It is laid out like every other public page — the shell's column, one page
 * header, one `<main>` without an id of its own (the shell's `#main-content`
 * is the skip link's target, and a second one made it ambiguous). It says it
 * is a source and not the catalogue, and sends a gardener to the catalogue.
 * Every record keeps its source's credit, its licence and the date it was
 * received: the licence requires the first two, and the date is what makes a
 * received record a record rather than a claim about now.
 *
 * A search, a page after the first and a retry are query views of the
 * archive (`public-query-twin.ts`), so the links into them are plain links
 * the browser follows.
 */
export function EppoArchiveExplorer({
  locale,
  page,
  state,
  message,
  jsonLd,
}: {
  locale: PublicLocale;
  page: EppoArchivePage;
  state: EppoArchiveExplorerState;
  message?: EppoArchiveExplorerMessage;
  jsonLd?: Record<string, unknown> | null;
}) {
  const copy = getEppoArchiveCopy(locale);
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const archivePath = localizedPath(locale, "/sources/eppo");
  const filtered = Boolean(page.request.query) || page.request.kind !== "all";

  return (
    <main
      lang={locale}
      data-eppo-archive="explorer"
      data-eppo-archive-state={state}
      aria-busy={state === "loading"}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}

      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.intro}
      />
      <p
        className="text-body-sm text-text-muted"
        data-eppo-catalogue-hint="true"
      >
        {`${copy.catalogueHint} `}
        <Link href={localizedPath(locale, "/catalog")}>
          {copy.catalogueLink}
        </Link>
      </p>

      <ExplorerSearch locale={locale} copy={copy} page={page} />

      <section
        aria-labelledby="eppo-archive-results"
        data-eppo-archive-results="true"
        className="grid gap-3 border-t border-border pt-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="eppo-archive-results" className="text-h2 text-text-heading">
            {copy.resultsTitle}
          </h2>
          {/* Always rendered, so a changed result is announced into it. */}
          <p
            aria-live="polite"
            data-eppo-archive-count="true"
            className="text-body-sm text-text-muted tabular-nums"
          >
            {state === "ready" ? copy.resultsCount(page.records.length) : ""}
          </p>
        </div>

        {state === "degraded" ? (
          <div
            data-eppo-archive-message={message ?? "unavailable"}
            className="grid gap-3 border-y border-border py-5"
          >
            <p className="max-w-prose text-body-sm text-text">
              {message === "invalid_query"
                ? copy.invalidQuery
                : copy.unavailable}
            </p>
            <a
              href={
                message === "invalid_query"
                  ? archivePath
                  : explorerHref(locale, page.request)
              }
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
                className: "w-fit",
              })}
            >
              {message === "invalid_query" ? copy.showAll : copy.retry}
            </a>
          </div>
        ) : null}

        {state === "empty" ? (
          <div
            className="grid gap-3 border-y border-border py-5"
            data-eppo-archive-empty={filtered ? "no-results" : "archive"}
          >
            <p className="max-w-prose text-body-sm text-text">
              {page.request.query
                ? copy.noResults(page.request.query)
                : copy.empty}
            </p>
            {filtered ? (
              <DocumentLink href={archivePath} className="w-fit text-body-sm">
                {copy.showAll}
              </DocumentLink>
            ) : null}
          </div>
        ) : null}

        {state === "ready" ? (
          <>
            {filtered ? (
              <DocumentLink href={archivePath} className="w-fit text-body-sm">
                {copy.showAll}
              </DocumentLink>
            ) : null}
            <ol className="grid list-none">
              {page.records.map((record) => (
                <li
                  key={record.eppoCode}
                  className="border-b border-border py-4 last:border-b-0"
                >
                  <ExplorerRecord locale={locale} copy={copy} record={record} />
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>

      {state === "ready" && page.nextCursor ? (
        <nav
          aria-label={copy.next}
          className="flex justify-end border-t border-border pt-4"
        >
          <a
            href={explorerHref(locale, {
              ...page.request,
              cursor: page.nextCursor,
            })}
            data-eppo-archive-next="true"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {copy.next}
          </a>
        </nav>
      ) : null}
    </main>
  );
}

export function EppoArchiveDetail({
  locale,
  record,
  jsonLd,
  canonicalCard,
}: {
  locale: PublicLocale;
  record: PublicEppoSourceRecord;
  jsonLd?: Record<string, unknown> | null;
  /** OVE-394: present once the reconciliation linked this code to a node. */
  canonicalCard?: { canonicalName: string; publicPath: string } | null;
}) {
  const copy = getEppoArchiveCopy(locale);
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);

  return (
    <main
      lang={locale}
      data-eppo-archive="detail"
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <PageHeader
        breadcrumb={
          <Link
            href={localizedPath(locale, "/sources/eppo")}
            variant="muted"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-body-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.browseArchive}
          </Link>
        }
        eyebrow={copy.detailTitle}
        title={
          <span {...latinWhenScientific(record)}>{record.displayName}</span>
        }
        description={copy.evidenceDescription[record.evidenceState]}
      />
      {canonicalCard ? (
        <p>
          <Link
            data-eppo-canonical-card
            href={canonicalCard.publicPath}
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: "w-fit",
            })}
          >
            {`${copy.canonicalCard}: ${canonicalCard.canonicalName}`}
          </Link>
        </p>
      ) : null}
      <RecordFacts locale={locale} copy={copy} record={record} />
      <SourceCredit copy={copy} source={record.source} />
    </main>
  );
}

export function EppoArchiveNotFound({ locale }: { locale: PublicLocale }) {
  const copy = getEppoArchiveCopy(locale);

  return (
    <main
      lang={locale}
      data-eppo-archive="explorer"
      data-eppo-archive-state="not_found"
      className="flex w-full min-w-0 flex-col gap-5 px-4 py-8 sm:px-6 md:py-12"
    >
      <PageHeader
        eyebrow={copy.title}
        title={copy.notFound}
        description={copy.intro}
      />
      <div className="flex flex-wrap gap-3">
        {/* The same address again: a record that was being received may be
            there now. */}
        <form>
          <Button type="submit" variant="secondary" size="sm">
            {copy.retry}
          </Button>
        </form>
        <Link
          href={localizedPath(locale, "/sources/eppo")}
          className={buttonVariants({ size: "sm" })}
        >
          {copy.browseArchive}
        </Link>
      </div>
    </main>
  );
}

function ExplorerSearch({
  locale,
  copy,
  page,
}: {
  locale: PublicLocale;
  copy: EppoArchiveCopy;
  page: EppoArchivePage;
}) {
  // A real GET form into the archive's own query view: it works before any
  // script, and the search is in the address, so Back returns to it.
  return (
    <form
      action={localizedPath(locale, "/sources/eppo")}
      method="get"
      role="search"
      aria-label={copy.searchLabel}
      data-eppo-archive-search="true"
      className="flex flex-wrap items-end gap-2"
    >
      <Field
        label={copy.searchLabel}
        id="eppo-archive-search"
        className="min-w-0 flex-1 basis-full sm:basis-64"
      >
        <SearchInput
          name="q"
          defaultValue={page.request.query}
          minLength={2}
          maxLength={120}
          placeholder={copy.searchPlaceholder}
        />
      </Field>
      <Field
        label={copy.kindLabel}
        id="eppo-archive-kind"
        className="w-full sm:w-52"
      >
        <Select name="kind" defaultValue={page.request.kind}>
          <option value="all">{copy.kinds.all}</option>
          <option value="plant">{copy.kinds.plant}</option>
          <option value="animal">{copy.kinds.animal}</option>
        </Select>
      </Field>
      <Button type="submit" className="shrink-0">
        <Search aria-hidden="true" />
        {copy.searchButton}
      </Button>
    </form>
  );
}

/** One record in the list: what it is, and the source it comes from. */
function ExplorerRecord({
  locale,
  copy,
  record,
}: {
  locale: PublicLocale;
  copy: EppoArchiveCopy;
  record: PublicEppoSourceRecord;
}) {
  return (
    <article className="grid gap-2" data-eppo-record={record.eppoCode}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
        <Badge tone="neutral">{copy.badges[record.evidenceState]}</Badge>
        <span>{copy.kinds[record.objectKind]}</span>
        <span>
          {`${copy.code}: `}
          <code>{record.eppoCode}</code>
        </span>
      </p>
      <h3 className="text-h3 break-words text-text-heading">
        <Link
          href={record.href}
          variant="quiet"
          {...latinWhenScientific(record)}
        >
          {record.displayName}
        </Link>
      </h3>
      <RecordFacts locale={locale} copy={copy} record={record} compact />
      <SourceCredit copy={copy} source={record.source} />
    </article>
  );
}

function RecordFacts({
  locale,
  copy,
  record,
  compact = false,
}: {
  locale: PublicLocale;
  copy: EppoArchiveCopy;
  record: PublicEppoSourceRecord;
  compact?: boolean;
}) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  if (!compact) {
    rows.push({ label: copy.code, value: <code>{record.eppoCode}</code> });
    rows.push({ label: copy.kindLabel, value: copy.kinds[record.objectKind] });
  }
  if (record.scientificName && record.scientificName !== record.displayName) {
    rows.push({
      label: copy.scientificName,
      // A scientific name is Latin (DESIGN.md §6).
      value: <span lang="la">{record.scientificName}</span>,
    });
  }
  if (record.taxonomicRank) {
    rows.push({ label: copy.taxonomicRank, value: record.taxonomicRank });
  }
  if (record.parentDisplayName) {
    rows.push({ label: copy.parentTaxon, value: record.parentDisplayName });
  }
  if (record.aliases.length > 0) {
    rows.push({ label: copy.aliases, value: record.aliases.join(", ") });
  }
  rows.push({
    label: copy.observed,
    value: (
      <time dateTime={record.observedAt}>
        {formatDate(record.observedAt, locale)}
      </time>
    ),
  });

  return (
    <dl
      className={
        compact
          ? "grid gap-1 text-body-sm text-text-muted"
          : "grid max-w-prose gap-3 border-t border-border pt-4 text-body text-text"
      }
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className={compact ? "flex flex-wrap gap-x-1" : "grid gap-1"}
        >
          <dt
            className={
              compact ? "font-medium text-text" : "text-caption text-text-muted"
            }
          >
            {compact ? `${row.label}:` : row.label}
          </dt>
          <dd className="break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SourceCredit({
  copy,
  source,
}: {
  copy: EppoArchiveCopy;
  source: PublicEppoSourceRecord["source"];
}) {
  // The licence obligation: whose data this is, under which licence, and the
  // credit it asks for — on every record, list and page alike.
  return (
    <dl
      className="grid gap-1 border-t border-border pt-3 text-body-sm text-text-muted"
      data-eppo-source-credit="true"
    >
      <div className="flex flex-wrap gap-x-1">
        <dt className="font-medium text-text">{`${copy.sourceCredit}:`}</dt>
        <dd>
          <DocumentLink href={source.url} rel="external" lang="en">
            {source.name}
          </DocumentLink>
        </dd>
      </div>
      <div className="flex flex-wrap gap-x-1">
        <dt className="font-medium text-text">{`${copy.sourceLicense}:`}</dt>
        <dd lang="en">
          {source.licenseUrl ? (
            <DocumentLink href={source.licenseUrl} rel="external">
              {source.license}
            </DocumentLink>
          ) : (
            source.license
          )}
        </dd>
      </div>
      {source.attribution ? (
        <div className="flex flex-wrap gap-x-1">
          <dt className="font-medium text-text">
            {`${copy.sourceAttribution}:`}
          </dt>
          <dd lang="en">{source.attribution}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** The record's name is Latin when it is its scientific name. */
function latinWhenScientific(record: PublicEppoSourceRecord) {
  return record.scientificName && record.scientificName === record.displayName
    ? { lang: "la" }
    : {};
}

function explorerHref(
  locale: PublicLocale,
  request: EppoArchivePage["request"],
) {
  const path = localizedPath(locale, "/sources/eppo");
  const params = new URLSearchParams();
  if (request.query) params.set("q", request.query);
  if (request.kind !== "all") params.set("kind", request.kind);
  if (request.cursor) params.set("cursor", request.cursor);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function formatDate(value: string, locale: PublicLocale) {
  return new Intl.DateTimeFormat(
    { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale],
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  ).format(new Date(value));
}
