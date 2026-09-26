import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { type SpaceHistoryEntry } from "@/lib/garden/space-page";
import { formatGardenWorkspaceDate } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatSpacePageTemplate as template,
  type SpacePageCopy,
} from "@/lib/space-page-copy";

/**
 * One entry, once, under its one address, and labelled with what it is about:
 * the space itself, or the plant or animal it was written for (criterion 2).
 */
export function SpaceHistoryRow({
  copy,
  entry,
  locale,
  returnTo,
}: {
  copy: SpacePageCopy;
  entry: SpaceHistoryEntry;
  locale: InterfaceLocale;
  returnTo: string;
}) {
  const editHref = `/garden/entries/${encodeURIComponent(entry.id)}/edit?${new URLSearchParams(
    { returnTo },
  ).toString()}`;
  return (
    <li
      id={`space-entry-${entry.id}`}
      data-space-history-entry={entry.id}
      data-space-history-about={entry.about.kind}
      className="flex min-w-0 scroll-mt-24 flex-wrap items-start justify-between gap-x-4 gap-y-2 py-4"
    >
      <div className="grid min-w-0 flex-1 basis-60 gap-1">
        <p className="text-h4 break-words text-text-heading">
          {entry.publicPath ? (
            <Link
              href={entry.publicPath}
              className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {entry.title}
            </Link>
          ) : (
            entry.title
          )}
        </p>
        <p className="text-caption text-text-muted">
          {entry.about.kind === "space" ? (
            copy.history.aboutSpace
          ) : (
            <Link
              href={`/garden/objects/${encodeURIComponent(entry.about.objectId)}`}
              className="underline-offset-4 hover:underline"
            >
              {template(copy.history.aboutObject, {
                name: entry.about.displayName,
              })}
            </Link>
          )}
          {" · "}
          <time dateTime={entry.entryDate}>
            {formatGardenWorkspaceDate(locale, entry.entryDate)}
          </time>
          {entry.publicPath ? null : ` · ${copy.history.notPublic}`}
        </p>
      </div>
      <Link
        href={editHref}
        aria-label={template(copy.history.editLabel, { title: entry.title })}
        data-space-history-edit={entry.id}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        {copy.history.edit}
      </Link>
    </li>
  );
}
