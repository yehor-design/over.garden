import Link from "next/link";
import { ArrowRightIcon as ArrowRight } from "@/components/icons/ArrowRight";
import { BookOpenTextIcon as BookOpenText } from "@/components/icons/BookOpenText";
import { CalendarBlankIcon as CalendarDays } from "@/components/icons/CalendarBlank";
import { WarningCircleIcon as CircleAlert } from "@/components/icons/WarningCircle";
import { LinkIcon as Link2 } from "@/components/icons/Link";
import { CircleNotchIcon as LoaderCircle } from "@/components/icons/CircleNotch";
import { MagnifyingGlassPlusIcon as ScanSearch } from "@/components/icons/MagnifyingGlassPlus";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { buttonVariants } from "@/components/ui/button";
import {
  formatPublicKnowledgeEvidenceCount,
  type PublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import {
  contentLanguageAttribute,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import type { PublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";

export type PublicKnowledgeEvidenceState =
  | "ready"
  | "empty"
  | "loading"
  | "error";

export function PublicKnowledgeEvidenceList({
  locale,
  copy,
  evidence,
  state,
}: {
  locale: PublicLocale;
  copy: PublicKnowledgeCopy;
  evidence: PublicKnowledgeEvidence;
  state: PublicKnowledgeEvidenceState;
}) {
  return (
    <section
      data-trust-state="user-evidence"
      className="grid gap-4 border-t border-border pt-6"
      aria-labelledby="public-knowledge-evidence-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="flex items-center gap-2 text-overline text-text-muted uppercase">
            <BookOpenText className="size-4" aria-hidden="true" />
            {copy.journalEvidenceLabel}
          </p>
          <h2
            id="public-knowledge-evidence-heading"
            className="text-h2 text-text-heading"
          >
            {formatPublicKnowledgeEvidenceCount(
              evidence.totalCount,
              locale,
              copy,
            )}
          </h2>
        </div>
        {evidence.totalCount > 0 ? (
          <Link
            href={evidence.allEvidencePath}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {copy.viewAllEvidence}
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {state === "loading" ? (
        <div
          aria-busy="true"
          className="flex min-h-28 items-center gap-3 border-y border-border py-5 text-body-sm text-text-muted"
        >
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          {copy.loadingLabel}
        </div>
      ) : null}

      {state === "error" ? (
        <div className="grid gap-3 border-y border-border py-5">
          <p className="flex items-center gap-2 font-semibold text-text">
            <CircleAlert className="size-5" aria-hidden="true" />
            {copy.errorTitle}
          </p>
          <p className="max-w-prose text-body-sm text-text-muted">
            {copy.errorBody}
          </p>
          <Link
            href={localizedPath(locale, "/knowledge")}
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: "w-fit",
            })}
          >
            {copy.retry}
          </Link>
        </div>
      ) : null}

      {state === "empty" ? (
        <div className="grid gap-2 border-y border-border py-5">
          <p className="font-semibold text-text">{copy.emptyEvidenceTitle}</p>
          <p className="max-w-prose text-body-sm text-text-muted">
            {copy.emptyEvidenceBody}
          </p>
        </div>
      ) : null}

      {state === "ready" && evidence.items.length > 0 ? (
        <ol className="grid border-x border-b border-border">
          {evidence.items.map((item, index) => (
            <li
              key={item.card.publicPath}
              className="grid min-w-0 gap-4 border-t border-border p-4 sm:grid-cols-4"
            >
              <EvidenceMedia item={item} eager={index === 0} />
              <div className="grid min-w-0 content-start gap-3 sm:col-span-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    <time dateTime={toIsoDate(item.card.entryDate)}>
                      {formatDate(item.card.entryDate, locale)}
                    </time>
                  </span>
                  <Link
                    href={item.card.object.publicPath}
                    className="font-medium text-text hover:underline"
                  >
                    {item.card.object.displayName}
                  </Link>
                </div>

                {/* Evidence is quoted, so it keeps the language it was
                    written in (WCAG 3.1.2). */}
                <div
                  {...contentLanguageAttribute(
                    item.card.sourceLanguage,
                    locale,
                  )}
                  className="grid gap-1"
                >
                  <Link
                    href={item.card.publicPath}
                    className="text-h3 text-text-heading hover:underline"
                  >
                    {item.card.title}
                  </Link>
                  <p className="line-clamp-3 text-body-sm text-text-muted">
                    {item.card.excerpt}
                  </p>
                </div>

                {item.matches.length > 0 ? (
                  <div className="grid gap-1.5 border-l-2 border-primary/40 pl-3 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-text">
                      <ScanSearch className="size-4" aria-hidden="true" />
                      {copy.whyMatched}
                    </p>
                    {item.matches.map((match) => (
                      <p
                        key={`${match.kind}:${match.slug}`}
                        className="text-text-muted"
                      >
                        {match.kind === "topic"
                          ? copy.matchedByTopic
                          : copy.matchedByCatalog}
                        {": "}
                        <Link
                          href={match.publicPath}
                          className="font-medium text-text hover:underline"
                        >
                          {match.label}
                        </Link>
                      </p>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-sm font-medium">
                  <Link
                    href={item.card.publicPath}
                    className="text-link inline-flex min-h-11 items-center gap-1.5 hover:underline"
                  >
                    {copy.readEntry}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href={item.card.object.publicPath}
                    className="inline-flex min-h-11 items-center gap-1.5 text-text hover:underline"
                  >
                    <Link2 className="size-4" aria-hidden="true" />
                    {copy.viewObject}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function EvidenceMedia({
  item,
  eager,
}: {
  item: PublicKnowledgeEvidence["items"][number];
  eager: boolean;
}) {
  const media = item.card.media[0];

  return (
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-border bg-surface-sunken sm:aspect-square">
      {media ? (
        <SubjectAwareMediaImage
          src={media.publicUrl}
          alt={`${item.card.object.displayName}: ${item.card.title}`}
          fill
          sizes="(max-width: 639px) 100vw, 144px"
          presentationMode="cover"
          focalX={media.focalX}
          focalY={media.focalY}
          intrinsicWidth={media.intrinsicWidth}
          intrinsicHeight={media.intrinsicHeight}
          loading={eager ? "eager" : "lazy"}
          unoptimized
        />
      ) : (
        <div className="flex h-full items-center justify-center p-3 text-center text-caption text-text-muted">
          {item.card.object.identityLabel ?? item.card.object.displayName}
        </div>
      )}
    </div>
  );
}

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function localeTag(locale: PublicLocale) {
  return { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale];
}

function toIsoDate(value: Date | string) {
  return new Date(value).toISOString();
}
