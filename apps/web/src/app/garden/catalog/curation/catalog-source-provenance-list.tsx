import Link from "next/link";
import { Database, ExternalLink } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { publicVarietyPath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOperatorCurationCopy,
  operatorCurationMapLabel,
} from "@/lib/operator-curation-copy";
import { formatOperatorDate } from "@/lib/operator-copy";
import type { CatalogSourceProvenanceCurationRow } from "@/server/catalog-source/provenance-repository";

interface CatalogSourceProvenanceListProps {
  locale: InterfaceLocale;
  provenanceRows: CatalogSourceProvenanceCurationRow[];
}

export function CatalogSourceProvenanceList({
  locale,
  provenanceRows,
}: CatalogSourceProvenanceListProps) {
  const copy = getOperatorCurationCopy(locale);

  return (
    <section className="grid min-w-0 gap-4 border-b border-border pb-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {copy.provenance.title}
        </h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {copy.common.rows}: {provenanceRows.length}
          </span>
        </div>
      </div>

      {provenanceRows.length > 0 ? (
        <ol className="grid min-w-0 gap-4">
          {provenanceRows.map((row) => (
            <li
              key={`${row.catalogItemId}:${row.sourceRecordKey}`}
              className="min-w-0"
            >
              <CatalogSourceProvenanceCard locale={locale} row={row} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.provenance.noRows}
        </p>
      )}
    </section>
  );
}

function CatalogSourceProvenanceCard({
  locale,
  row,
}: {
  locale: InterfaceLocale;
  row: CatalogSourceProvenanceCurationRow;
}) {
  const copy = getOperatorCurationCopy(locale);

  return (
    <article className="grid min-w-0 gap-4 rounded-lg border border-border p-4 [&>*]:min-w-0">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-lg font-semibold text-foreground">
              {row.catalogCanonicalName}
            </h3>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {operatorCurationMapLabel(
                copy.common.catalogKinds,
                row.catalogKind,
                copy.common.catalogKinds.identity,
              )}
            </span>
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {operatorCurationMapLabel(
                copy.common.statuses,
                row.catalogStatus,
                copy.common.unknown,
              )}
            </span>
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {row.catalogSource}
            </span>
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {row.sourceSlug}
            </span>
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {copy.common.version}: {row.sourceVersion}
            </span>
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {copy.provenance.row}: {row.sourceRecordKey}
            </span>
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {copy.provenance.auditLinks}: {row.auditLinkCount}
            </span>
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {copy.common.verified}:{" "}
              {formatOperatorDate(locale, row.verifiedAt)}
            </span>
            <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
              {operatorCurationMapLabel(
                copy.common.statuses,
                row.projectionStatus,
                copy.common.unknown,
              )}
            </span>
          </div>
        </div>

        {row.catalogPublicSlug ? (
          <Link
            href={publicVarietyPath(row.catalogPublicSlug)}
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            <ExternalLink className="size-4" />
            {copy.common.publicPage}
          </Link>
        ) : null}
      </div>

      <dl className="grid min-w-0 gap-3 text-sm md:grid-cols-2 [&>div]:min-w-0">
        {row.projectedAliases.length > 0 ? (
          <div className="md:col-span-2">
            <dt className="text-xs text-muted-foreground">
              {copy.provenance.aliasReviewStates}
            </dt>
            <dd className="mt-2 grid gap-2 md:grid-cols-2">
              {row.projectedAliases.map((alias) => (
                <AliasReviewState
                  key={`${alias.sourceSlug}:${alias.locale}:${alias.displayName}:${alias.status}`}
                  alias={alias}
                  locale={locale}
                />
              ))}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">
            {copy.common.source}
          </dt>
          <dd className="mt-1">
            <a
              href={row.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full min-w-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              <span className="truncate">{row.sourceName}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {copy.common.license}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {row.licenseUrl ? (
              <a
                href={row.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full min-w-0 items-center gap-1 underline-offset-4 hover:underline"
              >
                <span className="truncate">{row.license}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              row.license
            )}
            {row.attributionRequired
              ? ` · ${copy.common.attributionRequired}`
              : ""}
          </dd>
        </div>
        {row.attributionText ? (
          <div className="md:col-span-2">
            <dt className="text-xs text-muted-foreground">
              {copy.common.attribution}
            </dt>
            <dd className="mt-1 font-medium break-words text-foreground">
              {row.attributionText}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">
            {copy.common.parser}
          </dt>
          <dd className="mt-1 font-medium break-words text-foreground">
            {row.parserVersion}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {copy.common.fetched}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatOperatorDate(locale, row.fetchedAt)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function AliasReviewState({
  locale,
  alias,
}: {
  locale: InterfaceLocale;
  alias: CatalogSourceProvenanceCurationRow["projectedAliases"][number];
}) {
  const copy = getOperatorCurationCopy(locale);

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{alias.displayName}</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground uppercase">
          {alias.locale}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
          {operatorCurationMapLabel(
            copy.common.statuses,
            alias.status,
            copy.common.unknown,
          )}
        </span>
        {alias.projectedToTypeahead ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            {copy.common.typeahead}
          </span>
        ) : null}
        {alias.isPrimary ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            {copy.common.primary}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{alias.aliasKind}</span>
        <span>{alias.sourceSlug}</span>
        <span>{alias.sourceMethod}</span>
        <span>
          {copy.common.confidence}{" "}
          {formatConfidence(alias.confidence, copy.common.unknown)}
        </span>
        <span>
          {alias.license}
          {alias.attributionRequired
            ? ` · ${copy.common.attributionRequired}`
            : ""}
        </span>
        {alias.sourceRecordKey ? <span>{alias.sourceRecordKey}</span> : null}
      </div>
      {alias.projectionNotes ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {alias.projectionNotes}
        </p>
      ) : null}
    </div>
  );
}

function formatConfidence(value: number, fallback: string) {
  if (!Number.isFinite(value)) return fallback;
  return value.toFixed(2);
}
