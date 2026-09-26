import Link from "next/link";

import { type InterfaceLocale } from "@/lib/interface-localization";
import { publicJournalEntryAddress } from "@/lib/garden/public-paths";
import type { PlantObjectPage } from "@/server/journal-repository";
import { deleteJournalEntryAction } from "./actions";
import { EntryActionsMenu } from "@/components/garden/entry-actions-menu";
import { getEntryActionsCopy } from "@/lib/entry-actions-copy";
import { gardenEntryEditPath } from "@/app/(default)/garden/entries/[entryId]/edit/edit-shell";

/**
 * What the owner can do with one entry of their timeline: edit it, open its
 * public page, or delete it (`OVE-488`). Shared by the page and its
 * «Показати ще» portions.
 */
export function OwnerEntryActions({
  entry,
  objectId,
  locale,
  authorHandle,
}: {
  entry: PlantObjectPage["entries"][number];
  objectId: string;
  locale: InterfaceLocale;
  /** The owner's registry handle; the public link hangs from it (ADR-0029 D9). */
  authorHandle: string | null;
}) {
  const actionCopy = getEntryActionsCopy(locale);

  if (entry.visibility === "public" && entry.public_slug) {
    const publicHref = publicJournalEntryAddress({
      authorHandle,
      entryNumber: entry.author_entry_number,
      publicSlug: entry.public_slug,
    });
    // Back to this entry's place in the timeline once the edit is saved or
    // discarded (`OVE-488` criterion 6).
    const editHref = gardenEntryEditPath(
      entry.id,
      `/garden/objects/${encodeURIComponent(objectId)}#passport-entry-${entry.id}`,
    );
    return (
      <div
        data-owner-entry-controls="public"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={editHref}
            data-owner-entry-edit={entry.id}
            className="text-link hover:text-link-hover text-body-sm font-medium underline-offset-4 hover:underline"
          >
            {actionCopy.edit}
          </Link>
          <Link
            href={publicHref}
            className="text-link hover:text-link-hover text-body-sm font-medium underline-offset-4 hover:underline"
          >
            {actionCopy.openPublic}
          </Link>
        </div>
        {/* The one irreversible act on an entry, behind its own menu and
            apart from everything an owner does every day (OG-UX-045). */}
        <EntryActionsMenu
          locale={locale}
          entryId={entry.id}
          entryTitle={entry.title}
          objectId={objectId}
          deleteAction={deleteJournalEntryAction}
          focusAfterDelete="#passport-timeline h2"
        />
      </div>
    );
  }

  return null;
}
