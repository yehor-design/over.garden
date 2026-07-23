import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import {
  buildObjectProgressTimeline,
  formatEntryBodyExcerpt,
  pickProgressPhotoComparison,
  type ObjectProgressTimelineEntry,
} from "@/lib/garden/object-progress-moment";
import { formatGardenWorkspaceDate } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
  type OwnerObjectCopy,
} from "@/lib/owner-object-copy";

interface ObjectProgressMomentProps {
  locale: InterfaceLocale;
  objectName: string;
  entries: ObjectProgressTimelineEntry[];
}

export function ObjectProgressMoment({
  locale,
  objectName,
  entries,
}: ObjectProgressMomentProps) {
  const copy = getOwnerObjectCopy(locale).progress;
  const timeline = buildObjectProgressTimeline(entries);
  const firstEntry = timeline[0];
  const lastEntry = timeline[timeline.length - 1];
  const spanLabel =
    firstEntry && lastEntry
      ? formatOwnerObjectTemplate(copy.span, {
          start: formatGardenWorkspaceDate(locale, firstEntry.entryDate),
          end: formatGardenWorkspaceDate(locale, lastEntry.entryDate),
        })
      : null;
  const photoComparison = pickProgressPhotoComparison(timeline);

  return (
    <section
      aria-labelledby="object-progress-heading"
      className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4"
    >
      <div className="grid gap-1">
        <h2
          id="object-progress-heading"
          className="text-lg font-semibold text-foreground"
        >
          {copy.title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {spanLabel
            ? formatOwnerObjectTemplate(copy.privateReadbackWithSpan, {
                span: spanLabel,
                objectName,
              })
            : formatOwnerObjectTemplate(copy.privateReadback, { objectName })}
        </p>
      </div>

      {photoComparison ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ProgressPhotoCard
            locale={locale}
            copy={copy}
            label={copy.earlierPhoto}
            entry={photoComparison.earlier}
          />
          <ProgressPhotoCard
            locale={locale}
            copy={copy}
            label={copy.latestPhoto}
            entry={photoComparison.latest}
          />
        </div>
      ) : null}

      <ol className="grid gap-2 border-t border-border pt-3">
        {timeline.map((entry, index) => (
          <li
            key={entry.id}
            className="flex flex-col gap-3 rounded-md border border-border/70 bg-background p-3 sm:flex-row sm:items-start"
          >
            <time className="shrink-0 text-xs font-medium text-muted-foreground sm:w-28">
              {formatGardenWorkspaceDate(locale, entry.entryDate)}
            </time>
            <div className="grid min-w-0 flex-1 gap-1">
              <p className="text-sm font-semibold text-foreground">
                {entry.title}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {formatEntryBodyExcerpt(entry.body)}
              </p>
            </div>
            {entry.mediaPublicUrl ? (
              <SubjectAwareMediaImage
                src={entry.mediaPublicUrl}
                alt={formatOwnerObjectTemplate(copy.photoAlt, {
                  title: entry.title,
                })}
                width={96}
                height={96}
                sizes="96px"
                loading={index === 0 ? "eager" : "lazy"}
                unoptimized
                presentationMode="cover"
                focalX={entry.mediaFocalX}
                focalY={entry.mediaFocalY}
                intrinsicWidth={entry.mediaIntrinsicWidth}
                intrinsicHeight={entry.mediaIntrinsicHeight}
                className="size-20 shrink-0 rounded-md border border-border sm:size-24"
              />
            ) : null}
            {index < timeline.length - 1 ? (
              <span className="sr-only">{copy.nextEntry}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProgressPhotoCard({
  locale,
  copy,
  label,
  entry,
}: {
  locale: InterfaceLocale;
  copy: OwnerObjectCopy["progress"];
  label: string;
  entry: ObjectProgressTimelineEntry;
}) {
  if (!entry.mediaPublicUrl) return null;

  return (
    <figure className="grid gap-2">
      <figcaption className="text-xs font-medium text-muted-foreground">
        {label} · {formatGardenWorkspaceDate(locale, entry.entryDate)}
      </figcaption>
      <SubjectAwareMediaImage
        src={entry.mediaPublicUrl}
        alt={formatOwnerObjectTemplate(copy.photoAlt, { title: entry.title })}
        width={480}
        height={320}
        sizes="(min-width: 640px) 20rem, 100vw"
        unoptimized
        presentationMode="cover"
        focalX={entry.mediaFocalX}
        focalY={entry.mediaFocalY}
        intrinsicWidth={entry.mediaIntrinsicWidth}
        intrinsicHeight={entry.mediaIntrinsicHeight}
        className="aspect-video w-full rounded-md border border-border"
      />
      <p className="text-sm text-foreground">{entry.title}</p>
    </figure>
  );
}
