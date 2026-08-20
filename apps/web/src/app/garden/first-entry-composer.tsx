"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Search, UploadCloud, X } from "lucide-react";
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
import type { PlantObjectKind } from "@/db/schema";
import { useScrollToHashOnMount } from "@/lib/browser/hash-scroll";
import {
  buildGardenCatalogTrustMetadata,
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import { getJournalCoverControlsCopy } from "@/lib/garden/journal-cover-controls-copy";
import {
  extractJournalDocumentPlainText,
  listJournalDocumentImageMediaIds,
  createEmptyJournalDocument,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
  type ActivationSource,
  type FirstEntryCatalogSelection,
  type JournalEntryDraftPayloadV1,
  type JournalEntryDraftReceiptV1,
} from "@/lib/garden/entry-contracts";
import type {
  JournalMentionSelection,
  JournalMentionSuggestion,
} from "@/lib/garden/journal-mentions";
import {
  defaultObjectKindForCatalogSelection,
  objectKindAfterCatalogSelection,
} from "@/lib/garden/catalog-object-kind";
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
import {
  catalogItemIdForSelection,
  parseCatalogTypeaheadResponse,
} from "@/lib/garden/catalog-typeahead-contract";
import {
  nextJournalTitleValue,
  suggestJournalEntryTitle,
} from "@/lib/garden/journal-title-prefill";
import { appendVoiceTranscriptToBody } from "@/lib/garden/voice-to-text";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import { getLocalizedCoarseRegionOptions } from "@/lib/garden/regions";
import { trackMetaMarketingEvent } from "@/lib/meta-marketing/client";
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
} from "./journal-mention-typeahead";
import { JournalVoiceInputControl } from "./journal-voice-input-control";
import { JournalObjectKindSelector } from "./journal-object-kind-selector";

interface FirstEntryComposerProps {
  ownerUserId: string;
  locale: InterfaceLocale;
  today: string;
  initialClientMutationId: string;
  initialSpace?: { id: string; displayName: string } | null;
  initialCatalogItem?: FirstEntryCatalogSelection | null;
  activationSource?: ActivationSource | null;
  visualScenario?: VisualFixtureCreationScenarioEvidence | null;
  /**
   * Visual workspace fixtures use in-memory presentation state only and must
   * not call the authenticated server-draft protocol.
   */
  enableServerPersistence?: boolean;
}

type SubmitState = "idle" | "publishing" | "published" | "failed";
type CatalogStatus = "idle" | "loading" | "ready" | "failed";

type CatalogSuggestion = FirstEntryCatalogSelection;

interface FirstEntryDraftFields {
  spaceId: string | null;
  spaceName: string;
  plantName: string;
  objectKind: PlantObjectKind;
  title: string;
  body: string;
  contentDocument: JournalDocumentV1 | null;
  entryDate: string;
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string;
}

