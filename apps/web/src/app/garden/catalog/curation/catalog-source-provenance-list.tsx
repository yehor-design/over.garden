import Link from "next/link";
import { Database, ExternalLink } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { catalogKindLabel } from "@/lib/garden/pilot-ux-copy";
import { publicVarietyPath } from "@/lib/garden/public-paths";
import type { CatalogSourceProvenanceCurationRow } from "@/server/catalog-source/provenance-repository";

interface CatalogSourceProvenanceListProps {
  provenanceRows: CatalogSourceProvenanceCurationRow[];
}

export function CatalogSourceProvenanceList({
  provenanceRows,
}: CatalogSourceProvenanceListProps) {
  return (
    <section className="grid gap-4 border-b border-border pb-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Imported source provenance
        </h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            Rows: {provenanceRows.length}
          </span>
        </div>
      </div>

      {provenanceRows.length > 0 ? (
        <ol className="grid gap-4">
          {provenanceRows.map((row) => (
            <li key={`${row.catalogItemId}:${row.sourceRecordKey}`}>
              <CatalogSourceProvenanceCard row={row} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No imported source provenance.
        </p>
      )}
    </section>
  );
}

function CatalogSourceProvenanceCard({
  row,
}: {
  row: CatalogSourceProvenanceCurationRow;
}) {
  return (
    <article className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-lg font-semibold text-foreground">
              {row.catalogCanonicalName}
            </h3>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {catalogKindLabel(row.catalogKind)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {row.catalogStatus}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {row.catalogSource}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {row.sourceSlug}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Version: {row.sourceVersion}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Row: {row.sourceRecordKey}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Audit links: {row.auditLinkCount}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Verified: {formatDate(row.verifiedAt)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {row.projectionStatus}
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
            Public page
          </Link>
        ) : null}
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-2">
        {row.projectedAliases.length > 0 ? (
          <div className="md:col-span-2">
            <dt className="text-xs text-muted-foreground">
              Alias review states
            </dt>
            <dd className="mt-2 grid gap-2 md:grid-cols-2">
              {row.projectedAliases.map((alias) => (
                <AliasReviewState
                  key={`${alias.sourceSlug}:${alias.locale}:${alias.displayName}:${alias.status}`}
                  alias={alias}
                />
              ))}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Source</dt>
          <dd className="mt-1">
            <a
              href={row.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              <span className="truncate">{row.sourceName}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">License</dt>
          <dd className="mt-1 font-medium text-foreground">
            {row.licenseUrl ? (
              <a
                href={row.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:underline"
              >
                <span className="truncate">{row.license}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              row.license
            )}
            {row.attributionRequired ? " · attribution required" : ""}
          </dd>
        </div>
        {row.attributionText ? (
          <div className="md:col-span-2">
            <dt className="text-xs text-muted-foreground">Attribution</dt>
            <dd className="mt-1 font-medium text-foreground">
              {row.attributionText}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Parser</dt>
          <dd className="mt-1 font-medium text-foreground">
            {row.parserVersion}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Fetched</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatDate(row.fetchedAt)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function AliasReviewState({
  alias,
}: {
  alias: CatalogSourceProvenanceCurationRow["projectedAliases"][number];
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{alias.displayName}</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground uppercase">
          {alias.locale}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
          {alias.status}
        </span>
        {alias.projectedToTypeahead ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            typeahead
          </span>
        ) : null}
        {alias.isPrimary ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            primary
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{alias.aliasKind}</span>
        <span>{alias.sourceSlug}</span>
        <span>{alias.sourceMethod}</span>
        <span>confidence {formatConfidence(alias.confidence)}</span>
        <span>
          {alias.license}
          {alias.attributionRequired ? " · attribution required" : ""}
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

function formatDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function formatConfidence(value: number) {
  if (!Number.isFinite(value)) return "unknown";
  return value.toFixed(2);
}
