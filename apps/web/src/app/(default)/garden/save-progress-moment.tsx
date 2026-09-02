import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
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
      className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CheckCircle2 className="size-4" />
            {copy.eyebrow}
          </p>
          <h2
            id="save-progress-heading"
            className="text-lg font-semibold text-foreground"
          >
            {copy.title}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {copy.body}
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-48">
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span>{copy.progressLabel}</span>
            <span>{copy.progressValue}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div
              className={`h-full rounded-full bg-primary ${progressWidthClass(
                copy.progressPercent,
              )}`}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border pt-3">
        <Link href={primaryHref} className={buttonVariants()}>
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className={buttonVariants({ variant: "outline" })}
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function progressWidthClass(percent: number) {
  if (percent <= 25) return "w-1/4";
  if (percent <= 50) return "w-1/2";
  if (percent <= 75) return "w-3/4";
  return "w-full";
}
