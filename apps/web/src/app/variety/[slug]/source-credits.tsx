import { ExternalLink } from "lucide-react";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import type { PublicCatalogSourceCredit } from "@/server/public-variety-repository";

interface PublicVarietySourceCreditsProps {
  locale: InterfaceLocale;
  credits: PublicCatalogSourceCredit[];
}

export function PublicVarietySourceCredits({
  locale,
  credits,
}: PublicVarietySourceCreditsProps) {
  if (credits.length === 0) return null;
  const copy = getPublicSurfaceCopy(locale);

  return (
    <section
      aria-labelledby="source-credits-heading"
      className="grid gap-4 border-b border-border pb-6"
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
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {credits.map((credit) => (
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
        ))}
      </ol>
    </section>
  );
}
