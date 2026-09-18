import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { formatOrganismDate } from "@/lib/public-organism-copy";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import type { PublicCatalogSourceCredit } from "@/server/public-variety-repository";

interface PublicVarietySourceCreditsProps {
  locale: InterfaceLocale;
  credits: PublicCatalogSourceCredit[];
  /** The card's content clock: shown as the page's last-updated date (D9). */
  contentUpdatedAt?: Date | string | null;
}

/**
 * The attribution footer (ADR-0026 D9): every source that contributed
 * something the page shows, with its licence, the date its snapshot was
 * downloaded, the newest assertion it made, and an outbound link.
 */
export function PublicVarietySourceCredits({
  locale,
  credits,
  contentUpdatedAt = null,
}: PublicVarietySourceCreditsProps) {
  if (credits.length === 0) return null;
  const copy = getPublicSurfaceCopy(locale);
  const lastUpdated = formatOrganismDate(locale, contentUpdatedAt);

  return (
    <footer
      aria-labelledby="source-credits-heading"
      data-organism-section="attribution"
      className="grid gap-4 border-t border-border pt-6"
    >
      <div className="flex flex-col gap-1">
        <p className="text-overline text-text-muted uppercase">
          {copy.sourceCredits.dataSources}
        </p>
        <h2 id="source-credits-heading" className="text-h2 text-text-heading">
          {copy.sourceCredits.title}
        </h2>
        {lastUpdated ? (
          <p className="text-body-sm text-text-muted">
            {copy.organism.sections.lastUpdated}:{" "}
            <time dateTime={toIso(contentUpdatedAt)}>{lastUpdated}</time>
          </p>
        ) : null}
      </div>
      <ol className="grid list-none gap-3 md:grid-cols-2">
        {credits.map((credit) => {
          const downloaded = formatOrganismDate(locale, credit.fetchedAt);
          const observed = formatOrganismDate(locale, credit.lastObservedAt);
          return (
            <li
              key={`${credit.sourceSlug}:${credit.sourceVersion}`}
              className="rounded-lg border border-border p-4"
            >
              <div className="flex flex-col gap-2">
                <a
                  href={credit.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 min-w-0 items-center gap-1 rounded-sm font-medium text-link underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <span className="truncate">{credit.sourceName}</span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                </a>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    {copy.sourceCredits.versionLabel}: {credit.sourceVersion}
                  </Badge>
                  {downloaded ? (
                    <Badge tone="neutral">
                      {copy.organism.sections.downloadedOn}:{" "}
                      <time dateTime={toIso(credit.fetchedAt)}>
                        {downloaded}
                      </time>
                    </Badge>
                  ) : null}
                  {observed ? (
                    <Badge tone="neutral">
                      {copy.organism.sections.observedOn}:{" "}
                      <time dateTime={toIso(credit.lastObservedAt)}>
                        {observed}
                      </time>
                    </Badge>
                  ) : null}
                  {credit.attributionRequired ? (
                    // The licence obligation, stated rather than implied:
                    // where a source requires attribution the page says so
                    // beside the attribution itself.
                    <Badge tone="info">
                      {copy.sourceCredits.attributionRequired}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-body-sm text-text-muted">
                  {credit.licenseUrl ? (
                    <a
                      href={credit.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm font-medium text-link underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      {credit.license}
                    </a>
                  ) : (
                    <span className="font-medium text-text">
                      {credit.license}
                    </span>
                  )}
                </p>
                {credit.attributionText ? (
                  <p className="text-body-sm text-text-muted">
                    {credit.attributionText}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </footer>
  );
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
