import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  buildSaveProgressMomentCopy,
  type SaveProgressMomentKind,
} from "@/lib/garden/save-progress-moment";

interface SaveProgressMomentProps {
  locale: InterfaceLocale;
  kind: SaveProgressMomentKind;
  entryCount: number;
  objectName?: string | null;
  spaceName?: string | null;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export function SaveProgressMoment({
  locale,
  kind,
  entryCount,
  objectName = null,
  spaceName = null,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: SaveProgressMomentProps) {
  const copy = buildSaveProgressMomentCopy(
    {
      kind,
      objectName,
      spaceName,
      entryCount,
    },
    locale,
  );

  return (
    <section
      aria-live="polite"
      aria-labelledby="save-progress-heading"
      data-save-progress-moment={kind}
      className="grid gap-4 rounded-lg border border-success-border bg-success-surface p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <p className="flex items-center gap-2 text-body-sm font-medium text-success-text">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {copy.eyebrow}
          </p>
          <h2 id="save-progress-heading" className="text-h3 text-text-heading">
            {copy.title}
          </h2>
          <p className="max-w-prose text-body-sm leading-6 text-text-secondary">
            {copy.body}
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-48">
          <div className="flex items-baseline justify-between gap-3 text-caption text-text-muted">
            <span>{copy.progressLabel}</span>
            <span>{copy.progressValue}</span>
          </div>
          {/* A real `progressbar` with its bounds and its value, so a
              reader hears the figure rather than seeing a rectangle. */}
          <ProgressBar
            label={copy.progressLabel}
            value={copy.progressPercent}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border pt-3">
        <Link href={primaryHref} className={buttonVariants()}>
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className={buttonVariants({ variant: "secondary" })}
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
