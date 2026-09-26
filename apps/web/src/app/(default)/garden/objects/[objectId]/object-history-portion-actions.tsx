"use server";

import { PassportTimelineEntries } from "@/components/living-object-passport/living-object-passport";
import { isPublicLocale } from "@/lib/public-localization";
import { LIST_PORTION_SIZE, type ShowMorePortion } from "@/lib/show-more";
import { buildOwnerObjectPassportPresentation } from "@/server/owner-object-passport-presentation";
import { resolveWorkspaceViewer } from "@/server/workspace-access";

import { loadOwnedObject, loadOwnerAuthorHandle } from "./object-sections";
import { objectHistoryHref } from "./object-history-href";
import { OwnerEntryActions } from "./owner-entry-actions";

/**
 * The next twenty entries of an object's timeline for «Показати ще»
 * (DESIGN.md §5.26), for its owner, with the owner's actions on each.
 */
export async function loadObjectHistoryPortion(
  context: { locale: string; objectId: string },
  token: string,
): Promise<ShowMorePortion | null> {
  if (!isPublicLocale(context.locale)) return null;
  const locale = context.locale;
  if (!/^\d{1,6}$/u.test(token) || Number(token) < 2) return null;
  const page = Number(token);
  const viewer = await resolveWorkspaceViewer();
  if (viewer.status !== "signed-in") return null;
  const settled = await loadOwnedObject(viewer.scope, context.objectId);
  if (settled.status !== "ready" || !settled.value) return null;
  const authorHandle = await loadOwnerAuthorHandle(viewer.scope);
  const { page: object, provenancePanel } = settled.value;
  const presentation = buildOwnerObjectPassportPresentation(
    object,
    provenancePanel,
    locale,
    authorHandle,
    null,
  );
  const entries = presentation.timeline.entries;
  const start = (page - 1) * LIST_PORTION_SIZE;
  const portion = entries.slice(start, start + LIST_PORTION_SIZE);
  if (portion.length === 0) return null;
  const entriesById = new Map(object.entries.map((entry) => [entry.id, entry]));
  const more = start + LIST_PORTION_SIZE < entries.length;
  return {
    items: (
      <PassportTimelineEntries
        entries={portion}
        locale={locale}
        precedingYear={entries[start - 1]?.year}
        renderEntryActions={(timelineEntry) => {
          const entry = entriesById.get(timelineEntry.id);
          return entry ? (
            <OwnerEntryActions
              entry={entry}
              objectId={context.objectId}
              locale={locale}
              authorHandle={authorHandle}
            />
          ) : null;
        }}
      />
    ),
    next: more
      ? {
          token: String(page + 1),
          href: objectHistoryHref(context.objectId, page + 1),
        }
      : null,
  };
}
