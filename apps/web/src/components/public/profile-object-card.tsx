import { BookOpenIcon as BookOpen } from "@/components/icons/BookOpen";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { PlantIcon as Sprout } from "@/components/icons/Plant";
import { Card } from "@/components/ui/card";
import { Link as TextLink } from "@/components/ui/link";
import { MediaFigure } from "@/components/ui/media-figure";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { entryCardDates } from "@/lib/entry-card-dates";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { getPublicProfileCopy } from "@/lib/public-profile-copy";
import { formatPublicCount } from "@/lib/public-surface-localization";
import type { PublicProfileObjectEvidence } from "@/server/public-profile-repository";

/**
 * A portion of a profile's objects as list items — the page's first portion
 * and every «Показати ще» portion after it (DESIGN.md §5.26).
 */
export function ProfileObjectItems({
  objects,
  locale,
  headingLevel,
  priorityIndex = -1,
}: {
  objects: readonly PublicProfileObjectEvidence[];
  locale: InterfaceLocale;
  headingLevel: 2 | 3;
  priorityIndex?: number;
}) {
  return objects.map((object, index) => (
    <li key={object.objectId} className="min-w-0">
      <ProfileObjectCard
        object={object}
        locale={locale}
        headingLevel={headingLevel}
        priority={index === priorityIndex}
      />
    </li>
  ));
}

function ProfileObjectCard({
  object,
  locale,
  headingLevel,
  priority,
}: {
  object: PublicProfileObjectEvidence;
  locale: InterfaceLocale;
  headingLevel: 2 | 3;
  priority: boolean;
}) {
  const copy = getPublicProfileCopy(locale);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `profile-object-${object.objectId}-title`;
  const kindLabel = object.objectKind === "animal" ? copy.animal : copy.plant;
  const latest = entryCardDates(locale, object.latestEntryDate, null);

  return (
    <Card
      as="article"
      interactive
      data-profile-object={object.objectId}
      aria-labelledby={titleId}
      className="grid h-full content-start gap-3 overflow-hidden p-4"
    >
      {object.coverImageUrl ? (
        <MediaFigure
          aspect="card"
          className="-mx-4 -mt-4"
          src={object.coverImageUrl}
          srcSet={
            buildPublicMediaSourceSet({
              publicUrl: object.coverImageUrl,
              intrinsicWidth: object.coverIntrinsicWidth,
              intrinsicHeight: object.coverIntrinsicHeight,
              variantLongEdges: object.coverVariantLongEdges,
            }).srcSet
          }
          placeholderDataUri={object.coverPlaceholderDataUri}
          alt={object.coverImageAlt}
          sizes="(min-width: 640px) 20rem, 100vw"
          focalX={object.coverFocalX}
          focalY={object.coverFocalY}
          intrinsicWidth={object.coverIntrinsicWidth}
          intrinsicHeight={object.coverIntrinsicHeight}
          priority={priority}
        />
      ) : null}

      <div className="flex min-w-0 items-start gap-3">
        {object.coverImageUrl ? null : (
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-muted"
          >
            <ObjectKindIcon kind={object.objectKind} />
          </span>
        )}
        <div className="grid min-w-0 gap-1">
          <Heading
            id={titleId}
            className="text-h3 break-words text-text-heading"
          >
            <TextLink
              href={object.publicPath}
              variant="quiet"
              className="text-text-heading"
            >
              {object.displayName}
            </TextLink>
          </Heading>
          <p className="text-caption break-words text-text-muted">
            {object.identityLabel ?? kindLabel}
          </p>
        </div>
      </div>

      <p
        data-profile-object-journal="true"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted"
      >
        <BookOpen className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {copy.journal}:{" "}
          {formatPublicCount(locale, "entry", object.publicEntryCount)}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {copy.latestEntry.split("{date}")[0]}
          <time dateTime={latest.dateTime} className="tabular-nums">
            {latest.dateLabel}
          </time>
        </span>
      </p>
    </Card>
  );
}

function ObjectKindIcon({
  kind,
}: {
  kind: PublicProfileObjectEvidence["objectKind"];
}) {
  if (kind === "animal")
    return <PawPrint className="size-5" aria-hidden="true" />;
  return <Sprout className="size-5" aria-hidden="true" />;
}
