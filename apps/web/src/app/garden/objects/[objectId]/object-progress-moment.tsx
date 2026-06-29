import Image from "next/image";

import {
  buildObjectProgressTimeline,
  formatEntryBodyExcerpt,
  formatProgressSpanLabel,
  pickProgressPhotoComparison,
  type ObjectProgressTimelineEntry,
} from "@/lib/garden/object-progress-moment";

interface ObjectProgressMomentProps {
  plantName: string;
  entries: ObjectProgressTimelineEntry[];
}

export function ObjectProgressMoment({
  plantName,
  entries,
}: ObjectProgressMomentProps) {
  const timeline = buildObjectProgressTimeline(entries);
  const spanLabel = formatProgressSpanLabel(timeline);
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
          Your plant progress
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {spanLabel
            ? `${spanLabel}. A private readback for ${plantName} — only you can see this.`
            : `A private readback for ${plantName} — only you can see this.`}
        </p>
      </div>

      {photoComparison ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ProgressPhotoCard
            label="Earlier photo"
            entry={photoComparison.earlier}
          />
          <ProgressPhotoCard label="Latest photo" entry={photoComparison.latest} />
        </div>
      ) : null}

      <ol className="grid gap-2 border-t border-border pt-3">
        {timeline.map((entry, index) => (
          <li
            key={entry.id}
            className="flex flex-col gap-3 rounded-md border border-border/70 bg-background p-3 sm:flex-row sm:items-start"
          >
            <time className="shrink-0 text-xs font-medium text-muted-foreground sm:w-28">
              {formatTimelineDate(entry.entryDate)}
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
              <Image
                src={entry.mediaPublicUrl}
                alt={`${entry.title} photo`}
                width={96}
                height={96}
                sizes="96px"
                unoptimized
                className="size-20 shrink-0 rounded-md border border-border object-cover sm:size-24"
              />
            ) : null}
            {index < timeline.length - 1 ? (
              <span className="sr-only">Next entry in timeline</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProgressPhotoCard({
  label,
  entry,
}: {
  label: string;
  entry: ObjectProgressTimelineEntry;
}) {
  if (!entry.mediaPublicUrl) return null;

  return (
    <figure className="grid gap-2">
      <figcaption className="text-xs font-medium text-muted-foreground">
        {label} · {formatTimelineDate(entry.entryDate)}
      </figcaption>
      <Image
        src={entry.mediaPublicUrl}
        alt={`${entry.title} photo`}
        width={480}
        height={320}
        sizes="(min-width: 640px) 20rem, 100vw"
        unoptimized
        className="aspect-video w-full rounded-md border border-border object-cover"
      />
      <p className="text-sm text-foreground">{entry.title}</p>
    </figure>
  );
}

function formatTimelineDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
