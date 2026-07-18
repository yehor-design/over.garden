"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { PlantObjectKind } from "@/db/schema";
import { useScrollToHashOnMount } from "@/lib/browser/hash-scroll";
import {
  buildGardenCatalogTrustMetadata,
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  localizedJournalSaveErrorMessage,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type {
  ActivationSource,
  FirstEntryCatalogSelection,
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
} from "@/lib/garden/composer-photo-selection";
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
import {
  getLocalizedCoarseRegionLabel,
  getLocalizedCoarseRegionOptions,
} from "@/lib/garden/regions";
import {
  enqueueOfflineMutation,
  listOfflineMutations,
  updateOfflineMutationStatus,
  type OfflineFirstPlantEntryPayload,
  type OfflineJournalEntryPayload,
  type OfflineMutation,
  type OfflinePhotoIntent,
} from "@/lib/offline/queue";
import {
  deleteOfflineDraft,
  FIRST_ENTRY_DRAFT_ID,
  getOfflineDraft,
  hasPersistableFirstEntryDraft,
  upsertOfflineDraft,
  type FirstEntryDraftFields,
  type FirstEntryDraftPayload,
} from "@/lib/offline/drafts";
import {
  createOwnerComposerPersistenceController,
  type OwnerComposerPersistenceController,
  type OwnerComposerPersistenceWriteContext,
} from "@/lib/offline/owner-composer-participants";
import {
  JournalEntrySyncError,
  submitOnlineJournalEntryPayload,
  syncOfflineJournalEntryMutation,
} from "@/lib/offline/journal-entry-sync";
import { trackMetaMarketingEvent } from "@/lib/meta-marketing/client";
import type { VisualFixtureCreationScenarioEvidence } from "@/lib/visual-fixtures/manifest";
import { runVisualJournalCreationScenario } from "@/lib/visual-fixtures/journal-creation-client";
import {
  JournalMentionTypeaheadPanel,
  applyMentionSuggestion,
  mentionSelectionKey,
  parseJournalMentionSuggestions,
  resolveActiveMentionToken,
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
}

type SubmitState = "idle" | "queued" | "syncing" | "synced" | "failed";
type CatalogStatus = "idle" | "loading" | "ready" | "failed";

type CatalogSuggestion = FirstEntryCatalogSelection;

interface FirstEntryComposerPersistenceSnapshot {
  ownerUserId: string;
  payload: FirstEntryDraftPayload;
  photoFile: File | null;
  defaultEntryDate: string;
  hydrated: boolean;
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
}: FirstEntryComposerProps) {
  const copy = getGardenWorkspaceCopy(locale);
  useScrollToHashOnMount("first-entry-composer");
  const router = useRouter();
  const draftPersistencePausedRef = useRef(false);
  const persistenceFrozenRef = useRef(false);
  const persistenceControllerRef =
    useRef<OwnerComposerPersistenceController<FirstEntryComposerPersistenceSnapshot> | null>(
      null,
    );
  const titleEditedByUserRef = useRef(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoIntentRequestRef = useRef(0);
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
    entryDate: visualScenario?.entryDate ?? today,
    locationVisibility: visualScenario?.locationVisibility ?? "hidden",
    coarseRegionCode: visualScenario?.coarseRegionCode ?? "",
  });
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
    useState<OfflinePhotoIntent | null>(
      visualScenario?.mediaFileName
        ? {
            fileName: visualScenario.mediaFileName,
            contentType: "image/jpeg",
            size: 2_400_000,
          }
        : null,
    );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(visualScenario?.online ?? true);
  const [submitState, setSubmitState] = useState<SubmitState>(
    visualScenario?.submitState ?? "idle",
  );
  const [message, setMessage] = useState(
    localizedVisualScenarioMessage(copy, visualScenario),
  );
  const [mutations, setMutations] = useState<OfflineMutation[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [persistenceFrozen, setPersistenceFrozen] = useState(false);

  useEffect(() => {
    if (visualScenario) return;

    const controller =
      createOwnerComposerPersistenceController<FirstEntryComposerPersistenceSnapshot>(
        {
          ownerUserId,
          persist: async (snapshot, context) => {
            await persistFirstEntryComposerSnapshot(snapshot, context);
          },
          shouldPersistAutomatically: () => !draftPersistencePausedRef.current,
        },
      );
    persistenceControllerRef.current = controller;
    const unsubscribeFrozen = controller.subscribeFrozen((frozen) => {
      persistenceFrozenRef.current = frozen;
      setPersistenceFrozen(frozen);
    });

    return () => {
      unsubscribeFrozen();
      if (persistenceControllerRef.current === controller) {
        persistenceControllerRef.current = null;
      }
      persistenceFrozenRef.current = false;
      controller.dispose();
    };
  }, [ownerUserId, visualScenario]);

  const refreshQueue = useCallback(async () => {
    try {
      const localMutations = await listOfflineMutations(ownerUserId, [
        "queued",
        "syncing",
        "failed",
        "synced",
      ]);
      setMutations(
        localMutations
          .filter((mutation) => mutation.kind === "journal_entry")
          .slice(-6)
          .reverse(),
      );
    } catch {
      setMutations([]);
    }
  }, [ownerUserId]);

  useEffect(() => {
    if (visualScenario) return;

    const refreshTimer = window.setTimeout(() => {
      setIsOnline(navigator.onLine);
      void refreshQueue();
    }, 0);

    const handleOnline = () => {
      setIsOnline(true);
      void refreshQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      void refreshQueue();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshQueue, visualScenario]);

  useEffect(() => {
    if (visualScenario) return;

    let cancelled = false;

    void getOfflineDraft<FirstEntryDraftPayload>(
      ownerUserId,
      FIRST_ENTRY_DRAFT_ID,
    )
      .then((storedDraft) => {
        if (cancelled) return;

        if (storedDraft) {
          setClientMutationId(storedDraft.payload.clientMutationId);
          setDraft({
            ...storedDraft.payload.draft,
            spaceId:
              storedDraft.payload.draft.spaceId ??
              (storedDraft.payload.draft.spaceName === initialSpace?.displayName
                ? (initialSpace?.id ?? null)
                : null),
          });
          titleEditedByUserRef.current =
            storedDraft.payload.draft.title.trim().length > 0;
          setCatalogQuery(
            storedDraft.payload.catalogQuery ||
              storedDraft.payload.selectedCatalogItem?.displayName ||
              "",
          );
          setSelectedCatalogItem(storedDraft.payload.selectedCatalogItem);
          setUserAddedCatalogName(storedDraft.payload.userAddedCatalogName);
          setMentionSelections(storedDraft.payload.mentionSelections ?? []);
          setTopicTagInput(storedDraft.payload.topicTagInput ?? "");
          setStoredPhotoIntent(storedDraft.payload.photoIntent);
          setMessage(copy.composer.draftRestored);
        }

        setDraftHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setDraftHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [copy, initialSpace, ownerUserId, visualScenario]);

  useLayoutEffect(() => {
    if (visualScenario) return;

    const payload: FirstEntryDraftPayload = {
      clientMutationId,
      draft,
      catalogQuery,
      selectedCatalogItem,
      userAddedCatalogName,
      activationSource,
      mentionSelections,
      topicTagInput,
      photoIntent: storedPhotoIntent,
    };

    const controller = persistenceControllerRef.current;
    if (!controller) return;
    controller.updateSnapshot({
      ownerUserId,
      payload,
      photoFile,
      defaultEntryDate: today,
      hydrated: draftHydrated,
    });

    if (!draftHydrated) return;

    const timer = window.setTimeout(() => {
      if (draftPersistencePausedRef.current) return;

      void controller.persistLatest().catch(() => undefined);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activationSource,
    catalogQuery,
    clientMutationId,
    draft,
    draftHydrated,
    selectedCatalogItem,
    mentionSelections,
    ownerUserId,
    photoFile,
    storedPhotoIntent,
    today,
    topicTagInput,
    userAddedCatalogName,
    visualScenario,
  ]);

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
          { signal: controller.signal },
        );

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
  }, [activeMentionToken]);

  const photoHelp = localizedPhotoHelp(copy, {
    fileName: photoFile?.name ?? storedPhotoIntent?.fileName ?? null,
    isOnline,
    photoError,
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

  const hasSelectedPhoto = Boolean(photoFile || storedPhotoIntent);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComposerPersistenceFrozen()) return;

    if (visualScenario) {
      await handleVisualScenarioSubmit(visualScenario);
      return;
    }

    if (photoError) {
      setSubmitState("failed");
      setMessage(photoError);
      return;
    }

    let payload: OfflineFirstPlantEntryPayload;
    try {
      payload = await buildPayload();
    } catch {
      setSubmitState("failed");
      setMessage(copy.composer.photo.readError);
      return;
    }
    if (isComposerPersistenceFrozen()) return;

    if (!isOnline) {
      try {
        await enqueuePayload(payload);
      } catch {
        setSubmitState("failed");
        setMessage(copy.composer.messages.offlineStorageUnavailable);
      }
      return;
    }

    setSubmitState("syncing");
    setMessage(copy.composer.messages.savingPrivate);

    try {
      const result = await submitOnlineJournalEntryPayload(payload, {
        ownerUserId,
        idempotencyKey: clientMutationId,
      });
      if (isComposerPersistenceFrozen()) return;
      draftPersistencePausedRef.current = true;
      await deleteOfflineDraft(ownerUserId, FIRST_ENTRY_DRAFT_ID).catch(
        () => undefined,
      );
      setSubmitState("synced");
      setMessage(copy.composer.messages.saved);
      void trackMetaMarketingEvent("first_entry_saved", {
        browserPixel: false,
      });
      router.push(result.readbackUrl);
    } catch (error) {
      if (await resumeAuthentication(error, payload)) return;
      setSubmitState("failed");
      setMessage(localizedJournalSaveErrorMessage(locale, error));
    }
  }

  async function handleVisualScenarioSubmit(
    scenario: VisualFixtureCreationScenarioEvidence,
  ) {
    setSubmitState("syncing");
    setMessage(copy.composer.messages.visualRunning);

    try {
      if (scenario.expectedServerWrite) {
        const readbackPath = await runVisualJournalCreationScenario(
          scenario.id,
        );
        setSubmitState("synced");
        setMessage(copy.composer.messages.visualSaved);
        router.push(readbackPath);
        return;
      }

      const payload = await buildPayload();
      if (scenario.state === "draft" || scenario.state === "cancel") {
        await persistVisualDraft(payload);
        setSubmitState("idle");
        setMessage(
          scenario.state === "cancel"
            ? copy.composer.messages.visualCancelDraft
            : copy.composer.messages.visualDraftSaved,
        );
        return;
      }

      const mutation = await enqueueOfflineMutation({
        ownerUserId,
        kind: "journal_entry",
        payload,
        idempotencyKey: scenario.clientMutationId,
      });
      if (scenario.state === "error") {
        await updateOfflineMutationStatus(ownerUserId, mutation.id, "failed", {
          lastError: "Recoverable fixture save failure.",
        });
        setSubmitState("failed");
        setMessage(copy.composer.messages.visualRecoverableError);
      } else {
        setSubmitState("queued");
        setMessage(copy.composer.messages.visualQueued);
      }
      await refreshQueue();
    } catch (error) {
      setSubmitState("failed");
      setMessage(localizedJournalSaveErrorMessage(locale, error));
    }
  }

  async function persistVisualDraft(payload: OfflineFirstPlantEntryPayload) {
    const persistedPayload = persistedDraftPayload(payload);
    await upsertOfflineDraft({
      ownerUserId,
      id: FIRST_ENTRY_DRAFT_ID,
      kind: "first_entry",
      payload: persistedPayload,
    });
  }

  function persistedDraftPayload(
    payload: OfflineFirstPlantEntryPayload,
  ): FirstEntryDraftPayload {
    return {
      clientMutationId: payload.clientMutationId,
      draft: {
        spaceId: payload.spaceId ?? null,
        spaceName: payload.spaceName ?? "",
        plantName: payload.plantName,
        objectKind: payload.objectKind ?? "plant",
        title: payload.title,
        body: payload.body,
        entryDate: payload.entryDate,
        locationVisibility:
          payload.locationVisibility === "region" ? "region" : "hidden",
        coarseRegionCode: payload.coarseRegionCode ?? "",
      },
      catalogQuery,
      selectedCatalogItem,
      userAddedCatalogName,
      activationSource: payload.activationSource ?? null,
      mentionSelections: payload.mentionSelections ?? [],
      topicTagInput,
      photoIntent: payload.photoIntent ?? null,
    };
  }

  async function handleCancel() {
    if (isComposerPersistenceFrozen()) return;
    try {
      const payload = await buildPayload();
      if (isComposerPersistenceFrozen()) return;
      const persistedPayload = persistedDraftPayload(payload);
      draftPersistencePausedRef.current = true;

      if (
        visualScenario?.state === "cancel" ||
        hasPersistableFirstEntryDraft(persistedPayload, today)
      ) {
        await persistVisualDraft(payload);
      } else {
        await deleteOfflineDraft(ownerUserId, FIRST_ENTRY_DRAFT_ID);
      }

      if (isComposerPersistenceFrozen()) return;
      router.push("/garden");
    } catch {
      draftPersistencePausedRef.current = false;
      setSubmitState("failed");
      setMessage(copy.composer.messages.preserveDraftError);
    }
  }

  async function enqueuePayload(payload: OfflineJournalEntryPayload) {
    const mutation = await enqueueOfflineMutation({
      ownerUserId,
      kind: "journal_entry",
      payload,
      idempotencyKey: clientMutationId,
    });

    if (isComposerPersistenceFrozen()) return;
    setSubmitState("queued");
    draftPersistencePausedRef.current = true;
    await deleteOfflineDraft(ownerUserId, FIRST_ENTRY_DRAFT_ID).catch(
      () => undefined,
    );
    setMessage(
      mutation.status === "queued"
        ? localizedLocalSavedMessage(copy, "entry")
        : localizedLocalDuplicateMessage(copy, "entry"),
    );
    await refreshQueue();
  }

  async function handleSync(mutation: OfflineMutation) {
    setSubmitState("syncing");
    setMessage(copy.composer.messages.sending);

    try {
      const result = await syncOfflineJournalEntryMutation(mutation, {
        expectedOwnerUserId: ownerUserId,
      });
      if (isComposerPersistenceFrozen()) return;
      draftPersistencePausedRef.current = true;
      await deleteOfflineDraft(ownerUserId, FIRST_ENTRY_DRAFT_ID).catch(
        () => undefined,
      );
      setSubmitState("synced");
      setMessage(copy.composer.messages.saved);
      await refreshQueue();
      void trackMetaMarketingEvent("first_entry_saved", {
        browserPixel: false,
      });
      router.push(result.readbackUrl);
    } catch (error) {
      if (await resumeAuthentication(error)) return;
      setSubmitState("failed");
      setMessage(localizedJournalSaveErrorMessage(locale, error));
      await refreshQueue();
    }
  }

  async function resumeAuthentication(
    error: unknown,
    payload?: OfflineFirstPlantEntryPayload,
  ) {
    if (
      error instanceof JournalEntrySyncError &&
      error.status === 401 &&
      error.authIntentUrl
    ) {
      if (payload) {
        try {
          const savedDraft = await upsertOfflineDraft({
            ownerUserId,
            id: FIRST_ENTRY_DRAFT_ID,
            kind: "first_entry",
            payload: {
              clientMutationId: payload.clientMutationId,
              draft: {
                spaceId: payload.spaceId ?? null,
                spaceName: payload.spaceName ?? "",
                plantName: payload.plantName,
                objectKind: payload.objectKind ?? "plant",
                title: payload.title,
                body: payload.body,
                entryDate: payload.entryDate,
                locationVisibility:
                  payload.locationVisibility === "region" ? "region" : "hidden",
                coarseRegionCode: payload.coarseRegionCode ?? "",
              },
              catalogQuery,
              selectedCatalogItem,
              userAddedCatalogName,
              activationSource: payload.activationSource ?? null,
              mentionSelections: payload.mentionSelections ?? [],
              topicTagInput,
              photoIntent: payload.photoIntent ?? null,
            },
          });
          if (!savedDraft) throw new Error("Offline drafts are unavailable.");
        } catch {
          setSubmitState("failed");
          setMessage(copy.composer.messages.preserveDraftBeforeSignInError);
          return true;
        }
      }

      setSubmitState("idle");
      setMessage(copy.composer.messages.signInToContinue);
      router.push(error.authIntentUrl);
      return true;
    }
    return false;
  }

  async function buildPayload(): Promise<OfflineFirstPlantEntryPayload> {
    const photoIntent = photoFile
      ? await createComposerPhotoIntent(photoFile)
      : storedPhotoIntent;

    return {
      target: "first_plant_entry",
      ...draft,
      spaceId: draft.spaceId,
      spaceName: draft.spaceName,
      objectKind: draft.objectKind,
      catalogItemId: catalogItemIdForSelection(selectedCatalogItem),
      userAddedCatalogName:
        !selectedCatalogItem && userAddedCatalogName
          ? userAddedCatalogName
          : null,
      varietyText: selectedCatalogItem?.displayName ?? userAddedCatalogName,
      locationVisibility: draft.locationVisibility,
      coarseRegionCode:
        draft.locationVisibility === "region" ? draft.coarseRegionCode : null,
      clientMutationId,
      activationSource,
      syncStatus: isOnline ? "online" : "offline_queued",
      mentionSelections,
      topicTags: normalizeJournalTopicTagLabels(topicTagInput),
      photoIntent,
    };
  }

  function updateDraft<K extends keyof FirstEntryDraftFields>(
    field: K,
    value: FirstEntryDraftFields[K],
  ) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
    setDraft((current) => {
      const next = { ...current, [field]: value };
      return field === "plantName" || field === "body" || field === "entryDate"
        ? withSuggestedTitle(next)
        : next;
    });
  }

  function updateSpaceChoice(value: string) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
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
    draftPersistencePausedRef.current = false;
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
    draftPersistencePausedRef.current = false;
    titleEditedByUserRef.current = true;
    setDraft((current) => ({ ...current, title: value }));
  }

  function updateBody(value: string, cursorPosition = value.length) {
    if (isComposerPersistenceFrozen()) return;
    updateDraft("body", value);
    updateActiveMentionToken(resolveActiveMentionToken(value, cursorPosition));
  }

  function appendVoiceTranscript(transcript: string) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
    setDraft((current) =>
      withSuggestedTitle({
        ...current,
        body: appendVoiceTranscriptToBody(current.body, transcript),
      }),
    );
    updateActiveMentionToken(null);
  }

  function refreshActiveMentionToken() {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;

    updateActiveMentionToken(
      resolveActiveMentionToken(textarea.value, textarea.selectionStart),
    );
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

    draftPersistencePausedRef.current = false;
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
    draftPersistencePausedRef.current = false;
    setMentionSelections((current) =>
      current.filter(
        (item) => mentionSelectionKey(item) !== mentionSelectionKey(selection),
      ),
    );
  }

  function updateTopicTagInput(value: string) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
    setTopicTagInput(value);
  }

  function updateLocationVisibility(value: string) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
    setDraft((current) => ({
      ...current,
      locationVisibility: value === "region" ? "region" : "hidden",
      coarseRegionCode: value === "region" ? current.coarseRegionCode : "",
    }));
  }

  function updateCatalogQuery(value: string) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
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
    draftPersistencePausedRef.current = false;
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

    draftPersistencePausedRef.current = false;
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
    draftPersistencePausedRef.current = false;
    setSelectedCatalogItem(null);
    setUserAddedCatalogName(null);
    setCatalogQuery("");
    setDraft((current) => withSuggestedTitle(current, { catalogLabel: null }));
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
  }

  function handlePhotoChange(file: File | undefined) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
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
      .then((intent) => {
        if (
          !isComposerPersistenceFrozen() &&
          photoIntentRequestRef.current === requestId
        ) {
          setStoredPhotoIntent(intent);
        }
      })
      .catch(() => {
        if (
          isComposerPersistenceFrozen() ||
          photoIntentRequestRef.current !== requestId
        ) {
          return;
        }

        setPhotoFile(null);
        setStoredPhotoIntent(clearComposerPhotoIntent());
        setPhotoError(copy.composer.photo.keepError);
        resetPhotoInput();
        setDraft((current) => withSuggestedTitle(current, { hasPhoto: false }));
      });
  }

  function clearPhotoSelection(resetInput = true) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
    photoIntentRequestRef.current += 1;
    setPhotoFile(null);
    setStoredPhotoIntent(clearComposerPhotoIntent());
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
    return (
      persistenceControllerRef.current?.isFrozen() ??
      persistenceFrozenRef.current
    );
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
      data-visual-creation-scenario={visualScenario?.id}
      inert={persistenceFrozen}
      data-composer-sign-out-frozen={persistenceFrozen || undefined}
      aria-busy={persistenceFrozen || undefined}
      className={`grid min-w-0 gap-4 transition-opacity ${persistenceFrozen ? "pointer-events-none opacity-60" : ""}`}
    >
      {persistenceFrozen ? (
        <p className="sr-only" role="status" aria-live="polite">
          {copy.composer.saveStates.syncing}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
          {isOnline ? (
            <Wifi className="size-3.5" />
          ) : (
            <WifiOff className="size-3.5" />
          )}
          {isOnline
            ? copy.composer.connection.online
            : copy.composer.connection.offline}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {copy.composer.saveStates[submitState]}
        </span>
      </div>

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
                : draft.objectKind === "bee_colony"
                  ? copy.composer.fields.beePlaceholder
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
              <option value="new">{copy.composer.fields.createNewSpace}</option>
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
          <label
            htmlFor="first-entry-body"
            className="text-sm font-medium text-foreground"
          >
            {copy.composer.fields.firstUpdate}
          </label>
          <JournalVoiceInputControl
            locale={locale}
            disabled={persistenceFrozen}
            onTranscript={appendVoiceTranscript}
          />
        </div>
        <textarea
          ref={bodyTextareaRef}
          id="first-entry-body"
          name="body"
          data-auth-intent-control="create_entry"
          required
          minLength={1}
          maxLength={2000}
          value={draft.body}
          onChange={(event) =>
            updateBody(
              event.currentTarget.value,
              event.currentTarget.selectionStart,
            )
          }
          onClick={refreshActiveMentionToken}
          onKeyUp={refreshActiveMentionToken}
          className="min-h-32 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base font-normal text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder={copy.composer.fields.bodyPlaceholder}
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
        <div data-composer-details-content className="mt-4 grid min-w-0 gap-4">
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
                  <option value="hidden">{copy.composer.fields.hidden}</option>
                  <option value="region">{copy.composer.fields.region}</option>
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
                  <option value="">{copy.composer.fields.chooseRegion}</option>
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
                    {userAddedCatalogName} · {userAddedCatalogTrust.trustLabel}
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
          disabled={submitState === "syncing"}
          className="min-h-11 min-w-0 flex-1 sm:min-h-8 sm:flex-none"
        >
          <UploadCloud className="size-4" />
          {isOnline
            ? copy.composer.actions.saveOnline
            : copy.composer.actions.saveOffline}
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

      {mutations.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {copy.composer.queue.title}
          </h3>
          <ul className="flex flex-col gap-2">
            {mutations.map((mutation) => (
              <li
                key={mutation.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {statusIcon(mutation.status)}
                    {mutationTitle(mutation, copy)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {mutationSubtitle(mutation, locale, copy)}
                  </span>
                  {mutation.lastError ? (
                    <span className="text-xs text-destructive">
                      {copy.composer.queue.retryError}
                    </span>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {mutation.status === "synced" ? (
                    <Link
                      href={mutationReadbackUrl(mutation) ?? "/garden"}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {copy.composer.queue.open}
                    </Link>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 sm:min-h-8"
                      disabled={
                        !isOnline ||
                        mutation.status === "syncing" ||
                        submitState === "syncing"
                      }
                      onClick={() => void handleSync(mutation)}
                    >
                      <RefreshCw className="size-4" />
                      {localizedOfflineSaveActionLabel(mutation.status, copy)}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

async function persistFirstEntryComposerSnapshot(
  snapshot: FirstEntryComposerPersistenceSnapshot,
  context: OwnerComposerPersistenceWriteContext,
) {
  if (!snapshot.hydrated) {
    throw new Error("The first-entry draft is not hydrated yet.");
  }

  const payload =
    snapshot.photoFile && !snapshot.payload.photoIntent
      ? {
          ...snapshot.payload,
          photoIntent: await createComposerPhotoIntent(snapshot.photoFile),
        }
      : snapshot.payload;

  if (hasPersistableFirstEntryDraft(payload, snapshot.defaultEntryDate)) {
    await upsertOfflineDraft(
      {
        ownerUserId: snapshot.ownerUserId,
        id: FIRST_ENTRY_DRAFT_ID,
        kind: "first_entry",
        payload,
      },
      context,
    );
    return;
  }

  await deleteOfflineDraft(snapshot.ownerUserId, FIRST_ENTRY_DRAFT_ID, context);
}

function statusIcon(status: OfflineMutation["status"]) {
  switch (status) {
    case "synced":
      return <CheckCircle2 className="size-4 text-green-600" />;
    case "failed":
      return <AlertCircle className="size-4 text-destructive" />;
    case "syncing":
      return <RefreshCw className="size-4 text-muted-foreground" />;
    default:
      return <Clock3 className="size-4 text-muted-foreground" />;
  }
}

function mutationTitle(mutation: OfflineMutation, copy: GardenWorkspaceCopy) {
  if (mutation.status === "synced") return copy.composer.queue.savedEntry;
  const payload = mutation.payload as Partial<OfflineJournalEntryPayload>;
  return payload.title || copy.composer.queue.untitledEntry;
}

function mutationSubtitle(
  mutation: OfflineMutation,
  locale: InterfaceLocale,
  copy: GardenWorkspaceCopy,
) {
  if (mutation.status === "synced") {
    return copy.composer.queue.savedAndRemoved;
  }
  const payload = mutation.payload as Partial<OfflineJournalEntryPayload>;
  if (payload.target === "plant_object_entry") {
    const parts = [
      localizedOfflineSaveStatusSentence(mutation.status, copy),
      copy.composer.queue.followUp,
      payload.entryDate,
      payload.photoIntent ? copy.composer.queue.photoLater : null,
    ].filter(Boolean);

    return parts.join(" · ");
  }

  const firstEntryPayload = payload as Partial<OfflineFirstPlantEntryPayload>;
  const regionLabel =
    firstEntryPayload.locationVisibility === "region" &&
    firstEntryPayload.coarseRegionCode
      ? getLocalizedCoarseRegionLabel(
          locale,
          firstEntryPayload.coarseRegionCode,
        )
      : null;
  const parts = [
    localizedOfflineSaveStatusLabel(mutation.status, copy),
    firstEntryPayload.plantName,
    regionLabel
      ? formatGardenWorkspaceTemplate(copy.composer.queue.region, {
          region: regionLabel,
        })
      : copy.composer.queue.locationHidden,
    firstEntryPayload.catalogItemId
      ? copy.composer.varietyStates.selected
      : firstEntryPayload.userAddedCatalogName
        ? copy.composer.varietyStates.userAdded
        : copy.composer.varietyStates.unknown,
    firstEntryPayload.entryDate,
    firstEntryPayload.photoIntent ? copy.composer.queue.photoLater : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function mutationReadbackUrl(mutation: OfflineMutation) {
  const result = mutation.syncResult as { readbackUrl?: unknown } | undefined;
  return typeof result?.readbackUrl === "string" ? result.readbackUrl : null;
}

function localizedPhotoHelp(
  copy: GardenWorkspaceCopy,
  {
    fileName,
    isOnline,
    photoError,
  }: {
    fileName: string | null;
    isOnline: boolean;
    photoError: string | null;
  },
) {
  if (photoError) return photoError;
  if (!fileName) return copy.composer.photo.empty;

  return formatGardenWorkspaceTemplate(
    isOnline ? copy.composer.photo.online : copy.composer.photo.offline,
    { fileName },
  );
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

function localizedLocalSavedMessage(
  copy: GardenWorkspaceCopy,
  kind: "entry" | "follow-up",
) {
  return formatGardenWorkspaceTemplate(copy.composer.offline.savedMessage, {
    entryKind:
      kind === "entry"
        ? copy.composer.offline.entry
        : copy.composer.offline.followUp,
  });
}

function localizedLocalDuplicateMessage(
  copy: GardenWorkspaceCopy,
  kind: "entry" | "follow-up",
) {
  return formatGardenWorkspaceTemplate(copy.composer.offline.duplicateMessage, {
    entryKind:
      kind === "entry"
        ? copy.composer.offline.entry
        : copy.composer.offline.followUp,
  });
}

function localizedOfflineSaveStatusLabel(
  status: OfflineMutation["status"],
  copy: GardenWorkspaceCopy,
) {
  return copy.composer.offline.statusLabels[status];
}

function localizedOfflineSaveActionLabel(
  status: OfflineMutation["status"],
  copy: GardenWorkspaceCopy,
) {
  return status === "failed"
    ? copy.composer.offline.actionLabels.retry
    : copy.composer.offline.actionLabels.send;
}

function localizedOfflineSaveStatusSentence(
  status: OfflineMutation["status"],
  copy: GardenWorkspaceCopy,
) {
  return copy.composer.offline.statusSentences[status];
}

function localizedObjectKindLabel(
  value: PlantObjectKind,
  copy: GardenWorkspaceCopy,
) {
  if (value === "bee_colony") return copy.composer.objectKind.beeColony.label;
  if (value === "animal") return copy.composer.objectKind.animal.label;
  return copy.composer.objectKind.plant.label;
}

function localizedCatalogKindLabel(
  value: string | null | undefined,
  objectKind: PlantObjectKind,
  copy: GardenWorkspaceCopy,
) {
  if (value === "breed") {
    if (objectKind === "bee_colony") return copy.composer.catalogKinds.beeBreed;
    if (objectKind === "animal") return copy.composer.catalogKinds.animalBreed;
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