export function FirstEntryComposer({
  ownerUserId,
  locale,
  today,
  initialClientMutationId,
  initialSpace = null,
  initialCatalogItem = null,
  activationSource = null,
  visualScenario = null,
  enableServerPersistence = true,
}: FirstEntryComposerProps) {
  const copy = getGardenWorkspaceCopy(locale);
  const documentMutation = useOptionalDocumentMutationGeneration();
  const onlinePersistenceEnabled =
    enableServerPersistence && visualScenario == null;
  useScrollToHashOnMount("first-entry-composer");
  const router = useRouter();
  const titleEditedByUserRef = useRef(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const structuredComposerRef = useRef<StructuredJournalComposerHandle | null>(
    null,
  );
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoIntentRequestRef = useRef(0);
  const localeMutationCountRef = useRef(0);
  const [clientMutationId, setClientMutationId] = useState(
    visualScenario?.clientMutationId ?? initialClientMutationId,
  );
  const [draft, setDraft] = useState<FirstEntryDraftFields>({
    spaceId: visualScenario?.spaceId ?? initialSpace?.id ?? null,
    spaceName: visualScenario?.spaceName ?? initialSpace?.displayName ?? "",
    plantName: visualScenario?.objectName ?? "",
    objectKind: visualScenario
      ? visualScenario.objectKind
      : initialCatalogItem
        ? defaultObjectKindForCatalogSelection(
            initialCatalogItem.catalogKind,
            initialCatalogItem.source,
          )
        : ("plant" as PlantObjectKind),
    title: visualScenario?.entryTitle ?? "",
    body: visualScenario?.entryBody ?? "",
    contentDocument: null,
    entryDate: visualScenario?.entryDate ?? today,
    locationVisibility: visualScenario?.locationVisibility ?? "hidden",
    coarseRegionCode: visualScenario?.coarseRegionCode ?? "",
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
  const [catalogQuery, setCatalogQuery] = useState(
    visualScenario?.catalogQuery ?? initialCatalogItem?.displayName ?? "",
  );
  const [catalogSuggestions, setCatalogSuggestions] = useState<
    CatalogSuggestion[]
  >([]);
  const [selectedCatalogItem, setSelectedCatalogItem] =
    useState<CatalogSuggestion | null>(initialCatalogItem);
  const [userAddedCatalogName, setUserAddedCatalogName] = useState<
    string | null
  >(visualScenario?.userAddedCatalogName ?? null);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("idle");
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
    localizedVisualScenarioMessage(copy, visualScenario),
  );
  const [localeMutationPending, setLocaleMutationPending] = useState(false);
  const draftPayload = useMemo(
    () =>
      firstEntryDraftPayload({
        draft,
        clientMutationId,
        selectedCatalogItem,
        userAddedCatalogName,
        activationSource,
        mentionSelections,
        topicTagInput,
        primaryMediaAssetId,
        coverSelection,
        catalogQuery,
      }),
    [
      activationSource,
      catalogQuery,
      clientMutationId,
      coverSelection,
      draft,
      mentionSelections,
      primaryMediaAssetId,
      selectedCatalogItem,
      topicTagInput,
      userAddedCatalogName,
    ],
  );
  const online = useOnlineJournalComposer({
    draftKey: "first-entry",
    draftKind: "first_entry",
    context: { spaceId: draft.spaceId },
    payload: draftPayload,
    documentMutationGeneration: documentMutation?.transport,
    enabled: onlinePersistenceEnabled,
    onHydrated: hydrateServerDraft,
  });
  const draftHydrated = online.state.hydrated;
  const persistenceFrozen = online.readOnly;

  useInterfaceLocaleChangeFormState({
    id: "first-entry-composer-mutation",
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
      receipt.draftKind !== "first_entry" ||
      receipt.payload.draftKind !== "first_entry"
    ) {
      return;
    }
    const request = receipt.payload.request;
    const composerState = receipt.payload.composerState;
    setClientMutationId(request.clientMutationId);
    setDraft({
      spaceId: request.spaceId ?? null,
      spaceName: request.spaceName ?? "",
      plantName: request.plantName ?? "",
      objectKind: request.objectKind ?? "plant",
      title: request.title,
      body: request.body ?? "",
      contentDocument: request.contentDocument ?? null,
      entryDate: request.entryDate ?? today,
      locationVisibility:
        request.locationVisibility === "region" ? "region" : "hidden",
      coarseRegionCode: request.coarseRegionCode ?? "",
    });
    titleEditedByUserRef.current = request.title.trim().length > 0;
    setCatalogQuery(composerState?.catalogQuery ?? "");
    setSelectedCatalogItem(composerState?.selectedCatalogItem ?? null);
    setUserAddedCatalogName(composerState?.userAddedCatalogName ?? null);
    setMentionSelections(request.mentionSelections ?? []);
    setTopicTagInput(composerState?.topicTagInput ?? "");
    setPrimaryMediaAssetId(request.mediaAssetId || null);
    setCoverSelection(coverSelectionFromRequest(request.cover));
    setMessage(copy.composer.draftRestored);
  }

  useEffect(() => {
    if (visualScenario) return;

    const query = catalogQuery.trim();

    if (
      query.length < 2 ||
      (selectedCatalogItem && query === selectedCatalogItem.displayName) ||
      (userAddedCatalogName && query === userAddedCatalogName)
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCatalogStatus("loading");

      try {
        const response = await fetch(
          `/api/garden/catalog/typeahead?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("Catalog suggestions unavailable.");

        const body = (await response.json()) as unknown;
        setCatalogSuggestions(parseCatalogTypeaheadResponse(body));
        setCatalogStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCatalogSuggestions([]);
        setCatalogStatus("failed");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [catalogQuery, selectedCatalogItem, userAddedCatalogName, visualScenario]);

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

  const photoHelp = localizedPhotoHelp(copy, {
    fileName: photoFile?.name ?? storedPhotoIntent?.fileName ?? null,
    photoError,
    ready: primaryMediaAssetId !== null,
  });
  const catalogAliasCollisionKeys = useMemo(
    () => catalogSuggestionAliasCollisionKeys(catalogSuggestions),
    [catalogSuggestions],
  );
  const selectedCatalogTrust = selectedCatalogItem
    ? buildGardenCatalogTrustMetadata(locale, selectedCatalogItem)
    : null;
  const userAddedCatalogTrust = buildGardenCatalogTrustMetadata(locale, {
    status: "provisional",
    source: "user_added",
    catalogKind: "plant_variety",
    locale: "und",
  });

  const hasSelectedPhoto = Boolean(
    photoFile || storedPhotoIntent || primaryMediaAssetId,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposerPersistenceFrozen()) return;

    beginLocaleMutation();
    try {
      if (visualScenario) {
        await handleVisualScenarioSubmit(visualScenario);
        return;
      }

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
        setMessage(copy.composer.photo.readError);
        return;
      }
      setSubmitState("publishing");
      setMessage(copy.composer.messages.savingPrivate);

      try {
        const result = await online.publish(payload);
        setSubmitState("published");
        setMessage(copy.composer.messages.saved);
        void trackMetaMarketingEvent("first_entry_saved", {
          browserPixel: false,
        });
        if ("readbackUrl" in result && typeof result.readbackUrl === "string") {
          router.push(result.readbackUrl);
        } else {
          router.push("/garden");
        }
      } catch (error) {
        handleTransportBoundary(error);
        setSubmitState("failed");
        setMessage(copy.composer.messages.genericSaveError);
      }
    } finally {
      endLocaleMutation();
    }
  }

  async function handleVisualScenarioSubmit(
    scenario: VisualFixtureCreationScenarioEvidence,
  ) {
    setSubmitState("publishing");
    setMessage(copy.composer.messages.visualRunning);

    try {
      if (scenario.expectedServerWrite) {
        const readbackPath = await runVisualJournalCreationScenario(
          scenario.id,
        );
        setSubmitState("published");
        setMessage(copy.composer.messages.visualSaved);
        router.push(readbackPath);
        return;
      }

      if (scenario.state === "draft" || scenario.state === "cancel") {
        setSubmitState("idle");
        setMessage(
          scenario.state === "cancel"
            ? copy.composer.messages.visualCancelDraft
            : copy.composer.messages.visualDraftSaved,
        );
        return;
      }

      if (scenario.state === "error") {
        setSubmitState("failed");
        setMessage(copy.composer.messages.visualRecoverableError);
      } else {
        setSubmitState("idle");
        setMessage(copy.composer.messages.visualDraftSaved);
      }
    } catch {
      setSubmitState("failed");
      setMessage(copy.composer.messages.genericSaveError);
    }
  }

  async function handleCancel() {
    if (visualScenario || online.readOnly) {
      router.push("/garden");
      return;
    }
    beginLocaleMutation();
    try {
      const payload = await buildPayload();
      await online.saveNow(payload);
      router.push("/garden");
    } catch (error) {
      handleTransportBoundary(error);
      setSubmitState("failed");
      setMessage(copy.composer.messages.preserveDraftError);
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
        authReturnTo: "/garden",
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
    return firstEntryDraftPayload({
      draft: { ...draft, body, contentDocument },
      clientMutationId,
      selectedCatalogItem,
      userAddedCatalogName,
      activationSource,
      mentionSelections,
      topicTagInput,
      primaryMediaAssetId,
      coverSelection,
      catalogQuery,
    });
  }

  function updateDraft<K extends keyof FirstEntryDraftFields>(
    field: K,
    value: FirstEntryDraftFields[K],
  ) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) => {
      const next = { ...current, [field]: value };
      return field === "plantName" || field === "body" || field === "entryDate"
        ? withSuggestedTitle(next)
        : next;
    });
  }

  function updateSpaceChoice(value: string) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) =>
      value === initialSpace?.id
        ? {
            ...current,
            spaceId: initialSpace.id,
            spaceName: initialSpace.displayName,
          }
        : { ...current, spaceId: null, spaceName: "" },
    );
  }

  function updateObjectKind(value: PlantObjectKind) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) => ({ ...current, objectKind: value }));

    if (selectedCatalogItem) {
      setSelectedCatalogItem(null);
      setCatalogQuery("");
    }
    if (userAddedCatalogName) {
      setUserAddedCatalogName(null);
      setCatalogQuery("");
    }
  }

  function updateTitle(value: string) {
    if (isComposerPersistenceFrozen()) return;
    titleEditedByUserRef.current = true;
    setDraft((current) => ({ ...current, title: value }));
  }

  function appendVoiceTranscript(transcript: string) {
    if (isComposerPersistenceFrozen()) return;
    void structuredComposerRef.current?.insertVoiceTranscript(transcript);
    setDraft((current) =>
      withSuggestedTitle({
        ...current,
        body: appendVoiceTranscriptToBody(current.body, transcript),
      }),
    );
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

  function updateLocationVisibility(value: string) {
    if (isComposerPersistenceFrozen()) return;
    setDraft((current) => ({
      ...current,
      locationVisibility: value === "region" ? "region" : "hidden",
      coarseRegionCode: value === "region" ? current.coarseRegionCode : "",
    }));
  }

  function updateCatalogQuery(value: string) {
    if (isComposerPersistenceFrozen()) return;
    setCatalogQuery(value);

    if (selectedCatalogItem && value !== selectedCatalogItem.displayName) {
      setSelectedCatalogItem(null);
    }

    if (userAddedCatalogName && value !== userAddedCatalogName) {
      setUserAddedCatalogName(null);
    }

    if (value.trim().length < 2) {
      setCatalogSuggestions([]);
      setCatalogStatus("idle");
    }
  }

  function selectCatalogSuggestion(suggestion: CatalogSuggestion) {
    if (isComposerPersistenceFrozen()) return;
    setSelectedCatalogItem(suggestion);
    setUserAddedCatalogName(null);
    setCatalogQuery(suggestion.displayName);
    setDraft((current) =>
      withSuggestedTitle(
        {
          ...current,
          objectKind: objectKindAfterCatalogSelection(
            current.objectKind,
            suggestion.catalogKind,
            suggestion.source,
          ),
        },
        { catalogLabel: suggestion.displayName },
      ),
    );
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
  }

  function addMissingCatalogName() {
    if (isComposerPersistenceFrozen()) return;
    const displayName = catalogQuery.trim().replace(/\s+/g, " ");
    if (displayName.length < 1) return;

    setSelectedCatalogItem(null);
    setUserAddedCatalogName(displayName);
    setCatalogQuery(displayName);
    setDraft((current) =>
      withSuggestedTitle(current, { catalogLabel: displayName }),
    );
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
  }

  function chooseUnknownCatalog() {
    if (isComposerPersistenceFrozen()) return;
    setSelectedCatalogItem(null);
    setUserAddedCatalogName(null);
    setCatalogQuery("");
    setDraft((current) => withSuggestedTitle(current, { catalogLabel: null }));
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
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
          ? formatGardenWorkspaceTemplate(copy.composer.photo.tooLarge, {
              maxMegabytes: selectionError.match(/\d+/u)?.[0] ?? "12",
            })
          : copy.composer.photo.unsupported,
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
        if (photoIntentRequestRef.current !== requestId) {
          return;
        }
        online.reportConnectionRequired(error);
        setPhotoError(copy.composer.photo.uploadError);
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
    nextDraft: FirstEntryDraftFields,
    options: {
      catalogLabel?: string | null;
      hasPhoto?: boolean;
    } = {},
  ): FirstEntryDraftFields {
    const catalogLabel =
      options.catalogLabel !== undefined
        ? options.catalogLabel
        : (selectedCatalogItem?.displayName ?? userAddedCatalogName);
    const suggestion = suggestJournalEntryTitle({
      entryDate: nextDraft.entryDate,
      objectLabel: nextDraft.plantName,
      catalogLabel,
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
      data-online-composer-kind="first_entry"
      data-visual-creation-scenario={visualScenario?.id}
      data-online-composer-read-only={persistenceFrozen || undefined}
      aria-busy={online.state.status === "hydrating" || undefined}
      className="grid min-w-0 gap-4"
    >
      <OnlineJournalComposerStatus
        state={online.state}
        locale={locale}
        copy={copy}
        unsavedText={[draft.plantName, draft.title, draft.entryDate, draft.body]
          .filter(Boolean)
          .join("\n")}
        navigationHref="/garden"
        onRetry={online.retry}
        onCancel={() => router.push("/garden")}
      />

      <fieldset disabled={persistenceFrozen} className="contents">
        <JournalObjectKindSelector
          locale={locale}
          value={draft.objectKind}
          onChange={updateObjectKind}
        />

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
            {copy.composer.fields.name}
            <input
              name="plantName"
              data-auth-intent-control="create_object"
              required
              maxLength={120}
              value={draft.plantName}
              onChange={(event) => updateDraft("plantName", event.target.value)}
              className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
              placeholder={
                draft.objectKind === "animal"
                  ? copy.composer.fields.animalPlaceholder
                  : copy.composer.fields.plantPlaceholder
              }
            />
          </label>

          {initialSpace ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
              {copy.composer.fields.space}
              <select
                name="spaceChoice"
                value={draft.spaceId ?? "new"}
                onChange={(event) => updateSpaceChoice(event.target.value)}
                className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
              >
                <option value={initialSpace.id}>
                  {initialSpace.displayName}
                </option>
                <option value="new">
                  {copy.composer.fields.createNewSpace}
                </option>
              </select>
            </label>
          ) : null}
        </div>

        {!draft.spaceId ? (
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
            {copy.composer.fields.newSpaceName}
            <input
              name="spaceName"
              required
              maxLength={120}
              value={draft.spaceName}
              onChange={(event) => updateDraft("spaceName", event.target.value)}
              className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
              placeholder={copy.composer.fields.spacePlaceholder}
            />
            <span className="text-xs leading-5 font-normal text-muted-foreground">
              {copy.composer.fields.spaceHelp}
            </span>
          </label>
        ) : (
          <input type="hidden" name="spaceId" value={draft.spaceId} />
        )}

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {copy.composer.fields.firstUpdate}
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
              setDraft((current) => ({
                ...current,
                body: plain || current.body,
                contentDocument: document,
              }));
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
                return {
                  mediaAssetId: uploaded.mediaAssetId,
                  previewUrl,
                };
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
            {copy.composer.fields.optionalPhoto}
          </span>
          <input
            ref={photoInputRef}
            type="file"
            accept={COMPOSER_PHOTO_ACCEPT}
            capture="environment"
            aria-label={copy.composer.photo.choose}
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
            {copy.composer.photo.choose}
          </Button>
          {hasSelectedPhoto ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => clearPhotoSelection()}
            >
              <X className="size-4" />
              {copy.composer.fields.removePhoto}
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
          className="group min-w-0 border-y border-border py-3"
        >
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-foreground marker:text-muted-foreground sm:min-h-0">
            {copy.composer.fields.moreDetails}
            <span className="ml-2 font-normal text-muted-foreground">
              {copy.composer.fields.detailsHint}
            </span>
          </summary>
          <div
            data-composer-details-content
            className="mt-4 grid min-w-0 gap-4"
          >
            {draft.spaceId ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.composer.fields.selectedSpacePrivacy}
              </p>
            ) : (
              <div
                data-composer-details-grid="location"
                className="grid min-w-0 gap-3 sm:grid-cols-2"
              >
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
                  {copy.composer.fields.location}
                  <select
                    name="locationVisibility"
                    value={draft.locationVisibility}
                    onChange={(event) =>
                      updateLocationVisibility(event.target.value)
                    }
                    className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                  >
                    <option value="hidden">
                      {copy.composer.fields.hidden}
                    </option>
                    <option value="region">
                      {copy.composer.fields.region}
                    </option>
                  </select>
                  <span className="text-xs leading-5 font-normal text-muted-foreground">
                    {draft.locationVisibility === "region"
                      ? copy.composer.locationHelp.region
                      : copy.composer.locationHelp.hidden}
                  </span>
                </label>

                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
                  {copy.composer.fields.coarseRegion}
                  <select
                    name="coarseRegionCode"
                    required={draft.locationVisibility === "region"}
                    disabled={draft.locationVisibility === "hidden"}
                    value={draft.coarseRegionCode}
                    onChange={(event) =>
                      updateDraft("coarseRegionCode", event.target.value)
                    }
                    className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:h-10"
                  >
                    <option value="">
                      {copy.composer.fields.chooseRegion}
                    </option>
                    {getLocalizedCoarseRegionOptions(locale).map((region) => (
                      <option key={region.value} value={region.value}>
                        {region.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-2">
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
                {copy.composer.fields.catalogMatch}
                <span className="relative block min-w-0">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    name="catalogQuery"
                    maxLength={120}
                    value={catalogQuery}
                    onChange={(event) => updateCatalogQuery(event.target.value)}
                    className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                    placeholder={copy.composer.fields.catalogPlaceholder}
                    autoComplete="off"
                  />
                  {catalogQuery ? (
                    <button
                      type="button"
                      onClick={chooseUnknownCatalog}
                      className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={copy.composer.fields.clearCatalogMatch}
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </span>
              </label>

              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                {selectedCatalogItem ? (
                  <span className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border px-2 py-1 text-foreground">
                    <span>
                      {copy.composer.fields.matchedInCatalog}{" "}
                      {selectedCatalogItem.displayName} ·{" "}
                      {selectedCatalogTrust?.trustLabel} ·{" "}
                      {localizedCatalogKindLabel(
                        selectedCatalogItem.catalogKind,
                        draft.objectKind,
                        copy,
                        selectedCatalogItem.source,
                      )}{" "}
                      · {localizedObjectKindLabel(draft.objectKind, copy)}
                    </span>
                    <span className="text-muted-foreground">
                      {selectedCatalogTrust?.disambiguationLabel} ·{" "}
                      {selectedCatalogTrust?.sourceCaveat}
                    </span>
                  </span>
                ) : userAddedCatalogName ? (
                  <span className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border px-2 py-1 text-foreground">
                    <span>
                      {copy.composer.fields.savedWithCatalogName}{" "}
                      {userAddedCatalogName} ·{" "}
                      {userAddedCatalogTrust.trustLabel}
                    </span>
                    <span className="text-muted-foreground">
                      {userAddedCatalogTrust.sourceCaveat}
                    </span>
                  </span>
                ) : (
                  <span className="max-w-full rounded-md border border-border px-2 py-1 break-words text-muted-foreground">
                    {copy.composer.fields.noCatalogMatch}
                  </span>
                )}
                <button
                  type="button"
                  onClick={chooseUnknownCatalog}
                  className="min-h-11 rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted sm:min-h-0"
                >
                  {copy.composer.fields.keepWithoutMatch}
                </button>
                {!selectedCatalogItem && catalogQuery.trim().length >= 2 ? (
                  <button
                    type="button"
                    onClick={addMissingCatalogName}
                    className="min-h-11 rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted sm:min-h-0"
                  >
                    {copy.composer.fields.useThisName}
                  </button>
                ) : null}
                {catalogStatus === "loading" ? (
                  <span className="text-muted-foreground">
                    {copy.composer.fields.searching}
                  </span>
                ) : null}
                {catalogStatus === "failed" ? (
                  <span className="text-destructive">
                    {copy.composer.fields.suggestionsUnavailable}
                  </span>
                ) : null}
              </div>

              {catalogSuggestions.length > 0 ? (
                <ul className="grid gap-2">
                  {catalogSuggestions.map((suggestion) => {
                    const trust = buildGardenCatalogTrustMetadata(
                      locale,
                      suggestion,
                    );
                    const hasAliasCollision = catalogAliasCollisionKeys.has(
                      catalogSuggestionAliasCollisionKey(suggestion),
                    );

                    return (
                      <li key={suggestion.id}>
                        <button
                          type="button"
                          onClick={() => selectCatalogSuggestion(suggestion)}
                          className="flex min-h-11 w-full items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">
                              {suggestion.displayName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {suggestion.canonicalName} ·{" "}
                              {trust.disambiguationLabel}
                            </span>
                            {hasAliasCollision ? (
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                {copy.composer.fields.aliasCollision}
                              </span>
                            ) : null}
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {trust.sourceCaveat}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                            {trust.trustLabel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            <div
              data-composer-details-grid="entry-metadata"
              className="grid min-w-0 gap-3 sm:grid-cols-3"
            >
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground sm:col-span-2">
                {copy.composer.fields.entryTitle}
                <input
                  name="title"
                  required
                  maxLength={140}
                  value={draft.title}
                  onChange={(event) => updateTitle(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                  placeholder={copy.composer.fields.titlePlaceholder}
                />
              </label>

              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
                {copy.composer.fields.date}
                <input
                  type="date"
                  name="entryDate"
                  value={draft.entryDate}
                  onChange={(event) =>
                    updateDraft("entryDate", event.target.value)
                  }
                  className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                />
              </label>
            </div>

            <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
              {copy.composer.fields.tags}
              <input
                name="topicTags"
                maxLength={160}
                value={topicTagInput}
                onChange={(event) => updateTopicTagInput(event.target.value)}
                className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10"
                placeholder={copy.composer.fields.tagsPlaceholder}
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
          disabled={submitState === "publishing" || online.readOnly}
          className="min-h-11 min-w-0 flex-1 sm:min-h-8 sm:flex-none"
        >
          <UploadCloud className="size-4" />
          {copy.composer.actions.saveOnline}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void handleCancel()}
          className="min-h-11 shrink-0 text-muted-foreground sm:min-h-8"
        >
          {copy.composer.actions.cancel}
        </Button>
      </div>
    </form>
  );
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
  copy: GardenWorkspaceCopy,
  scenario: VisualFixtureCreationScenarioEvidence | null,
) {
  if (!scenario) return copy.composer.privacyDefault;
  if (scenario.state === "draft") return copy.composer.draftRestored;
  if (scenario.state === "offline")
    return copy.composer.messages.fixtureOffline;
  if (scenario.state === "error")
    return copy.composer.messages.fixturePhotoError;
  if (scenario.state === "cancel") return copy.composer.messages.fixtureCancel;
  if (scenario.state === "duplicate") {
    return copy.composer.messages.fixtureDuplicate;
  }
  return copy.composer.privacyDefault;
}

function firstEntryDraftPayload(input: {
  draft: FirstEntryDraftFields;
  clientMutationId: string;
  selectedCatalogItem: FirstEntryCatalogSelection | null;
  userAddedCatalogName: string | null;
  activationSource: ActivationSource | null;
  mentionSelections: JournalMentionSelection[];
  topicTagInput: string;
  primaryMediaAssetId: string | null;
  coverSelection: JournalCoverSelectionState;
  catalogQuery: string;
}): JournalEntryDraftPayloadV1 {
  return {
    schemaVersion: JOURNAL_ENTRY_DRAFT_SCHEMA_VERSION,
    draftKind: "first_entry",
    request: {
      target: "first_plant_entry",
      spaceId: input.draft.spaceId,
      spaceName: input.draft.spaceName,
      plantName: input.draft.plantName,
      objectKind: input.draft.objectKind,
      catalogItemId: catalogItemIdForSelection(input.selectedCatalogItem),
      userAddedCatalogName:
        !input.selectedCatalogItem && input.userAddedCatalogName
          ? input.userAddedCatalogName
          : null,
      varietyText:
        input.selectedCatalogItem?.displayName ?? input.userAddedCatalogName,
      title: input.draft.title,
      body: input.draft.body,
      contentDocument: input.draft.contentDocument,
      entryDate: input.draft.entryDate,
      locationVisibility: input.draft.locationVisibility,
      coarseRegionCode:
        input.draft.locationVisibility === "region"
          ? input.draft.coarseRegionCode
          : null,
      clientMutationId: input.clientMutationId,
      activationSource: input.activationSource,
      syncStatus: "online",
      mentionSelections: input.mentionSelections,
      topicTags: normalizeJournalTopicTagLabels(input.topicTagInput),
      mediaAssetId: input.primaryMediaAssetId,
      cover: journalCoverSelectionToClaimInput(input.coverSelection),
    },
    composerState: {
      catalogQuery: input.catalogQuery,
      selectedCatalogItem: input.selectedCatalogItem,
      userAddedCatalogName: input.userAddedCatalogName,
      topicTagInput: input.topicTagInput,
    },
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

function localizedObjectKindLabel(
  value: PlantObjectKind,
  copy: GardenWorkspaceCopy,
) {
  if (value === "animal") return copy.composer.objectKind.animal.label;
  return copy.composer.objectKind.plant.label;
}

function localizedCatalogKindLabel(
  value: string | null | undefined,
  objectKind: PlantObjectKind,
  copy: GardenWorkspaceCopy,
  catalogSource?: string | null,
) {
  if (value === "breed") {
    if (catalogSource === "ua_official_bee_breed") {
      return copy.composer.catalogKinds.beeBreed;
    }
    if (
      objectKind === "animal" ||
      catalogSource === "vertebrate_breed_ontology"
    ) {
      return copy.composer.catalogKinds.animalBreed;
    }
    return copy.composer.catalogKinds.breed;
  }
  if (value === "species") return copy.composer.catalogKinds.species;
  if (value === "plant_variety") return copy.composer.catalogKinds.plantVariety;
  return copy.composer.catalogKinds.match;
}

function catalogSuggestionAliasCollisionKeys(suggestions: CatalogSuggestion[]) {
  const counts = new Map<string, number>();

  for (const suggestion of suggestions) {
    const key = catalogSuggestionAliasCollisionKey(suggestion);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

function catalogSuggestionAliasCollisionKey(suggestion: CatalogSuggestion) {
  return suggestion.displayName.trim().replace(/\s+/g, " ").toLowerCase();
}
