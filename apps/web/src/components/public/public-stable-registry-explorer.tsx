import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  getPublicStableRegistryExplorerCopy,
  publicStableRegistrySurfaceCopy,
  type PublicStableRegistryExplorerCopy,
} from "@/lib/stable-registry/public-explorer-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import type {
  PublicEppoSourceRecord,
  PublicStableCatalogRecord,
  PublicStableRegistryPage,
  PublicStableRegistrySurface,
} from "@/server/catalog-source/public-eppo-explorer-repository";

export type PublicStableRegistryExplorerState =
  | "loading"
  | "ready"
  | "empty"
  | "degraded"
  | "not_found";

export type PublicStableRegistryExplorerMessage =
  | "invalid_query"
  | "unavailable";

type ExplorerRecord = PublicStableCatalogRecord | PublicEppoSourceRecord;

export function PublicStableRegistryExplorer({
  locale,
  surface,
  page,
  state,
  message,
  jsonLd,
}: {
  locale: PublicLocale;
  surface: PublicStableRegistrySurface;
  page: PublicStableRegistryPage<ExplorerRecord>;
  state: PublicStableRegistryExplorerState;
  message?: PublicStableRegistryExplorerMessage;
  jsonLd?: Record<string, unknown> | null;
}) {
  const copy = getPublicStableRegistryExplorerCopy(locale);
  const surfaceCopy = publicStableRegistrySurfaceCopy(copy, surface);
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);

  return (
    <main
      id="main-content"
      lang={locale}
      data-stable-registry-explorer={surface}
      data-stable-registry-state={state}
      aria-busy={state === "loading"}
      className="mx-auto flex w-full max-w-4xl flex-col px-4 py-6 sm:px-6"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <nav
        aria-label={copy.navigation.catalog}
        className="mb-5 flex flex-wrap gap-2"
      >
        <Link
          href={localizedPath(locale, "/catalog")}
          aria-current={surface === "catalog" ? "page" : undefined}
          className={buttonVariants({
            variant: surface === "catalog" ? "default" : "outline",
            size: "sm",
          })}
        >
          {copy.navigation.catalog}
        </Link>
        <Link
          href={localizedPath(locale, "/sources/eppo")}
          aria-current={surface === "eppo" ? "page" : undefined}
          className={buttonVariants({
            variant: surface === "eppo" ? "default" : "outline",
            size: "sm",
          })}
        >
          {copy.navigation.eppo}
        </Link>
      </nav>

      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold text-foreground">
          {surfaceCopy.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {surfaceCopy.intro}
        </p>
      </header>

      <ExplorerSearch
        locale={locale}
        surface={surface}
        copy={copy}
        page={page}
      />

      <section
        className="border-t border-border py-5"
        aria-live="polite"
        aria-atomic="true"
      >
        <h2 className="text-lg font-semibold text-foreground">
          {surfaceCopy.resultsTitle}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatResultsCount(copy.resultsCount, page.records.length)}
        </p>
        {state === "degraded" ? (
          <ExplorerMessage
            text={
              message === "invalid_query" ? copy.invalidQuery : copy.unavailable
            }
            retryHref={explorerHref(locale, surface, page.request)}
            retryLabel={copy.retry}
            browseCatalogHref={localizedPath(locale, "/catalog")}
            browseCatalogLabel={copy.browseCatalog}
          />
        ) : null}
        {state === "empty" ? (
          <p className="mt-3 text-sm text-muted-foreground">{copy.empty}</p>
        ) : null}
        {state === "ready" ? (
          <ol className="mt-4 grid gap-3">
            {page.records.map((record) => (
              <li key={recordKey(record)}>
                <ExplorerCard copy={copy} record={record} />
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {state === "ready" && page.nextCursor ? (
        <nav
          aria-label={copy.next}
          className="flex justify-end border-t border-border pt-4"
        >
          <Link
            href={explorerHref(locale, surface, {
              ...page.request,
              cursor: page.nextCursor,
            })}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.next}
          </Link>
        </nav>
      ) : null}
    </main>
  );
}

export function PublicStableRegistryDetail({
  locale,
  surface,
  record,
  jsonLd,
}: {
  locale: PublicLocale;
  surface: PublicStableRegistrySurface;
  record: ExplorerRecord;
  jsonLd?: Record<string, unknown> | null;
}) {
  const copy = getPublicStableRegistryExplorerCopy(locale);
  const surfaceCopy = publicStableRegistrySurfaceCopy(copy, surface);
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);

  return (
    <main
      id="main-content"
      lang={locale}
      data-stable-registry-detail={surface}
      className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:px-6"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <Link
        href={localizedPath(
          locale,
          surface === "catalog" ? "/catalog" : "/sources/eppo",
        )}
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "mb-5 w-fit",
        })}
      >
        {surface === "catalog" ? copy.browseCatalog : copy.browseEppo}
      </Link>
      <p className="text-sm text-muted-foreground">{surfaceCopy.detailTitle}</p>
      <h1 className="mt-1 text-3xl font-semibold text-foreground">
        {record.displayName}
      </h1>
      <ExplorerCard copy={copy} record={record} detail />
    </main>
  );
}

