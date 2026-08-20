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
  journalCoverSelectionToClaimInput,
  type JournalCoverSelectionState,
} from "@/components/garden/journal-cover-controls";
import { OnlineJournalComposerStatus } from "@/components/garden/online-journal-composer-status";
import { StructuredJournalComposer } from "@/components/garden/structured-journal-composer";
import type { StructuredJournalComposerHandle } from "@/components/garden/structured-journal-composer";
import { useInterfaceLocaleChangeFormState } from "@/components/site-shell/interface-locale-change-boundary";
import { useScrollToHashOnMount } from "@/lib/browser/hash-scroll";
import type { PlantObjectKind } from "@/db/schema";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  clearComposerPhotoIntent,
  COMPOSER_PHOTO_ACCEPT,
  composerPhotoSelectionError,
  createComposerPhotoIntent,
  type OnlineComposerPhotoIntent,
} from "@/lib/garden/composer-photo-selection";
import { useInlineMediaSelection } from "@/lib/garden/use-inline-media-selection";
import {
  OnlineJournalSubmitError,
  uploadOnlineComposerPhoto,
} from "@/lib/garden/online-journal-submit";
import { useOnlineJournalComposer } from "@/lib/garden/use-online-journal-composer";
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
import {
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import {
  JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
  type JournalEntryDraftPayloadV1,
  type JournalEntryDraftReceiptV1,
} from "@/lib/garden/entry-contracts";
import { buildFollowUpValuePulseReadbackUrl } from "@/lib/garden/follow-up-value-pulse";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
  type OwnerObjectCopy,
} from "@/lib/owner-object-copy";
import type { VisualFixtureCreationScenarioEvidence } from "@/lib/visual-fixtures/manifest";
import { runVisualJournalCreationScenario } from "@/lib/visual-fixtures/journal-creation-client";
import {
  JournalMentionTypeaheadPanel,
  applyMentionSuggestion,
  mentionSelectionKey,
  parseJournalMentionSuggestions,
  toMentionSelection,
  type ActiveMentionToken,
  type MentionTypeaheadStatus,
} from "../../journal-mention-typeahead";
import { JournalVoiceInputControl } from "../../journal-voice-input-control";

interface FollowUpEntryComposerProps {
  ownerUserId: string;
  locale: InterfaceLocale;
  objectId: string;
  objectDisplayName: string;
  objectKind: PlantObjectKind;
  today: string;
  initialClientMutationId: string;
  visualScenario?: VisualFixtureCreationScenarioEvidence | null;
}

type SubmitState = "idle" | "publishing" | "published" | "failed";

interface FollowUpEntryDraftFields {
  title: string;
  body: string;
  contentDocument: JournalDocumentV1 | null;
  entryDate: string;
}

