"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  createDocumentMutationRequestHeaders,
  useOptionalDocumentMutationGeneration,
} from "@/components/auth/document-mutation-recovery";
import {
  JournalCoverControls,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import {
  LocalJournalComposerStatus,
  LocalJournalPublicationDisclosure,
} from "@/components/garden/local-journal-composer-status";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import { useScrollToHashOnMount } from "@/lib/browser/hash-scroll";
import type { PlantObjectKind } from "@/db/schema";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { COMPOSER_PHOTO_ACCEPT } from "@/lib/garden/composer-photo-selection";
import {
  LocalJournalComposerError,
  useLocalJournalComposer,
} from "@/lib/garden/use-local-journal-composer";
import { getAtomicJournalCreateCopy } from "@/lib/garden/atomic-journal-create-copy";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import {
  createEmptyJournalDocument,
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import type {
  JournalMentionSelection,
  JournalMentionSuggestion,
} from "@/lib/garden/journal-mentions";
import {
  nextJournalTitleValue,
  suggestJournalEntryTitle,
} from "@/lib/garden/journal-title-prefill";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
} from "@/lib/owner-object-copy";
import {
  JournalMentionTypeaheadPanel,
  applyMentionSuggestion,
  mentionSelectionKey,
  parseJournalMentionSuggestions,
  toMentionSelection,
  type ActiveMentionToken,
  type MentionTypeaheadStatus,
} from "../../journal-mention-typeahead";

interface FollowUpEntryComposerProps {
  ownerUserId: string;
  locale: InterfaceLocale;
  objectId: string;
  objectDisplayName: string;
  objectKind: PlantObjectKind;
  today: string;
  initialClientMutationId: string;
  requiresFirstPublicationDisclosure: boolean;
}

type SubmitState = "idle" | "publishing" | "published" | "failed";

interface FollowUpEntryDraftFields {
  title: string;
  body: string;
  contentDocument: JournalDocumentV1 | null;
  entryDate: string;
}

export function FollowUpEntryComposer({
  locale,
  objectId,
  objectDisplayName,
  today,
  requiresFirstPublicationDisclosure,
}: FollowUpEntryComposerProps) {
  const workspaceCopy = getGardenWorkspaceCopy(locale);
  const atomicCopy = getAtomicJournalCreateCopy(locale);
  const documentMutation = useOptionalDocumentMutationGeneration();
  const ownerCopy = getOwnerObjectCopy(locale);
  useScrollToHashOnMount("follow-up-composer");
  const router = useRouter();
  const titleEditedByUserRef = useRef(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const structuredComposerRef = useRef<StructuredJournalComposerHandle | null>(
    null,
  );
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const localeMutationCountRef = useRef(0);
  const [draft, setDraft] = useState<FollowUpEntryDraftFields>({
    title: "",
    body: "",
    contentDocument: null,
    entryDate: today,
  });
  const [coverSelection, setCoverSelection] =
    useState<JournalCoverSelectionState>({ mode: "automatic" });
  const [pendingCoverInlineRemoval, setPendingCoverInlineRemoval] = useState<{
    mediaAssetId: string;
  } | null>(null);
  const coverCopy = getJournalCoverControlsCopy(locale);
  const [activeMentionToken, setActiveMentionToken] =
    useState<ActiveMentionToken | null>(null);
  const [mentionSelections, setMentionSelections] = useState<
    JournalMentionSelection[]
  >([]);
  const [topicTagInput, setTopicTagInput] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<
    JournalMentionSuggestion[]
  >([]);
  const [mentionStatus, setMentionStatus] =
    useState<MentionTypeaheadStatus>("idle");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [primaryMediaAssetId, setPrimaryMediaAssetId] = useState<string | null>(
    null,
  );
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState(atomicCopy.localOnly);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [localeMutationPending, setLocaleMutationPending] = useState(false);
  const local = useLocalJournalComposer({
    documentMutationGeneration: documentMutation?.transport,
    enabled: true,
    fallbackReturnTo: `/garden/objects/${objectId}`,
    dirty: Boolean(
      draft.title ||
      draft.body ||
      draft.contentDocument?.blocks.length ||
      photoFile,
    ),
  });
  const imageStates = useMemo(
    () =>
      new Map(
        local.media.items.map((item) => [
          item.mediaAssetId,
          {
            status: item.status,
            previewUrl: item.previewUrl,
            failureCode: item.failureCode,
          },
        ]),
      ),
    [local.media],
  );
  const persistenceFrozen = local.readOnly;

  useInterfaceLocaleChangeFormState({
    id: "follow-up-entry-composer-mutation",
    dirty: false,
    pending: localeMutationPending,
  });

  function beginLocaleMutation() {
    localeMutationCountRef.current += 1;
    setLocaleMutationPending(true);
  }

  function endLocaleMutation() {
    localeMutationCountRef.current = Math.max(
      0,
      localeMutationCountRef.current - 1,
    );
    if (localeMutationCountRef.current === 0) setLocaleMutationPending(false);
  }

  const photoHelp = localizedAtomicPhotoHelp(atomicCopy, {
    fileName: photoFile?.name ?? null,
    photoError,
    ready: primaryMediaAssetId !== null,
  });

  const hasSelectedPhoto = Boolean(photoFile || primaryMediaAssetId);

  useEffect(() => {
    if (!activeMentionToken) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMentionStatus("loading");

      try {
        const response = await fetch(
          `/api/garden/mentions/typeahead?q=${encodeURIComponent(
            activeMentionToken.query,
          )}`,
          {
            headers: createDocumentMutationRequestHeaders(
              documentMutation?.transport,
            ),
            signal: controller.signal,
          },
        );

        if (await documentMutation?.handleResponse(response)) {
          setMentionSuggestions([]);
          setMentionStatus("failed");
          return;
        }
        if (!response.ok) throw new Error("Mention suggestions unavailable.");

        const body = (await response.json()) as unknown;
        setMentionSuggestions(parseJournalMentionSuggestions(body));
        setMentionStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setMentionSuggestions([]);
        setMentionStatus("failed");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeMentionToken, documentMutation]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposerPersistenceFrozen()) return;

    beginLocaleMutation();
    try {
      if (isComposerPersistenceFrozen()) return;

      if (photoError) {
        setSubmitState("failed");
        setMessage(photoError);
        return;
      }

      let document: JournalDocumentV1;
      try {
        document = await buildDocument();
      } catch {
        setSubmitState("failed");
        setMessage(workspaceCopy.composer.photo.readError);
        return;
      }

      setSubmitState("publishing");
      setMessage(atomicCopy.publishing);

      try {
        const result = await local.publish({
          context: {
            target: "plant_object_entry",
            plantObjectId: objectId,
            entryDate: draft.entryDate,
            mentionSelections,
            topicTags: normalizeJournalTopicTagLabels(topicTagInput),
          },
          title: draft.title,
          document,
          coverMediaAssetId: selectedCoverMediaAssetId(
            coverSelection,
            document,
          ),
          disclosureAccepted,
        });
        setSubmitState("published");
        setMessage(atomicCopy.published);
        router.push(result.returnTo);
        router.refresh();
      } catch (error) {
        handleTransportBoundary(error);
        if (
          error instanceof LocalJournalComposerError &&
          error.code === "publication_cancelled"
        ) {
          setSubmitState("idle");
          setMessage(atomicCopy.localOnly);
          return;
        }
        setSubmitState("failed");
        setMessage(atomicCopy.failed);
      }
    } finally {
      endLocaleMutation();
    }
  }

  function handleCancel() {
    local.abandon();
    router.push(`/garden/objects/${objectId}`);
  }

  function handleTransportBoundary(error: unknown) {
    if (
      error instanceof LocalJournalComposerError &&
      typeof error.details?.documentMutationAdmission === "string"
    ) {
      documentMutation?.handleTransportResult(
        error.details.documentMutationAdmission as Parameters<
          NonNullable<typeof documentMutation>["handleTransportResult"]
        >[0],
      );
    }
    if (
      error instanceof LocalJournalComposerError &&
      error.details?.authIntentUrl
    ) {
      window.location.assign(error.details.authIntentUrl);
    }
  }

  async function buildDocument(): Promise<JournalDocumentV1> {
    return (
      (await structuredComposerRef.current?.flushLatest()) ??
      draft.contentDocument ??
      createEmptyJournalDocument()
    );
  }

  function updateDraft<K extends keyof FollowUpEntryDraftFields>(
    field: K,
    value: FollowUpEntryDraftFields[K],
  ) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) => {
      const next = { ...current, [field]: value };
      return field === "body" || field === "entryDate"
        ? withSuggestedTitle(next)
        : next;
    });
  }

  function updateTitle(value: string) {
    if (isComposerPersistenceFrozen()) return;
    titleEditedByUserRef.current = true;
    setDraft((current) => ({ ...current, title: value }));
  }

  function selectMentionSuggestion(suggestion: JournalMentionSuggestion) {
    if (isComposerPersistenceFrozen()) return;
    if (!activeMentionToken) return;

    const applied = applyMentionSuggestion(
      draft.body,
      activeMentionToken,
      suggestion,
    );

    setDraft((current) =>
      withSuggestedTitle({
        ...current,
        body: applied.body,
      }),
    );
    setMentionSelections((current) => {
      const selection = toMentionSelection(suggestion);
      return current.some(
        (item) => mentionSelectionKey(item) === mentionSelectionKey(selection),
      )
        ? current
        : [...current, selection];
    });
    setActiveMentionToken(null);
    setMentionSuggestions([]);
    setMentionStatus("idle");

    window.requestAnimationFrame(() => {
      bodyTextareaRef.current?.focus();
      bodyTextareaRef.current?.setSelectionRange(
        applied.cursorPosition,
        applied.cursorPosition,
      );
    });
  }

  function removeMentionSelection(selection: JournalMentionSelection) {
    if (isComposerPersistenceFrozen()) return;
    setMentionSelections((current) =>
      current.filter(
        (item) => mentionSelectionKey(item) !== mentionSelectionKey(selection),
      ),
    );
  }

  function updateTopicTagInput(value: string) {
    if (isComposerPersistenceFrozen()) return;
    setTopicTagInput(value);
  }

  function handlePhotoChange(file: File | undefined) {
    if (isComposerPersistenceFrozen()) return;
    setPhotoError(null);

    if (!file) {
      clearPhotoSelection(false);
      return;
    }

    try {
      const selected = primaryMediaAssetId
        ? local.replaceImage(primaryMediaAssetId, file)
        : local.selectImage(file, `cover_${crypto.randomUUID()}`);
      setPhotoFile(file);
      setPrimaryMediaAssetId(selected.mediaAssetId);
      setCoverSelection({
        mode: "separate",
        mediaAssetId: selected.mediaAssetId,
        previewUrl: null,
      });
      setDraft((current) => withSuggestedTitle(current, { hasPhoto: true }));
      void selected.ready.catch(() => {
        setPhotoError(atomicCopy.photoFailed);
      });
    } catch {
      setPhotoFile(null);
      setPhotoError(atomicCopy.photoFailed);
      resetPhotoInput();
      setDraft((current) => withSuggestedTitle(current, { hasPhoto: false }));
    }
  }

  function clearPhotoSelection(resetInput = true) {
    if (isComposerPersistenceFrozen()) return;
    if (primaryMediaAssetId) void local.removeImage(primaryMediaAssetId);
    setPhotoFile(null);
    setPrimaryMediaAssetId(null);
    if (
      coverSelection.mode === "separate" &&
      coverSelection.mediaAssetId === primaryMediaAssetId
    ) {
      setCoverSelection({ mode: "automatic" });
    }
    setPhotoError(null);
    if (resetInput) resetPhotoInput();
    setDraft((current) => withSuggestedTitle(current, { hasPhoto: false }));
  }

  function resetPhotoInput() {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }

  function isComposerPersistenceFrozen() {
    return local.readOnly;
  }

  function withSuggestedTitle(
    nextDraft: FollowUpEntryDraftFields,
    options: { hasPhoto?: boolean } = {},
  ): FollowUpEntryDraftFields {
    const suggestion = suggestJournalEntryTitle({
      entryDate: nextDraft.entryDate,
      objectLabel: objectDisplayName,
      body: nextDraft.body,
      hasPhoto: options.hasPhoto ?? Boolean(photoFile || primaryMediaAssetId),
    });

    return {
      ...nextDraft,
      title: nextJournalTitleValue({
        currentTitle: nextDraft.title,
        suggestion,
        titleEditedByUser: titleEditedByUserRef.current,
      }),
    };
  }

  function changeCover(next: JournalCoverSelectionState) {
    if (
      coverSelection.mode === "separate" &&
      coverSelection.mediaAssetId &&
      (next.mode !== "separate" ||
        next.mediaAssetId !== coverSelection.mediaAssetId)
    ) {
      void local.removeImage(coverSelection.mediaAssetId);
      if (primaryMediaAssetId === coverSelection.mediaAssetId) {
        setPrimaryMediaAssetId(null);
        setPhotoFile(null);
      }
    }
    setCoverSelection(next);
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-local-composer-kind="follow_up"
      data-local-composer-read-only={persistenceFrozen || undefined}
      className="grid gap-4"
    >
      <LocalJournalComposerStatus
        state={local.state}
        copy={atomicCopy}
        onCancelPublishing={local.cancelPublishing}
      />

      <fieldset disabled={persistenceFrozen} className="contents">
        <p className="text-sm leading-6 text-muted-foreground">
          {formatOwnerObjectTemplate(ownerCopy.composer.updating, {
            objectName: objectDisplayName,
          })}
        </p>

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {ownerCopy.composer.fields.whatChanged}
            </span>
          </div>
          <input type="hidden" name="body" value={draft.body} required />
          <StructuredJournalComposer
            locale={locale}
            labels={getStructuredJournalComposerLabels(locale)}
            initialDocument={draft.contentDocument ?? undefined}
            bindingReady
            disabled={persistenceFrozen}
            composerRef={structuredComposerRef}
            imageInsertionMode="immediate"
            imageStates={imageStates}
            onDocumentChange={(document) => {
              const plain = extractJournalDocumentPlainText(document);
              setDraft((current) =>
                withSuggestedTitle({
                  ...current,
                  body: plain || current.body,
                  contentDocument: document,
                }),
              );
            }}
            onSelectImageFile={async (file, blockId, mediaAssetId) => {
              const selected = local.selectImage(file, blockId, mediaAssetId);
              const ready = await selected.ready;
              return {
                mediaAssetId: selected.mediaAssetId,
                previewUrl: ready.previewUrl ?? undefined,
              };
            }}
            onRetryImage={(mediaAssetId) => local.retryImage(mediaAssetId)}
            onReplaceImage={(mediaAssetId, file) =>
              local.replaceImage(mediaAssetId, file)
            }
            onSetImageAsCover={(mediaAssetId) =>
              changeCover({ mode: "explicit_inline", mediaAssetId })
            }
            onRemoveImageBlock={(_blockId, mediaId) => {
              if (
                coverSelection.mode === "explicit_inline" &&
                coverSelection.mediaAssetId === mediaId
              ) {
                setPendingCoverInlineRemoval({ mediaAssetId: mediaId });
                return;
              }
              void local.removeImage(mediaId);
            }}
          />
          <JournalCoverControls
            copy={coverCopy}
            selection={withLocalCoverPreview(coverSelection, imageStates)}
            eligibleInline={listJournalDocumentImageMediaIds(
              draft.contentDocument ?? createEmptyJournalDocument(),
            ).map((mediaAssetId, index) => ({
              mediaAssetId,
              previewUrl: imageStates.get(mediaAssetId)?.previewUrl ?? null,
              label: `${coverCopy.useAsCover} ${index + 1}`,
            }))}
            disabled={persistenceFrozen}
            selectedLocalMediaState={
              coverSelection.mode === "explicit_inline" ||
              coverSelection.mode === "separate"
                ? imageStates.get(coverSelection.mediaAssetId ?? "")
                : undefined
            }
            onRetrySelectedLocal={(mediaAssetId) =>
              local.retryImage(mediaAssetId)
            }
            onSelectLocalSeparateFile={async (file) => {
              const currentId =
                coverSelection.mode === "separate"
                  ? coverSelection.mediaAssetId
                  : null;
              const selected = currentId
                ? local.replaceImage(currentId, file)
                : local.selectImage(file, `cover_${crypto.randomUUID()}`);
              return { mediaAssetId: selected.mediaAssetId };
            }}
            pendingInlineRemoval={pendingCoverInlineRemoval}
            onChange={changeCover}
            onResolveInlineRemoval={(choice) => {
              if (!pendingCoverInlineRemoval) return;
              if (choice === "cancel") {
                setPendingCoverInlineRemoval(null);
                return;
              }
              if (choice === "keep_as_cover") {
                setCoverSelection({
                  mode: "separate",
                  mediaAssetId: pendingCoverInlineRemoval.mediaAssetId,
                  previewUrl:
                    imageStates.get(pendingCoverInlineRemoval.mediaAssetId)
                      ?.previewUrl ?? null,
                });
              } else if (choice === "remove_everywhere") {
                void local.removeImage(pendingCoverInlineRemoval.mediaAssetId);
                setCoverSelection({ mode: "automatic" });
              }
              setPendingCoverInlineRemoval(null);
            }}
          />
          <JournalMentionTypeaheadPanel
            locale={locale}
            status={mentionStatus}
            suggestions={mentionSuggestions}
            selections={mentionSelections}
            onSelect={selectMentionSuggestion}
            onRemove={removeMentionSelection}
          />
        </div>

        <div className="flex flex-col gap-2 border-y border-border py-3">
          <span className="text-sm font-medium text-foreground">
            {workspaceCopy.composer.fields.optionalPhoto}
          </span>
          <input
            ref={photoInputRef}
            type="file"
            accept={COMPOSER_PHOTO_ACCEPT}
            capture="environment"
            aria-label={workspaceCopy.composer.photo.choose}
            onChange={(event) =>
              handlePhotoChange(event.currentTarget.files?.[0])
            }
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="self-start"
            data-photo-picker-control="true"
            onClick={() => photoInputRef.current?.click()}
          >
            <UploadCloud className="size-4" />
            {workspaceCopy.composer.photo.choose}
          </Button>
          {hasSelectedPhoto ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => clearPhotoSelection()}
            >
              <X className="size-4" />
              {workspaceCopy.composer.fields.removePhoto}
            </Button>
          ) : null}
          <p
            className={
              photoError
                ? "text-xs leading-5 text-destructive"
                : "text-xs leading-5 text-muted-foreground"
            }
          >
            {photoHelp}
          </p>
        </div>

        <details className="group border-y border-border py-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-foreground marker:text-muted-foreground sm:min-h-0">
            {workspaceCopy.composer.fields.moreDetails}
            <span className="ml-2 font-normal text-muted-foreground">
              {ownerCopy.composer.fields.detailsHint}
            </span>
          </summary>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground sm:col-span-2">
                {workspaceCopy.composer.fields.entryTitle}
                <input
                  name="title"
                  required
                  maxLength={140}
                  value={draft.title}
                  onChange={(event) => updateTitle(event.target.value)}
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                  placeholder={ownerCopy.composer.fields.titlePlaceholder}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                {workspaceCopy.composer.fields.date}
                <input
                  type="date"
                  name="entryDate"
                  value={draft.entryDate}
                  onChange={(event) =>
                    updateDraft("entryDate", event.target.value)
                  }
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              {workspaceCopy.composer.fields.tags}
              <input
                name="topicTags"
                maxLength={160}
                value={topicTagInput}
                onChange={(event) => updateTopicTagInput(event.target.value)}
                className="h-11 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                placeholder={workspaceCopy.composer.fields.tagsPlaceholder}
              />
            </label>
          </div>
        </details>

        {requiresFirstPublicationDisclosure ? (
          <LocalJournalPublicationDisclosure
            accepted={disclosureAccepted}
            disabled={persistenceFrozen}
            copy={atomicCopy}
            onChange={setDisclosureAccepted}
          />
        ) : null}
      </fieldset>

      <p
        className={
          submitState === "failed"
            ? "text-sm text-destructive"
            : "text-sm text-muted-foreground"
        }
      >
        {message}
      </p>

      <div className="sticky bottom-2 z-10 flex items-center gap-2 border border-border bg-background p-3 shadow-sm sm:static sm:flex-wrap sm:border-0 sm:p-0 sm:shadow-none">
        <Button
          type="submit"
          data-auth-intent-control="save"
          disabled={
            submitState === "publishing" ||
            persistenceFrozen ||
            (requiresFirstPublicationDisclosure && !disclosureAccepted)
          }
          className="min-h-11 min-w-0 flex-1 sm:min-h-8 sm:flex-none"
        >
          <UploadCloud className="size-4" />
          {atomicCopy.publish}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleCancel}
          className="min-h-11 shrink-0 text-muted-foreground sm:min-h-8"
        >
          {workspaceCopy.composer.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

function selectedCoverMediaAssetId(
  selection: JournalCoverSelectionState,
  document: JournalDocumentV1,
) {
  if (selection.mode === "none") return null;
  if (selection.mode === "automatic") {
    return listJournalDocumentImageMediaIds(document)[0] ?? null;
  }
  return selection.mediaAssetId ?? null;
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

function localizedAtomicPhotoHelp(
  copy: ReturnType<typeof getAtomicJournalCreateCopy>,
  {
    fileName,
    photoError,
    ready,
  }: {
    fileName: string | null;
    photoError: string | null;
    ready: boolean;
  },
) {
  if (photoError) return photoError;
  if (ready) return copy.photoReady;
  if (!fileName) return copy.photoEmpty;
  return copy.photoPreparing;
}