export function PublicStableRegistryNotFound({
  locale,
  surface,
}: {
  locale: PublicLocale;
  surface: PublicStableRegistrySurface;
}) {
  const copy = getPublicStableRegistryExplorerCopy(locale);
  const surfaceCopy = publicStableRegistrySurfaceCopy(copy, surface);

  return (
    <main
      id="main-content"
      lang={locale}
      data-stable-registry-explorer={surface}
      data-stable-registry-state="not_found"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8"
    >
      <p className="text-sm font-medium text-muted-foreground">
        {surfaceCopy.title}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {copy.notFound}
      </h1>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {surfaceCopy.intro}
      </p>
      <div className="flex flex-wrap gap-3">
        <form>
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.retry}
          </button>
        </form>
        <Link
          href={localizedPath(
            locale,
            surface === "catalog" ? "/catalog" : "/sources/eppo",
          )}
          className={buttonVariants({ size: "sm" })}
        >
          {surface === "catalog" ? copy.browseCatalog : copy.browseEppo}
        </Link>
      </div>
    </main>
  );
}

function ExplorerSearch({
  locale,
  surface,
  copy,
  page,
}: {
  locale: PublicLocale;
  surface: PublicStableRegistrySurface;
  copy: PublicStableRegistryExplorerCopy;
  page: PublicStableRegistryPage<ExplorerRecord>;
}) {
  return (
    <form
      action={localizedPath(
        locale,
        surface === "catalog" ? "/catalog" : "/sources/eppo",
      )}
      method="get"
      className="grid gap-3 py-5 sm:grid-cols-3"
    >
      <label className="grid gap-1 text-sm font-medium text-foreground">
        {copy.searchLabel}
        <input
          name="q"
          type="search"
          defaultValue={page.request.query}
          minLength={2}
          maxLength={120}
          placeholder={copy.searchPlaceholder}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground">
        {copy.kindLabel}
        <select
          name="kind"
          defaultValue={page.request.kind}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">{copy.kinds.all}</option>
          <option value="plant">{copy.kinds.plant}</option>
          <option value="animal">{copy.kinds.animal}</option>
        </select>
      </label>
      <button
        type="submit"
        className={buttonVariants({ size: "default", className: "self-end" })}
      >
        {copy.searchButton}
      </button>
      <Link
        href={localizedPath(
          locale,
          surface === "catalog" ? "/catalog" : "/sources/eppo",
        )}
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "self-end",
        })}
      >
        {copy.reset}
      </Link>
    </form>
  );
}