export function FollowUpEntryComposer({
  ownerUserId,
  locale,
  objectId,
  objectDisplayName,
  today,
  initialClientMutationId,
  visualScenario = null,
}: FollowUpEntryComposerProps) {
  const workspaceCopy = getGardenWorkspaceCopy(locale);
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
  const photoIntentRequestRef = useRef(0);
  const localeMutationCountRef = useRef(0);
  const draftId = `follow-up-entry:${objectId}`;
  const [clientMutationId, setClientMutationId] = useState(
    visualScenario?.clientMutationId ?? initialClientMutationId,
  );
  const [draft, setDraft] = useState<FollowUpEntryDraftFields>({
    title: visualScenario?.entryTitle ?? "",
    body: visualScenario?.entryBody ?? "",
    contentDocument: null,
    entryDate: visualScenario?.entryDate ?? today,
  });
  const [photoIntentsByBlockId, setPhotoIntentsByBlockId] = useState<
    Record<string, OnlineComposerPhotoIntent>
  >({});
  const inlineMedia = useInlineMediaSelection(ownerUserId);
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
  const [topicTagInput, setTopicTagInput] = useState(
    visualScenario?.topicTagInput ?? "",
  );
  const [mentionSuggestions, setMentionSuggestions] = useState<
    JournalMentionSuggestion[]
  >([]);
  const [mentionStatus, setMentionStatus] =
    useState<MentionTypeaheadStatus>("idle");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [storedPhotoIntent, setStoredPhotoIntent] =
    useState<OnlineComposerPhotoIntent | null>(
      visualScenario?.mediaFileName
        ? {
            fileName: visualScenario.mediaFileName,
            contentType: "image/jpeg",
            size: 2_400_000,
          }
        : null,
    );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [primaryMediaAssetId, setPrimaryMediaAssetId] = useState<string | null>(
    null,
  );
  const [submitState, setSubmitState] = useState<SubmitState>(
    visualScenario?.submitState === "failed" ? "failed" : "idle",
  );
  const [message, setMessage] = useState(
    localizedVisualScenarioMessage(
      workspaceCopy,
      ownerCopy,
      visualScenario,
      objectDisplayName,
    ),
  );
  const [localeMutationPending, setLocaleMutationPending] = useState(false);
  const draftPayload = useMemo(
    () =>
      followUpDraftPayload({
        objectId,
        draft,
        clientMutationId,
        mentionSelections,
        topicTagInput,
        primaryMediaAssetId,
        coverSelection,
      }),
    [
      clientMutationId,
      coverSelection,
      draft,
      mentionSelections,
      objectId,
      primaryMediaAssetId,
      topicTagInput,
    ],
  );
  const online = useOnlineJournalComposer({
    draftKey: draftId,
    draftKind: "follow_up",
    context: { plantObjectId: objectId },
    payload: draftPayload,
    documentMutationGeneration: documentMutation?.transport,
    enabled: visualScenario == null,
    onHydrated: hydrateServerDraft,
  });
  const draftHydrated = online.state.hydrated;
  const persistenceFrozen = online.readOnly;

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

  function hydrateServerDraft(receipt: JournalEntryDraftReceiptV1) {
    if (
      receipt.draftKind !== "follow_up" ||
      receipt.payload.draftKind !== "follow_up" ||
      receipt.payload.request.plantObjectId !== objectId
    ) {
      return;
    }
    const request = receipt.payload.request;
    setClientMutationId(request.clientMutationId);
    setDraft({
      title: request.title,
      body: request.body ?? "",
      contentDocument: request.contentDocument ?? null,
      entryDate: request.entryDate ?? today,
    });
    titleEditedByUserRef.current = request.title.trim().length > 0;
    setMentionSelections(request.mentionSelections ?? []);
    setTopicTagInput(receipt.payload.composerState?.topicTagInput ?? "");
    setPrimaryMediaAssetId(request.mediaAssetId || null);
    setCoverSelection(coverSelectionFromRequest(request.cover));
    setMessage(workspaceCopy.composer.draftRestored);
  }

  const photoHelp = localizedPhotoHelp(workspaceCopy, {
    fileName: photoFile?.name ?? storedPhotoIntent?.fileName ?? null,
    photoError,
    ready: primaryMediaAssetId !== null,
  });

  const hasSelectedPhoto = Boolean(
    photoFile || storedPhotoIntent || primaryMediaAssetId,
  );

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
      if (visualScenario) {
        await handleVisualScenarioSubmit(visualScenario);
        return;
      }
      if (isComposerPersistenceFrozen()) return;

      if (photoError) {
        setSubmitState("failed");
        setMessage(photoError);
        return;
      }

      let payload: JournalEntryDraftPayloadV1;
      try {
        payload = await buildPayload();
      } catch {
        setSubmitState("failed");
        setMessage(workspaceCopy.composer.photo.readError);
        return;
      }

      setSubmitState("publishing");
      setMessage(workspaceCopy.composer.messages.savingPrivate);

      try {
        const result = await online.publish(payload);
        setSubmitState("published");
        setMessage(workspaceCopy.composer.messages.saved);
        if ("readbackUrl" in result && typeof result.readbackUrl === "string") {
          router.push(
            result.followUpValuePulse
              ? buildFollowUpValuePulseReadbackUrl(
                  result.readbackUrl,
                  result.followUpValuePulse.journalEntryId,
                )
              : result.readbackUrl,
          );
        } else {
          router.push(`/garden/objects/${objectId}`);
        }
        router.refresh();
      } catch (error) {
        handleTransportBoundary(error);
        setSubmitState("failed");
        setMessage(workspaceCopy.composer.messages.genericSaveError);
      }
    } finally {
      endLocaleMutation();
    }
  }

  async function handleVisualScenarioSubmit(
    scenario: VisualFixtureCreationScenarioEvidence,
  ) {
    setSubmitState("publishing");
    setMessage(workspaceCopy.composer.messages.visualRunning);

    try {
      if (scenario.expectedServerWrite) {
        const readbackPath = await runVisualJournalCreationScenario(
          scenario.id,
        );
        setSubmitState("published");
        setMessage(workspaceCopy.composer.messages.visualSaved);
        router.push(readbackPath);
        router.refresh();
        return;
      }

      if (scenario.state === "draft" || scenario.state === "cancel") {
        setSubmitState("idle");
        setMessage(
          scenario.state === "cancel"
            ? workspaceCopy.composer.messages.visualCancelDraft
            : workspaceCopy.composer.messages.visualDraftSaved,
        );
        return;
      }

      if (scenario.state === "error") {
        setSubmitState("failed");
        setMessage(workspaceCopy.composer.messages.visualRecoverableError);
      } else {
        setSubmitState("idle");
        setMessage(workspaceCopy.composer.messages.visualDraftSaved);
      }
    } catch {
      setSubmitState("failed");
      setMessage(workspaceCopy.composer.messages.genericSaveError);
    }
  }

  async function handleCancel() {
    if (visualScenario || online.readOnly) {
      router.push(`/garden/objects/${objectId}`);
      return;
    }
    beginLocaleMutation();
    try {
      const payload = await buildPayload();
      await online.saveNow(payload);
      router.push(`/garden/objects/${objectId}`);
    } catch (error) {
      handleTransportBoundary(error);
      setSubmitState("failed");
      setMessage(workspaceCopy.composer.messages.preserveDraftError);
    } finally {
      endLocaleMutation();
    }
  }

  function handleTransportBoundary(error: unknown) {
    if (
      error instanceof OnlineJournalSubmitError &&
      error.documentMutationAdmission
    ) {
      documentMutation?.handleTransportResult(error.documentMutationAdmission);
    }
    if (error instanceof OnlineJournalSubmitError && error.authIntentUrl) {
      window.location.assign(error.authIntentUrl);
    }
  }

  async function uploadPhoto(intent: OnlineComposerPhotoIntent) {
    const transport = documentMutation?.transport;
    if (!transport) throw new Error("Document session is not ready.");
    try {
      return await uploadOnlineComposerPhoto({
        intent,
        authReturnTo: `/garden/objects/${objectId}`,
        documentMutationGeneration: transport,
      });
    } catch (error) {
      handleTransportBoundary(error);
      online.reportConnectionRequired(error);
      throw error;
    }
  }

  async function buildPayload(): Promise<JournalEntryDraftPayloadV1> {
    const contentDocument =
      (await structuredComposerRef.current?.flushLatest()) ??
      draft.contentDocument;
    const body = contentDocument
      ? extractJournalDocumentPlainText(contentDocument)
      : draft.body;
    return followUpDraftPayload({
      objectId,
      draft: { ...draft, body, contentDocument },
      clientMutationId,
      mentionSelections,
      topicTagInput,
      primaryMediaAssetId,
      coverSelection,
    });
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

  function appendVoiceTranscript(transcript: string) {
    if (isComposerPersistenceFrozen()) return;
    void structuredComposerRef.current?.insertVoiceTranscript(transcript);
    updateActiveMentionToken(null);
  }

  function updateActiveMentionToken(token: ActiveMentionToken | null) {
    setActiveMentionToken(token);
    if (token) return;

    setMentionSuggestions([]);
    setMentionStatus("idle");
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
    const requestId = photoIntentRequestRef.current + 1;
    photoIntentRequestRef.current = requestId;

    if (!file) {
      clearPhotoSelection(false);
      return;
    }

    const selectionError = composerPhotoSelectionError(file);
    if (selectionError) {
      setPhotoFile(null);
      setStoredPhotoIntent(clearComposerPhotoIntent());
      setPhotoError(
        selectionError.startsWith("Choose a photo up to")
          ? formatGardenWorkspaceTemplate(
              workspaceCopy.composer.photo.tooLarge,
              {
                maxMegabytes: selectionError.match(/\d+/u)?.[0] ?? "12",
              },
            )
          : workspaceCopy.composer.photo.unsupported,
      );
      resetPhotoInput();
      setDraft((current) => withSuggestedTitle(current, { hasPhoto: false }));
      return;
    }

    setPhotoFile(file);
    setStoredPhotoIntent(clearComposerPhotoIntent());
    setDraft((current) => withSuggestedTitle(current, { hasPhoto: true }));
    void createComposerPhotoIntent(file)
      .then(async (intent) => {
        if (
          !isComposerPersistenceFrozen() &&
          photoIntentRequestRef.current === requestId
        ) {
          setStoredPhotoIntent(intent);
          const uploaded = await uploadPhoto(intent);
          if (photoIntentRequestRef.current === requestId) {
            setPrimaryMediaAssetId(uploaded.mediaAssetId);
          }
        }
      })
      .catch((error) => {
        if (photoIntentRequestRef.current !== requestId) return;
        online.reportConnectionRequired(error);
        setPhotoError(workspaceCopy.composer.photo.uploadError);
      });
  }

  function clearPhotoSelection(resetInput = true) {
    if (isComposerPersistenceFrozen()) return;
    photoIntentRequestRef.current += 1;
    setPhotoFile(null);
    setStoredPhotoIntent(clearComposerPhotoIntent());
    setPrimaryMediaAssetId(null);
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
    return online.readOnly;
  }

  function withSuggestedTitle(
    nextDraft: FollowUpEntryDraftFields,
    options: { hasPhoto?: boolean } = {},
  ): FollowUpEntryDraftFields {
    const suggestion = suggestJournalEntryTitle({
      entryDate: nextDraft.entryDate,
      objectLabel: objectDisplayName,
      body: nextDraft.body,
      hasPhoto: options.hasPhoto ?? Boolean(photoFile || storedPhotoIntent),
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

  return (
    <form
      onSubmit={handleSubmit}
      data-online-composer-kind="follow_up"
      data-visual-creation-scenario={visualScenario?.id}
      data-online-composer-read-only={persistenceFrozen || undefined}
      aria-busy={online.state.status === "hydrating" || undefined}
      className="grid gap-4"
    >
      <OnlineJournalComposerStatus
        state={online.state}
        locale={locale}
        copy={workspaceCopy}
        unsavedText={[
          objectDisplayName,
          draft.title,
          draft.entryDate,
          draft.body,
        ]
          .filter(Boolean)
          .join("\n")}
        navigationHref={`/garden/objects/${objectId}`}
        onRetry={online.retry}
        onCancel={() => router.push(`/garden/objects/${objectId}`)}
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
            <JournalVoiceInputControl
              locale={locale}
              disabled={persistenceFrozen}
              onTranscript={appendVoiceTranscript}
            />
          </div>
          <input type="hidden" name="body" value={draft.body} required />
          <StructuredJournalComposer
            locale={locale}
            labels={getStructuredJournalComposerLabels(locale)}
            initialDocument={draft.contentDocument ?? undefined}
            bindingReady={draftHydrated}
            disabled={persistenceFrozen}
            composerRef={structuredComposerRef}
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
            onSelectImageFile={async (file, blockId) => {
              const reservation = inlineMedia.reserve(
                file,
                photoIntentsByBlockId,
              );
              try {
                const intent = await createComposerPhotoIntent(file);
                const uploaded = await uploadPhoto(intent);
                const previewUrl = URL.createObjectURL(file);
                inlineMedia.commit(reservation, blockId, previewUrl);
                setPhotoIntentsByBlockId((current) => ({
                  ...current,
                  [blockId]: intent,
                }));
                return { mediaAssetId: uploaded.mediaAssetId, previewUrl };
              } catch (error) {
                inlineMedia.release(reservation);
                throw error;
              }
            }}
            onRemoveImageBlock={(blockId) => {
              inlineMedia.revoke(blockId);
              const mediaId = (() => {
                const block = draft.contentDocument?.blocks.find(
                  (item) => item.id === blockId,
                );
                return block?.type === "image" ? block.mediaAssetId : null;
              })();
              if (
                mediaId &&
                coverSelection.mode === "explicit_inline" &&
                coverSelection.mediaAssetId === mediaId
              ) {
                setPendingCoverInlineRemoval({ mediaAssetId: mediaId });
              }
              setPhotoIntentsByBlockId((current) => {
                const next = { ...current };
                const removed = next[blockId];
                delete next[blockId];
                if (removed) {
                  for (const [key, value] of Object.entries(next)) {
                    if (value === removed) delete next[key];
                  }
                }
                return next;
              });
            }}
          />
          <JournalCoverControls
            copy={coverCopy}
            selection={coverSelection}
            eligibleInline={listJournalDocumentImageMediaIds(
              draft.contentDocument ?? createEmptyJournalDocument(),
            ).map((mediaAssetId, index) => ({
              mediaAssetId,
              previewUrl: null,
              label: `${coverCopy.useAsCover} ${index + 1}`,
            }))}
            disabled={persistenceFrozen}
            onSelectSeparateFile={async (intent) => {
              const uploaded = await uploadPhoto(intent);
              return {
                mediaAssetId: uploaded.mediaAssetId,
                previewUrl: uploaded.publicUrl,
              };
            }}
            pendingInlineRemoval={pendingCoverInlineRemoval}
            onChange={setCoverSelection}
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
                  previewUrl: null,
                });
              } else {
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

        <details
          open={visualScenario?.detailsOpen || undefined}
          className="group border-y border-border py-3"
        >
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
          disabled={submitState === "publishing" || persistenceFrozen}
          className="min-h-11 min-w-0 flex-1 sm:min-h-8 sm:flex-none"
        >
          <UploadCloud className="size-4" />
          {ownerCopy.composer.actions.saveOnline}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void handleCancel()}
          className="min-h-11 shrink-0 text-muted-foreground sm:min-h-8"
        >
          {workspaceCopy.composer.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

function followUpDraftPayload(input: {
  objectId: string;
  draft: FollowUpEntryDraftFields;
  clientMutationId: string;
  mentionSelections: JournalMentionSelection[];
  topicTagInput: string;
  primaryMediaAssetId: string | null;
  coverSelection: JournalCoverSelectionState;
}): JournalEntryDraftPayloadV1 {
  return {
    schemaVersion: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
    draftKind: "follow_up",
    request: {
      target: "plant_object_entry",
      plantObjectId: input.objectId,
      title: input.draft.title,
      body: input.draft.body,
      contentDocument: input.draft.contentDocument,
      entryDate: input.draft.entryDate,
      clientMutationId: input.clientMutationId,
      syncStatus: "online",
      mentionSelections: input.mentionSelections,
      topicTags: normalizeJournalTopicTagLabels(input.topicTagInput),
      mediaAssetId: input.primaryMediaAssetId,
      cover: journalCoverSelectionToClaimInput(input.coverSelection),
    },
    composerState: { topicTagInput: input.topicTagInput },
  };
}

function coverSelectionFromRequest(
  cover: JournalEntryDraftPayloadV1["request"]["cover"],
): JournalCoverSelectionState {
  if (!cover || cover.mode === "automatic") return { mode: "automatic" };
  if (cover.mode === "none") return { mode: "none" };
  if (cover.mode === "explicit_inline") {
    return { mode: "explicit_inline", mediaAssetId: cover.mediaAssetId };
  }
  return { mode: "separate", mediaAssetId: cover.mediaAssetId };
}

function localizedPhotoHelp(
  copy: GardenWorkspaceCopy,
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
  if (ready) return copy.composer.photo.ready;
  if (!fileName) return copy.composer.photo.empty;

  return formatGardenWorkspaceTemplate(copy.composer.photo.uploading, {
    fileName,
  });
}

function localizedVisualScenarioMessage(
  workspaceCopy: GardenWorkspaceCopy,
  ownerCopy: OwnerObjectCopy,
  scenario: VisualFixtureCreationScenarioEvidence | null,
  objectName: string,
) {
  if (!scenario) {
    return formatOwnerObjectTemplate(ownerCopy.composer.initialMessage, {
      objectName,
    });
  }
  if (scenario.state === "draft") {
    return workspaceCopy.composer.draftRestored;
  }
  if (scenario.state === "offline") {
    return workspaceCopy.composer.messages.fixtureOffline;
  }
  if (scenario.state === "error") {
    return workspaceCopy.composer.messages.fixturePhotoError;
  }
  if (scenario.state === "cancel") {
    return workspaceCopy.composer.messages.fixtureCancel;
  }
  if (scenario.state === "duplicate") {
    return workspaceCopy.composer.messages.fixtureDuplicate;
  }
  return formatOwnerObjectTemplate(ownerCopy.composer.initialMessage, {
    objectName,
  });
}
