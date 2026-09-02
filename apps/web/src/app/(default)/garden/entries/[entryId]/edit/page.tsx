import { notFound, redirect } from "next/navigation";

import { JournalEntryEditComposer } from "@/app/(default)/garden/entries/[entryId]/edit/journal-entry-edit-composer";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";
import { journalEntryDateInputValue } from "@/lib/garden/journal-entry-date";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { readAtomicJournalEditBaseline } from "@/server/journal-repository";

export default async function GardenEntryEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ entryId }, query] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
  ]);
  const requestedReturnTo = firstParam(query.returnTo);
  const returnTo = normalizeJournalComposerReturnTo(
    requestedReturnTo,
    "/garden",
  );
  const editPath = `/garden/entries/${encodeURIComponent(entryId)}/edit?returnTo=${encodeURIComponent(returnTo)}`;

  let scope;
  try {
    scope = await requireCurrentRequestScope();
  } catch {
    redirect(`/auth/intent?returnTo=${encodeURIComponent(editPath)}`);
  }

  const baseline = await readAtomicJournalEditBaseline(scope, entryId).catch(
    () => null,
  );
  if (!baseline) notFound();

  const locale = await getRequestInterfaceLocale();
  const blockIdByMediaId = new Map(
    baseline.document.blocks.flatMap((block) =>
      block.type === "image" ? [[block.mediaAssetId, block.id] as const] : [],
    ),
  );
  const existingMedia = baseline.media.map((media) => ({
    mediaAssetId: media.mediaAssetId,
    blockId:
      blockIdByMediaId.get(media.mediaAssetId) ?? `cover_${media.mediaAssetId}`,
    generation: media.generation,
    previewUrl: media.publicUrl,
    width: media.intrinsicWidth,
    height: media.intrinsicHeight,
    focalX: media.focalX,
    focalY: media.focalY,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <JournalEntryEditComposer
        key={`${baseline.entry.id}:${baseline.entry.journal_revision}`}
        locale={locale}
        entryId={baseline.entry.id}
        title={baseline.entry.title}
        entryDate={journalEntryDateInputValue(baseline.entry.entry_date)}
        expectedRevision={Number(baseline.entry.journal_revision ?? 1)}
        initialDocument={baseline.document}
        existingMedia={existingMedia}
        initialCoverMediaAssetId={baseline.entry.cover_media_asset_id}
        returnTo={returnTo}
      />
    </main>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
