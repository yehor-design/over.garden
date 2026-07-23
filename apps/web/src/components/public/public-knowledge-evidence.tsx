import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  CircleAlert,
  Link2,
  LoaderCircle,
  ScanSearch,
} from "lucide-react";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import { buttonVariants } from "@/components/ui/button";
import {
  formatPublicKnowledgeEvidenceCount,
  type PublicKnowledgeCopy,
} from "@/lib/public-knowledge-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
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
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
            <BookOpenText className="size-4" aria-hidden="true" />
            {copy.journalEvidenceLabel}
          </p>
          <h2
            id="public-knowledge-evidence-heading"
            className="text-xl font-semibold text-foreground"
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
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.viewAllEvidence}
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {state === "loading" ? (
        <div
          aria-busy="true"
          className="flex min-h-28 items-center gap-3 border-y border-border py-5 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          {copy.loadingLabel}
        </div>
      ) : null}

      {state === "error" ? (
        <div className="grid gap-3 border-y border-border py-5">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <CircleAlert className="size-5" aria-hidden="true" />
            {copy.errorTitle}
          </p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {copy.errorBody}
          </p>
          <Link
            href={localizedPath(locale, "/knowledge")}
            className={buttonVariants({
              variant: "outline",
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
          <p className="font-semibold text-foreground">
            {copy.emptyEvidenceTitle}
          </p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    <time dateTime={toIsoDate(item.card.entryDate)}>
                      {formatDate(item.card.entryDate, locale)}
                    </time>
                  </span>
                  <Link
                    href={item.card.object.publicPath}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {item.card.object.displayName}
                  </Link>
                </div>

                <div className="grid gap-1">
                  <Link
                    href={item.card.publicPath}
                    className="text-lg leading-6 font-semibold text-foreground hover:text-primary"
                  >
                    {item.card.title}
                  </Link>
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {item.card.excerpt}
                  </p>
                </div>

                {item.matches.length > 0 ? (
                  <div className="grid gap-1.5 border-l-2 border-primary/40 pl-3 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-foreground">
                      <ScanSearch className="size-3.5" aria-hidden="true" />
                      {copy.whyMatched}
                    </p>
                    {item.matches.map((match) => (
                      <p
                        key={`${match.kind}:${match.slug}`}
                        className="text-muted-foreground"
                      >
                        {match.kind === "topic"
                          ? copy.matchedByTopic
                          : copy.matchedByCatalog}
                        {": "}
                        <Link
                          href={match.publicPath}
                          className="font-medium text-foreground hover:text-primary hover:underline"
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
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    {copy.readEntry}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href={item.card.object.publicPath}
                    className="inline-flex items-center gap-1.5 text-foreground hover:text-primary hover:underline"
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
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-md border border-border bg-muted sm:aspect-square">
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
        <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
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
