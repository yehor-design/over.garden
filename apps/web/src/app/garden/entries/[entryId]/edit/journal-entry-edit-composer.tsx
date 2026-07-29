"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  JournalCoverControls,
  journalCoverSelectionToClaimInput,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import { OwnerMediaFocalPanel } from "@/components/media/owner-media-focal-panel";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { Button } from "@/components/ui/button";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import { getOwnerMediaFocalPanelCopy } from "@/lib/media/owner-media-focal-copy";
import type { JournalDocumentV1 } from "@/lib/garden/journal-document";
import {
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
} from "@/lib/garden/journal-document";
import { createComposerPhotoIntent } from "@/lib/garden/composer-photo-selection";
import { useInlineMediaSelection } from "@/lib/garden/use-inline-media-selection";
import { uploadComposerPhotoIntent } from "@/lib/offline/journal-entry-sync";
import type { PublicLocale } from "@/lib/public-localization";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";

export function JournalEntryEditComposer({
  locale,
  entryId,
  title: initialTitle,
  entryDate: initialEntryDate,
  expectedRevision: initialRevision,
  initialDocument,
  documentUnavailable,
  imagePreviewUrls,
  initialCoverMediaAssetId = null,
}: {
  locale: PublicLocale;
  entryId: string;
  title: string;
  entryDate: string;
  expectedRevision: number;
  initialDocument: JournalDocumentV1 | null;
  documentUnavailable: boolean;
  imagePreviewUrls: Record<string, string>;
  initialCoverMediaAssetId?: string | null;
}) {
  const router = useRouter();
  const composerRef = useRef<StructuredJournalComposerHandle | null>(null);
  const inlineMedia = useInlineMediaSelection(entryId);
  const [title, setTitle] = useState(initialTitle);
  const [entryDate, setEntryDate] = useState(initialEntryDate);
  const [document, setDocument] = useState<JournalDocumentV1 | null>(
    initialDocument,
  );
  const [expectedRevision, setExpectedRevision] = useState(initialRevision);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cover, setCover] = useState<JournalCoverSelectionState>(() => {
    if (!initialCoverMediaAssetId) return { mode: "automatic" };
    const inlineIds = initialDocument
      ? listJournalDocumentImageMediaIds(initialDocument)
      : [];
    if (inlineIds.includes(initialCoverMediaAssetId)) {
      return {
        mode: "explicit_inline",
        mediaAssetId: initialCoverMediaAssetId,
        previewUrl: imagePreviewUrls[initialCoverMediaAssetId] ?? null,
      };
    }
    return {
      mode: "separate",
      mediaAssetId: initialCoverMediaAssetId,
      previewUrl: imagePreviewUrls[initialCoverMediaAssetId] ?? null,
    };
  });
  const [pendingInlineRemoval, setPendingInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const labels = getStructuredJournalComposerLabels(locale);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const focalCopy = getOwnerMediaFocalPanelCopy(locale);
  const previewMap = useMemo(
    () => new Map(Object.entries(imagePreviewUrls)),
    [imagePreviewUrls],
  );
  const focalTarget = useMemo(() => {
    if (cover.mode === "explicit_inline" || cover.mode === "separate") {
      const mediaAssetId = cover.mediaAssetId;
      if (!mediaAssetId) return null;
      const previewUrl =
        cover.previewUrl ?? previewMap.get(mediaAssetId) ?? null;
      if (!previewUrl) return null;
      return { mediaAssetId, previewUrl };
    }
    const firstInline = document
      ? listJournalDocumentImageMediaIds(document)[0]
      : null;
    if (!firstInline) return null;
    const previewUrl = previewMap.get(firstInline) ?? null;
    if (!previewUrl) return null;
    return { mediaAssetId: firstInline, previewUrl };
  }, [cover, document, previewMap]);
  const eligibleInline = useMemo(() => {
    if (!document) return [];
    return listJournalDocumentImageMediaIds(document).map(
      (mediaAssetId, index) => ({
        mediaAssetId,
        previewUrl: previewMap.get(mediaAssetId) ?? null,
        label: `${coverCopy.useAsCover} ${index + 1}`,
      }),
    );
  }, [coverCopy.useAsCover, document, previewMap]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const flushed = (await composerRef.current?.flushLatest()) ?? document;
      if (!flushed) {
        setMessage(labels.failureBody);
        return;
      }
      const response = await fetch(`/api/garden/entries/${entryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          entryDate,
          contentDocument: flushed,
          body: extractJournalDocumentPlainText(flushed),
          expectedRevision,
          clientMutationId: crypto.randomUUID(),
          cover: journalCoverSelectionToClaimInput(cover),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        currentRevision?: number;
        entry?: { journalRevision?: number };
      } | null;
      if (response.status === 409) {
        setMessage(payload?.error ?? "Conflict");
        if (payload?.currentRevision) {
          setExpectedRevision(payload.currentRevision);
        }
        return;
      }
      if (!response.ok) {
        setMessage(payload?.error ?? labels.failureBody);
        return;
      }
      if (payload?.entry?.journalRevision) {
        setExpectedRevision(payload.entry.journalRevision);
      }
      router.refresh();
      setMessage(labels.saveLabel);
    } finally {
      setSaving(false);
    }
  }

  if (documentUnavailable) {
    return (
      <section className="grid gap-3">
        <h1 className="text-2xl font-medium">{labels.unavailableTitle}</h1>
        <p className="text-muted-foreground">{labels.unavailableBody}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-4" data-journal-entry-edit="true">
      <label className="grid gap-1">
        <span className="text-sm font-medium">{labels.titleLabel}</span>
        <input
          className="h-10 rounded-md border border-input px-3"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label={labels.titleLabel}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium">{labels.dateLabel}</span>
        <input
          type="date"
          className="h-10 rounded-md border border-input px-3"
          value={entryDate}
          onChange={(event) => setEntryDate(event.target.value)}
          aria-label={labels.dateLabel}
        />
      </label>
      <StructuredJournalComposer
        locale={locale}
        labels={labels}
        initialDocument={document}
        imagePreviewUrls={previewMap}
        composerRef={composerRef}
        onDocumentChange={setDocument}
        onSelectImageFile={async (file, blockId) => {
          const reservation = inlineMedia.reserve(file, {});
          try {
            const intent = await createComposerPhotoIntent(file);
            const mediaAssetId = await uploadComposerPhotoIntent(
              intent,
              `/garden/entries/${entryId}/edit`,
            );
            if (!mediaAssetId) throw new Error(labels.failureBody);
            const previewUrl = URL.createObjectURL(file);
            inlineMedia.commit(reservation, blockId, previewUrl);
            return { mediaAssetId, previewUrl };
          } catch (error) {
            inlineMedia.release(reservation);
            throw error;
          }
        }}
        onRemoveImageBlock={(blockId) => {
          inlineMedia.revoke(blockId);
          const block = document?.blocks.find((item) => item.id === blockId);
          const mediaId = block?.type === "image" ? block.mediaAssetId : null;
          if (
            mediaId &&
            cover.mode === "explicit_inline" &&
            cover.mediaAssetId === mediaId
          ) {
            setPendingInlineRemoval({ mediaAssetId: mediaId });
          }
        }}
      />
      <JournalCoverControls
        copy={coverCopy}
        selection={cover}
        eligibleInline={eligibleInline}
        disabled={saving}
        pendingInlineRemoval={pendingInlineRemoval}
        onChange={setCover}
        onResolveInlineRemoval={(choice) => {
          if (!pendingInlineRemoval) return;
          if (choice === "cancel") {
            setPendingInlineRemoval(null);
            return;
          }
          if (choice === "keep_as_cover") {
            setCover({
              mode: "separate",
              mediaAssetId: pendingInlineRemoval.mediaAssetId,
              previewUrl:
                previewMap.get(pendingInlineRemoval.mediaAssetId) ?? null,
            });
          } else {
            setCover({ mode: "automatic" });
          }
          setPendingInlineRemoval(null);
        }}
      />
      {focalTarget ? (
        <OwnerMediaFocalPanel
          mediaAssetId={focalTarget.mediaAssetId}
          imageUrl={focalTarget.previewUrl}
          expectedRevision={expectedRevision}
          copy={focalCopy}
          disabled={saving}
          onSaved={({ journalRevision }) => {
            if (journalRevision != null) setExpectedRevision(journalRevision);
          }}
        />
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {labels.saveLabel}
        </Button>
        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </section>
  );
}
