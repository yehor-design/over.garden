import { ExternalLink } from "lucide-react";

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
        <p className="text-sm font-medium text-muted-foreground">
          {copy.sourceCredits.dataSources}
        </p>
        <h2
          id="source-credits-heading"
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          {copy.sourceCredits.title}
        </h2>
        {lastUpdated ? (
          <p className="text-sm text-muted-foreground">
            {copy.organism.sections.lastUpdated}:{" "}
            <time dateTime={toIso(contentUpdatedAt)}>{lastUpdated}</time>
          </p>
        ) : null}
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
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
                  className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                >
                  <span className="truncate">{credit.sourceName}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md border border-border px-2 py-1">
                    {copy.sourceCredits.versionLabel}: {credit.sourceVersion}
                  </span>
                  {downloaded ? (
                    <span className="rounded-md border border-border px-2 py-1">
                      {copy.organism.sections.downloadedOn}:{" "}
                      <time dateTime={toIso(credit.fetchedAt)}>{downloaded}</time>
                    </span>
                  ) : null}
                  {observed ? (
                    <span className="rounded-md border border-border px-2 py-1">
                      {copy.organism.sections.observedOn}:{" "}
                      <time dateTime={toIso(credit.lastObservedAt)}>{observed}</time>
                    </span>
                  ) : null}
                  {credit.attributionRequired ? (
                    <span className="rounded-md border border-border px-2 py-1">
                      {copy.sourceCredits.attributionRequired}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {credit.licenseUrl ? (
                    <a
                      href={credit.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {credit.license}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">
                      {credit.license}
                    </span>
                  )}
                </p>
                {credit.attributionText ? (
                  <p className="text-sm leading-6 text-muted-foreground">
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