function ExplorerCard({
  copy,
  record,
  detail = false,
}: {
  copy: PublicStableRegistryExplorerCopy;
  record: ExplorerRecord;
  detail?: boolean;
}) {
  const isSource = "eppoCode" in record;
  const heading = detail ? (
    record.displayName
  ) : (
    <Link href={record.href} className="hover:text-primary">
      {record.displayName}
    </Link>
  );
  return (
    <article className="mt-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          {copy.badges[record.evidenceState]}
        </span>
        <span>{copy.kinds[record.objectKind]}</span>
        {isSource ? <code>{record.eppoCode}</code> : null}
      </div>
      <h2 className="mt-3 text-xl font-semibold text-foreground">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {copy.evidenceDescription[record.evidenceState]}
      </p>
      <dl className="mt-3 grid gap-1 text-sm text-muted-foreground">
        {record.scientificName &&
        record.scientificName !== record.displayName ? (
          <div>
            <dt className="inline font-medium text-foreground">
              {copy.scientificName}:
            </dt>
            <dd className="inline">{record.scientificName}</dd>
          </div>
        ) : null}
        {record.taxonomicRank ? (
          <div>
            <dt className="inline font-medium text-foreground">
              {copy.taxonomicRank}:
            </dt>
            <dd className="inline">{record.taxonomicRank}</dd>
          </div>
        ) : null}
        {record.parentDisplayName ? (
          <div>
            <dt className="inline font-medium text-foreground">
              {copy.parentTaxon}:
            </dt>
            <dd className="inline">{record.parentDisplayName}</dd>
          </div>
        ) : null}
      </dl>
      {record.aliases.length > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{copy.aliases}: </span>
          {record.aliases.join(", ")}
        </p>
      ) : null}
      <time
        dateTime={record.observedAt}
        className="mt-3 block text-xs text-muted-foreground"
      >
        {copy.observed}:{" "}
        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
          new Date(record.observedAt),
        )}
      </time>
      {isSource ? <SourceCredit copy={copy} source={record.source} /> : null}
    </article>
  );
}

function SourceCredit({
  copy,
  source,
}: {
  copy: PublicStableRegistryExplorerCopy;
  source: PublicEppoSourceRecord["source"];
}) {
  return (
    <dl className="mt-4 grid gap-1 border-t border-border pt-3 text-sm text-muted-foreground">
      <div>
        <dt className="inline font-medium text-foreground">
          {copy.sourceCredit}:{" "}
        </dt>
        <dd className="inline">
          <a
            href={source.url}
            rel="noreferrer"
            target="_blank"
            className="underline underline-offset-2"
          >
            {source.name}
          </a>
        </dd>
      </div>
      <div>
        <dt className="inline font-medium text-foreground">
          {copy.sourceLicense}:{" "}
        </dt>
        <dd className="inline">
          {source.licenseUrl ? (
            <a
              href={source.licenseUrl}
              rel="noreferrer"
              target="_blank"
              className="underline underline-offset-2"
            >
              {source.license}
            </a>
          ) : (
            source.license
          )}
        </dd>
      </div>
      {source.attribution ? (
        <div>
          <dt className="inline font-medium text-foreground">
            {copy.sourceAttribution}:{" "}
          </dt>
          <dd className="inline">{source.attribution}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function ExplorerMessage({
  text,
  retryHref,
  retryLabel,
  browseCatalogHref,
  browseCatalogLabel,
}: {
  text: string;
  retryHref: string;
  retryLabel: string;
  browseCatalogHref: string;
  browseCatalogLabel: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <p>{text}</p>
      <Link
        href={retryHref}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {retryLabel}
      </Link>
      <Link
        href={browseCatalogHref}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        {browseCatalogLabel}
      </Link>
    </div>
  );
}

function explorerHref(
  locale: PublicLocale,
  surface: PublicStableRegistrySurface,
  request: PublicStableRegistryPage<ExplorerRecord>["request"],
) {
  const path = localizedPath(
    locale,
    surface === "catalog" ? "/catalog" : "/sources/eppo",
  );
  const params = new URLSearchParams();
  if (request.query) params.set("q", request.query);
  if (request.kind !== "all") params.set("kind", request.kind);
  if (request.cursor) params.set("cursor", request.cursor);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function recordKey(record: ExplorerRecord) {
  return "stableTaxon" in record ? record.stableTaxon : record.eppoCode;
}

function formatResultsCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}
