import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import {
  buildObjectProgressTimeline,
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
      className="grid gap-4 rounded-lg border border-border bg-surface-sunken p-4"
    >
      <div className="grid gap-1">
        <h2 id="object-progress-heading" className="text-h3 text-text-heading">
          {copy.title}
        </h2>
        <p className="text-body-sm leading-6 text-text-muted">
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
      <figcaption className="text-caption font-medium text-text-muted">
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
      <p className="text-body-sm text-text">{entry.title}</p>
    </figure>
  );
}
