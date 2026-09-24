"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useOptionalOwnerScope } from "@/components/auth/owner-scope";
import {
  journalCoverPhotoLabel,
  JournalCoverControls,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import { LocalJournalComposerStatus } from "@/components/garden/local-journal-composer-status";
import {
  isComposerEscape,
  UnpublishedWorkGuard,
} from "@/components/garden/unpublished-work-guard";
import { EntryActionsMenu } from "@/components/garden/entry-actions-menu";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import {
  JournalMediaReadiness,
  summarizeJournalMediaReadiness,
} from "@/components/garden/journal-media-readiness";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { FocalPointControl } from "@/components/media/focal-point-control";
import type { JournalImageUiState } from "@/components/garden/lexical-journal/journal-lexical-image-node";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { getAtomicJournalEditCopy } from "@/lib/garden/atomic-journal-edit-copy";
import { getEntryComposerCopy } from "@/lib/entry-composer-copy";
import {
  destinationDetail,
  type OwnedDestination,
} from "@/lib/garden/owned-destinations";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";
import {
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import {
  LocalJournalComposerError,
  useLocalJournalComposer,
} from "@/lib/garden/use-local-journal-composer";
import { stableJson } from "@/lib/media/ephemeral-staging-crypto";
import { getOwnerMediaFocalPanelCopy } from "@/lib/media/owner-media-focal-copy";
import type { PublicLocale } from "@/lib/public-localization";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface JournalEntryEditExistingMedia {
  mediaAssetId: string;
  blockId: string;
  generation: number;
  previewUrl: string;
  width: number | null;
  height: number | null;
  focalX: number;
  focalY: number;
}

export function JournalEntryEditComposer({
  locale,
  entryId,
  title: initialTitle,
  entryDate: initialEntryDate,
  expectedRevision,
  initialDocument,
  existingMedia,
  initialCoverMediaAssetId = null,
  returnTo,
  destination = null,
  publicHref = null,
  deleteAction,
  afterDeleteHref,
}: {
  locale: PublicLocale;
  entryId: string;
  title: string;
  entryDate: string;
  expectedRevision: number;
  initialDocument: JournalDocumentV1;
  existingMedia: readonly JournalEntryEditExistingMedia[];
  initialCoverMediaAssetId?: string | null;
  returnTo: string;
  /** Where the entry is written: named, not changed, while editing. */
  destination?: OwnedDestination | null;
  /** The entry's one public address, for its menu. */
  publicHref?: string | null;
  /** Deletes the entry (ADR-0021); only the entry's own menu offers it. */
  deleteAction?: (
    previousState: unknown,
    formData: FormData,
  ) => Promise<unknown>;
  /** Where the owner lands once the entry is gone: never the entry's page. */
  afterDeleteHref?: string;
}) {
  const router = useRouter();
  const documentMutation = useOptionalOwnerScope();
  const composerRef = useRef<StructuredJournalComposerHandle | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeRequestRef = useRef<((leave: () => void) => void) | null>(null);
  const [authRecoveryUrl, setAuthRecoveryUrl] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [entryDate, setEntryDate] = useState(initialEntryDate);
  const [document, setDocument] = useState(initialDocument);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingInlineRemoval, setPendingInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const initialInlineIds = useMemo(
    () => listJournalDocumentImageMediaIds(initialDocument),
    [initialDocument],
  );
  const [cover, setCover] = useState<JournalCoverSelectionState>(() => {
    if (!initialCoverMediaAssetId) return { mode: "automatic" };
    if (initialInlineIds.includes(initialCoverMediaAssetId)) {
      return {
        mode: "explicit_inline",
        mediaAssetId: initialCoverMediaAssetId,
      };
    }
    return {
      mode: "separate",
      mediaAssetId: initialCoverMediaAssetId,
    };
  });
  const initialCoverKey = initialCoverMediaAssetId
    ? `media:${initialCoverMediaAssetId}`
    : "automatic";
  const [focalByMediaId, setFocalByMediaId] = useState(
    () =>
      new Map(
        existingMedia.map((media) => [
          media.mediaAssetId,
          { x: media.focalX, y: media.focalY },
        ]),
      ),
  );
  const labels = getStructuredJournalComposerLabels(locale);
  const editCopy = getAtomicJournalEditCopy(locale);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const focalCopy = getOwnerMediaFocalPanelCopy(locale);
  const safeReturnTo = normalizeJournalComposerReturnTo(returnTo, "/garden");
  const dirty =
    title !== initialTitle ||
    entryDate !== initialEntryDate ||
    stableJson(document) !== stableJson(initialDocument) ||
    coverSelectionKey(cover) !== initialCoverKey ||
    mediaDirty ||
    existingMedia.some((media) => {
      const focal = focalByMediaId.get(media.mediaAssetId);
      return focal?.x !== media.focalX || focal?.y !== media.focalY;
    });
  const local = useLocalJournalComposer({
    fallbackReturnTo: safeReturnTo,
    dirty,
    existingMedia,
  });
  const imageStates = useMemo(() => {
    const states = new Map<string, JournalImageUiState>(
      existingMedia.map((media) => [
        media.mediaAssetId,
        {
          status: "ready" as const,
          previewUrl: media.previewUrl,
          failureCode: null,
          source: "existing" as const,
        },
      ]),
    );
    for (const item of local.media.items) {
      states.set(item.mediaAssetId, {
        status: item.status,
        previewUrl: item.previewUrl,
        failureCode: item.failureCode,
        source: item.source,
      });
    }
    return states;
  }, [existingMedia, local.media.items]);
  const inlineIds = listJournalDocumentImageMediaIds(document);
  const selectedCoverId = selectedCoverMediaAssetId(cover);
  // A failure names the photo's remedy only when there is a photo to fix.
  const statusCopy =
    inlineIds.length > 0 || selectedCoverId !== null
      ? editCopy
      : { ...editCopy, failed: editCopy.failedWithoutPhoto };
  const readiness = summarizeJournalMediaReadiness(
    selectedCoverId && !inlineIds.includes(selectedCoverId)
      ? [...inlineIds, selectedCoverId]
      : inlineIds,
    imageStates,
  );
  const focalTargetId = selectedCoverId ?? inlineIds[0] ?? null;
  const focalTarget = focalTargetId
    ? {
        mediaAssetId: focalTargetId,
        imageUrl: imageStates.get(focalTargetId)?.previewUrl ?? null,
        focal: focalByMediaId.get(focalTargetId) ?? { x: 0.5, y: 0.5 },
      }
    : null;
  const persistenceFrozen = local.readOnly;

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const flushed = (await composerRef.current?.flushLatest()) ?? document;
    setDocument(flushed);
    setCopied(false);
    setAuthRecoveryUrl(null);
    try {
      const result = await local.publishEdit({
        entryId,
        expectedRevision,
        title,
        entryDate,
        document: flushed,
        coverMediaAssetId: selectedCoverMediaAssetId(cover),
        focalPoints: finalMediaPoints(flushed, cover, focalByMediaId),
        returnTo: safeReturnTo,
      });
      router.push(result.returnTo);
      router.refresh();
    } catch (error) {
      handleTransportBoundary(error);
      if (
        error instanceof LocalJournalComposerError &&
        error.code === "journal_aggregate_conflict"
      ) {
        setConflictOpen(true);
      }
    }
  }

  function handleTransportBoundary(error: unknown) {
    if (
      error instanceof LocalJournalComposerError &&
      typeof error.details?.mutationScope === "string"
    ) {
      documentMutation?.handleActionResult(error.details);
    }
    // Leaving for sign-in would take the edit with it: it exists only in this
    // tab. Sign-in happens in another one, and Save works again from here
    // (`OVE-488` criterion 3).
    if (
      error instanceof LocalJournalComposerError &&
      error.details?.authIntentUrl
    ) {
      setAuthRecoveryUrl(error.details.authIntentUrl);
    } else if (
      error instanceof LocalJournalComposerError &&
      error.details?.mutationScope === "session_required"
    ) {
      setAuthRecoveryUrl(
        buildSignInHref({
          returnTo: `${window.location.pathname}${window.location.search}`,
          // The words stay in this tab; the one that opens says so and
          // does not open an empty composer beside them (`OVE-504`).
          notice: "return-to-tab",
        }),
      );
    }
  }

  // Close asks first only when there is something to lose (`OVE-488`
  // criterion 2): the guard's one dialog, the same for Back and a link out.
  function close() {
    const leave = () => {
      local.abandon();
      router.push(safeReturnTo);
    };
    if (closeRequestRef.current) closeRequestRef.current(leave);
    else leave();
  }

  function ensureFocal(mediaAssetId: string) {
    setFocalByMediaId((current) => {
      if (current.has(mediaAssetId)) return current;
      const next = new Map(current);
      next.set(mediaAssetId, { x: 0.5, y: 0.5 });
      return next;
    });
  }

  function changeCover(next: JournalCoverSelectionState) {
    if (
      cover.mode === "separate" &&
      cover.mediaAssetId &&
      (next.mode !== "separate" || next.mediaAssetId !== cover.mediaAssetId)
    ) {
      void local.removeImage(cover.mediaAssetId);
      setMediaDirty(true);
    }
    setCover(next);
  }

  async function copyLocalChanges() {
    const flushed = (await composerRef.current?.flushLatest()) ?? document;
    const plainText = [
      title.trim(),
      entryDate,
      extractJournalDocumentPlainText(flushed).trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form
      className="grid gap-4"
      data-local-composer-kind="edit_entry"
      data-local-composer-read-only={persistenceFrozen || undefined}
      onSubmit={(event) => {
        // Only this form's own submit is a save; a form in a portal below it
        // — the entry's delete confirmation — bubbles here through React.
        if (event.target !== event.currentTarget) return;
        void save(event);
      }}
      onKeyDown={(event) => {
        if (!isComposerEscape(event)) return;
        event.preventDefault();
        close();
      }}
    >
      {/* Where the entry is and what can be done to it as a whole: the
          destination named, and the entry's own menu — the only place its
          deletion lives, apart from Save (`OVE-488` criteria 1 and 4). */}
      <div
        data-entry-edit-destination="true"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
      >
        <p className="min-w-0 text-body-sm">
          {destination ? (
            <>
              <span className="text-text-muted">
                {getEntryComposerCopy(locale).writingTo}
              </span>{" "}
              <span
                className="font-medium break-words text-text-heading"
                data-entry-edit-destination-name="true"
              >
                {destination.displayName}
              </span>
              <span className="text-text-muted">
                {" · "}
                {destinationDetail(destination, locale)}
              </span>
            </>
          ) : null}
        </p>
        {deleteAction ? (
          <EntryActionsMenu
            locale={locale}
            entryId={entryId}
            entryTitle={initialTitle}
            objectId={destination?.kind === "object" ? destination.id : null}
            publicHref={publicHref}
            deleteAction={deleteAction}
            afterDeleteHref={afterDeleteHref ?? "/garden"}
          />
        ) : null}
      </div>
      <LocalJournalComposerStatus
        state={local.state}
        lease={local.media.lease}
        copy={statusCopy}
        onCancelPublishing={local.cancelPublishing}
      />
      {/* The same loss, in the edit composer's own words: here the work is
          saved rather than published (`OVE-458` AC5). */}
      <UnpublishedWorkGuard
        active={dirty && local.state.status !== "published"}
        closeRequestRef={closeRequestRef}
        copy={{
          leaveTitle: editCopy.discardTitle,
          leaveDescription: editCopy.discardBody,
          leaveConfirm: editCopy.discardChanges,
          leaveCancel: editCopy.keepEditing,
        }}
      />

      <fieldset disabled={persistenceFrozen} className="contents">
        <Field label={labels.titleLabel} id="journal-entry-edit-title" required>
          <Input
            value={title}
            maxLength={140}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </Field>
        <Field label={labels.dateLabel} id="journal-entry-edit-date" required>
          <Input
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.currentTarget.value)}
          />
        </Field>
        <StructuredJournalComposer
          locale={locale}
          labels={labels}
          initialDocument={initialDocument}
          bindingReady
          disabled={persistenceFrozen}
          composerRef={composerRef}
          imageInsertionMode="immediate"
          imageStates={imageStates}
          coverMediaAssetId={
            cover.mode === "automatic"
              ? (inlineIds[0] ?? null)
              : selectedCoverId
          }
          onDocumentChange={setDocument}
          onSelectImageFile={async (file, blockId, mediaAssetId) => {
            const selected = local.selectImage(file, blockId, mediaAssetId);
            ensureFocal(selected.mediaAssetId);
            setMediaDirty(true);
            const ready = await selected.ready;
            return {
              mediaAssetId: selected.mediaAssetId,
              previewUrl: ready.previewUrl ?? undefined,
            };
          }}
          onRetryImage={(mediaAssetId) => local.retryImage(mediaAssetId)}
          onReplaceImage={(mediaAssetId, file) => {
            setMediaDirty(true);
            local.replaceImage(mediaAssetId, file);
          }}
          onSetImageAsCover={(mediaAssetId) =>
            changeCover({ mode: "explicit_inline", mediaAssetId })
          }
          onRemoveImageBlock={(_blockId, mediaAssetId) => {
            setMediaDirty(true);
            if (
              cover.mode === "explicit_inline" &&
              cover.mediaAssetId === mediaAssetId
            ) {
              setPendingInlineRemoval({ mediaAssetId });
              return;
            }
            void local.removeImage(mediaAssetId);
          }}
        />
        <JournalCoverControls
          copy={coverCopy}
          selection={withLocalCoverPreview(cover, imageStates)}
          eligibleInline={inlineIds.map((mediaAssetId, index) => ({
            mediaAssetId,
            previewUrl: imageStates.get(mediaAssetId)?.previewUrl ?? null,
            label: journalCoverPhotoLabel(coverCopy, index),
          }))}
          disabled={persistenceFrozen}
          selectedLocalMediaState={
            cover.mode === "explicit_inline" || cover.mode === "separate"
              ? imageStates.get(cover.mediaAssetId ?? "")
              : undefined
          }
          onRetrySelectedLocal={(mediaAssetId) =>
            local.retryImage(mediaAssetId)
          }
          onSelectLocalSeparateFile={async (file) => {
            const currentId =
              cover.mode === "separate" ? cover.mediaAssetId : null;
            const selected = currentId
              ? local.replaceImage(currentId, file)
              : local.selectImage(file, `cover_${crypto.randomUUID()}`);
            ensureFocal(selected.mediaAssetId);
            setMediaDirty(true);
            return { mediaAssetId: selected.mediaAssetId };
          }}
          pendingInlineRemoval={pendingInlineRemoval}
          onChange={changeCover}
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
                  imageStates.get(pendingInlineRemoval.mediaAssetId)
                    ?.previewUrl ?? null,
              });
            } else {
              void local.removeImage(pendingInlineRemoval.mediaAssetId);
              setCover({ mode: "automatic" });
            }
            setPendingInlineRemoval(null);
          }}
        />
        {focalTarget?.imageUrl ? (
          <FocalPointControl
            imageUrl={focalTarget.imageUrl}
            focal={focalTarget.focal}
            copy={focalCopy}
            disabled={persistenceFrozen}
            onChange={(next) => {
              setFocalByMediaId((current) => {
                const updated = new Map(current);
                updated.set(focalTarget.mediaAssetId, next);
                return updated;
              });
            }}
          />
        ) : null}
      </fieldset>

      {authRecoveryUrl ? (
        <Callout
          tone="warning"
          live="assertive"
          data-entry-edit-session="ended"
          actions={
            <a
              href={authRecoveryUrl}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ size: "sm" })}
            >
              {editCopy.signInNewTab}
            </a>
          }
        >
          <p>{editCopy.sessionEnded}</p>
        </Callout>
      ) : null}

      <JournalMediaReadiness summary={readiness} labels={labels} />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={saveButtonRef}
          type="submit"
          disabled={persistenceFrozen || !dirty}
        >
          {editCopy.save}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void copyLocalChanges()}
        >
          {editCopy.copyLocalChanges}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={persistenceFrozen}
          data-entry-edit-cancel="true"
          onClick={close}
        >
          {editCopy.cancelEditing}
        </Button>
      </div>
      {copied ? (
        <p className="text-body-sm text-text-muted" role="status">
          {editCopy.localChangesCopied}
        </p>
      ) : null}

      <AlertDialog
        open={conflictOpen}
        onOpenChange={(open) => setConflictOpen(open)}
      >
        <AlertDialogContent
          data-atomic-journal-edit-conflict="true"
          finalFocus={saveButtonRef}
        >
          <AlertDialogTitle>{editCopy.conflictTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {editCopy.conflictBody}
          </AlertDialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose
              render={
                <Button type="button" variant="secondary">
                  {editCopy.closeConflict}
                </Button>
              }
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyLocalChanges()}
            >
              {editCopy.copyLocalChanges}
            </Button>
            <Button type="button" onClick={() => window.location.reload()}>
              {editCopy.reloadLatest}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function selectedCoverMediaAssetId(selection: JournalCoverSelectionState) {
  if (selection.mode === "none") return null;
  // A null canonical pointer means automatic presentation. Preserve that
  // distinction during unrelated edits instead of silently pinning the first
  // inline image as an explicit cover.
  if (selection.mode === "automatic") return null;
  return selection.mediaAssetId ?? null;
}

function finalMediaPoints(
  document: JournalDocumentV1,
  cover: JournalCoverSelectionState,
  focalByMediaId: ReadonlyMap<string, { x: number; y: number }>,
) {
  const mediaIds = listJournalDocumentImageMediaIds(document);
  const coverId = selectedCoverMediaAssetId(cover);
  if (coverId && !mediaIds.includes(coverId)) mediaIds.push(coverId);
  return mediaIds.map((mediaAssetId) => ({
    mediaAssetId,
    ...(focalByMediaId.get(mediaAssetId) ?? { x: 0.5, y: 0.5 }),
  }));
}

function coverSelectionKey(selection: JournalCoverSelectionState) {
  if (selection.mode === "automatic" || selection.mode === "none") {
    return selection.mode;
  }
  return `media:${selection.mediaAssetId ?? ""}`;
}

function withLocalCoverPreview(
  selection: JournalCoverSelectionState,
  states: ReadonlyMap<string, { previewUrl: string | null }>,
): JournalCoverSelectionState {
  if (selection.mode !== "explicit_inline" && selection.mode !== "separate") {
    return selection;
  }
  return {
    ...selection,
    previewUrl: states.get(selection.mediaAssetId ?? "")?.previewUrl ?? null,
  };
}
