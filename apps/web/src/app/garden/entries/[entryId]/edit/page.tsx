import { notFound, redirect } from "next/navigation";

import { JournalEntryEditComposer } from "@/app/garden/entries/[entryId]/edit/journal-entry-edit-composer";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { db } from "@/db";
import { readJournalDocumentFromEntry } from "@/server/journal-document-persistence";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export const runtime = "nodejs";

export default async function GardenEntryEditPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  let scope;
  try {
    scope = await requireCurrentRequestScope();
  } catch {
    redirect(`/auth/intent?returnTo=${encodeURIComponent(`/garden/entries/${entryId}/edit`)}`);
  }

  const entry = await db
    .selectFrom("journal_entries")
    .selectAll()
    .where("id", "=", entryId)
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirst();

  if (!entry || entry.lifecycle_state !== "active" || entry.public_gone_at) {
    notFound();
  }

  const media = await db
    .selectFrom("media_assets")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "=", entry.id)
    .where("status", "=", "processed")
    .orderBy("document_position", "asc")
    .orderBy("created_at", "asc")
    .execute();

  const documentRead = readJournalDocumentFromEntry(entry);
  const locale = await getRequestInterfaceLocale();
  const previewUrls = new Map(
    media
      .filter((item) => item.derivative_key)
      .map((item) => [
        item.id,
        getPublicDerivativeUrl(item.derivative_key!),
      ]),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <JournalEntryEditComposer
        locale={locale}
        entryId={entry.id}
        title={entry.title}
        entryDate={String(entry.entry_date).slice(0, 10)}
        expectedRevision={Number(entry.journal_revision ?? 1)}
        initialDocument={
          documentRead.status === "unavailable" ? null : documentRead.document
        }
        documentUnavailable={documentRead.status === "unavailable"}
        imagePreviewUrls={Object.fromEntries(previewUrls)}
        initialCoverMediaAssetId={entry.cover_media_asset_id}
      />
    </main>
  );
}
