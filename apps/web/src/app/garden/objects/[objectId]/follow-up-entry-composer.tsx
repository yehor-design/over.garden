"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
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
} from "@/lib/garden/composer-photo-selection";
import { extractJournalDocumentPlainText } from "@/lib/garden/journal-document";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import {
  assertOfflinePhotoQuotaAllows,
  sumOfflinePhotoIntentBytes,
} from "@/lib/offline/offline-media-quota";
import { registerOwnerPreviewObjectUrl } from "@/lib/offline/owner-session-lifecycle";
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
  localizedJournalSaveErrorMessage,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import {
  enqueueOfflineMutation,
  listOfflineMutations,
  updateOfflineMutationStatus,
  type OfflineJournalEntryPayload,
  type OfflineMutation,
  type OfflinePlantObjectEntryPayload,
  type OfflinePhotoIntent,
} from "@/lib/offline/queue";
import {
  deleteOfflineDraft,
  followUpEntryDraftId,
  getOfflineDraft,
  hasPersistableFollowUpDraft,
  upsertOfflineDraft,
  type FollowUpEntryDraftFields,
  type FollowUpEntryDraftPayload,
} from "@/lib/offline/drafts";
import {
  createOwnerComposerPersistenceController,
  type OwnerComposerPersistenceController,
  type OwnerComposerPersistenceWriteContext,
} from "@/lib/offline/owner-composer-participants";
import { buildFollowUpValuePulseReadbackUrl } from "@/lib/garden/follow-up-value-pulse";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
  type OwnerObjectCopy,
} from "@/lib/owner-object-copy";
import {
  JournalEntrySyncError,
  submitOnlineJournalEntryPayload,
  syncOfflineJournalEntryMutation,
} from "@/lib/offline/journal-entry-sync";
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

type SubmitState = "idle" | "queued" | "syncing" | "synced" | "failed";

interface FollowUpComposerPersistenceSnapshot {
  ownerUserId: string;
  draftId: string;
  payload: FollowUpEntryDraftPayload;
  photoFile: File | null;
  defaultEntryDate: string;
  hydrated: boolean;
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
  const ownerCopy = getOwnerObjectCopy(locale);
  useScrollToHashOnMount("follow-up-composer");
  const router = useRouter();
  const draftPersistencePausedRef = useRef(false);
  const persistenceFrozenRef = useRef(false);
  const persistenceControllerRef =
    useRef<OwnerComposerPersistenceController<FollowUpComposerPersistenceSnapshot> | null>(
      null,
    );
  const titleEditedByUserRef = useRef(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const structuredComposerRef =
    useRef<StructuredJournalComposerHandle | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoIntentRequestRef = useRef(0);
  const localeMutationCountRef = useRef(0);
  const draftId = followUpEntryDraftId(objectId);
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
    Record<string, OfflinePhotoIntent>
  >({});
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
    localizedVisualScenarioMessage(
      workspaceCopy,
      ownerCopy,
      visualScenario,
      objectDisplayName,
    ),
  );
  const [mutations, setMutations] = useState<OfflineMutation[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [persistenceFrozen, setPersistenceFrozen] = useState(false);
  const [localeMutationPending, setLocaleMutationPending] = useState(false);

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

  useEffect(() => {
    if (visualScenario) return;

    const controller =
      createOwnerComposerPersistenceController<FollowUpComposerPersistenceSnapshot>(
        {
          ownerUserId,
          persist: async (snapshot, context) => {
            await persistFollowUpComposerSnapshot(snapshot, context);
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
          .filter(
            (mutation) =>
              mutation.kind === "journal_entry" &&
              isObjectEntryMutationForObject(mutation, objectId),
          )
          .slice(-5)
          .reverse(),
      );
    } catch {
      setMutations([]);
    }
  }, [objectId, ownerUserId]);

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

    void getOfflineDraft<FollowUpEntryDraftPayload>(ownerUserId, draftId)
      .then((storedDraft) => {
        if (cancelled) return;

        if (storedDraft && storedDraft.payload.plantObjectId === objectId) {
          setClientMutationId(storedDraft.payload.clientMutationId);
          setDraft(storedDraft.payload.draft);
          titleEditedByUserRef.current =
            storedDraft.payload.draft.title.trim().length > 0;
          setMentionSelections(storedDraft.payload.mentionSelections ?? []);
          setTopicTagInput(storedDraft.payload.topicTagInput ?? "");
          setStoredPhotoIntent(storedDraft.payload.photoIntent);
          setPhotoIntentsByBlockId(
            storedDraft.payload.photoIntentsByBlockId ?? {},
          );
          setMessage(workspaceCopy.composer.draftRestored);
        }

        setDraftHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setDraftHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [draftId, objectId, ownerUserId, visualScenario, workspaceCopy]);

  useLayoutEffect(() => {
    if (visualScenario) return;

    const payload: FollowUpEntryDraftPayload = {
      clientMutationId,
      plantObjectId: objectId,
      draft,
      mentionSelections,
      topicTagInput,
      photoIntent: storedPhotoIntent,
      photoIntentsByBlockId,
    };

    const controller = persistenceControllerRef.current;
    if (!controller) return;
    controller.updateSnapshot({
      ownerUserId,
      draftId,
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
    clientMutationId,
    draft,
    draftHydrated,
    draftId,
    mentionSelections,
    objectId,
    ownerUserId,
    photoFile,
    photoIntentsByBlockId,
    storedPhotoIntent,
    today,
    topicTagInput,
    visualScenario,
  ]);

  const photoHelp = localizedPhotoHelp(workspaceCopy, {
    fileName: photoFile?.name ?? storedPhotoIntent?.fileName ?? null,
    isOnline,
    photoError,
  });

  const hasSelectedPhoto = Boolean(photoFile || storedPhotoIntent);

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

      let payload: OfflinePlantObjectEntryPayload;
      try {
        payload = await buildPayload();
      } catch {
        setSubmitState("failed");
        setMessage(workspaceCopy.composer.photo.readError);
        return;
      }

      if (!isOnline) {
        try {
          await enqueuePayload(payload);
        } catch {
          setSubmitState("failed");
          setMessage(workspaceCopy.composer.messages.offlineStorageUnavailable);
        }
        return;
      }

      setSubmitState("syncing");
      setMessage(workspaceCopy.composer.messages.savingPrivate);

      try {
        const result = await submitOnlineJournalEntryPayload(payload, {
          ownerUserId,
          idempotencyKey: clientMutationId,
        });
        if (isComposerPersistenceFrozen()) return;
        draftPersistencePausedRef.current = true;
        await deleteOfflineDraft(ownerUserId, draftId).catch(() => undefined);
        setSubmitState("synced");
        setMessage(workspaceCopy.composer.messages.saved);
        router.push(
          result.followUpValuePulse
            ? buildFollowUpValuePulseReadbackUrl(
                result.readbackUrl,
                result.followUpValuePulse.journalEntryId,
              )
            : result.readbackUrl,
        );
        router.refresh();
      } catch (error) {
        if (await resumeAuthentication(error, payload)) return;
        setSubmitState("failed");
        setMessage(localizedJournalSaveErrorMessage(locale, error));
      }
    } finally {
      endLocaleMutation();
    }
  }

  async function handleVisualScenarioSubmit(
    scenario: VisualFixtureCreationScenarioEvidence,
  ) {
    setSubmitState("syncing");
    setMessage(workspaceCopy.composer.messages.visualRunning);

    try {
      if (scenario.expectedServerWrite) {
        const readbackPath = await runVisualJournalCreationScenario(
          scenario.id,
        );
        setSubmitState("synced");
        setMessage(workspaceCopy.composer.messages.visualSaved);
        router.push(readbackPath);
        router.refresh();
        return;
      }

      const payload = await buildPayload();
      if (scenario.state === "draft" || scenario.state === "cancel") {
        await persistVisualDraft(payload);
        setSubmitState("idle");
        setMessage(
          scenario.state === "cancel"
            ? workspaceCopy.composer.messages.visualCancelDraft
            : workspaceCopy.composer.messages.visualDraftSaved,
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
        setMessage(workspaceCopy.composer.messages.visualRecoverableError);
      } else {
        setSubmitState("queued");
        setMessage(workspaceCopy.composer.messages.visualQueued);
      }
      await refreshQueue();
    } catch (error) {
      setSubmitState("failed");
      setMessage(localizedJournalSaveErrorMessage(locale, error));
    }
  }

  async function persistVisualDraft(payload: OfflinePlantObjectEntryPayload) {
    const persistedPayload = persistedDraftPayload(payload);
    await upsertOfflineDraft({
      ownerUserId,
      id: draftId,
      kind: "follow_up_entry",
      payload: persistedPayload,
    });
  }

  function persistedDraftPayload(
    payload: OfflinePlantObjectEntryPayload,
  ): FollowUpEntryDraftPayload {
    return {
      clientMutationId: payload.clientMutationId,
      plantObjectId: payload.plantObjectId,
      draft: {
        title: payload.title,
        body: payload.body,
        entryDate: payload.entryDate,
      },
      mentionSelections: payload.mentionSelections ?? [],
      topicTagInput,
      photoIntent: payload.photoIntent ?? null,
    };
  }

  async function handleCancel() {
    if (isComposerPersistenceFrozen()) return;
    beginLocaleMutation();
    try {
      const payload = await buildPayload();
      if (isComposerPersistenceFrozen()) return;
      const persistedPayload = persistedDraftPayload(payload);
      draftPersistencePausedRef.current = true;

      if (
        visualScenario?.state === "cancel" ||
        hasPersistableFollowUpDraft(persistedPayload, today)
      ) {
        await persistVisualDraft(payload);
      } else {
        await deleteOfflineDraft(ownerUserId, draftId);
      }

      if (isComposerPersistenceFrozen()) return;
      router.push(`/garden/objects/${objectId}`);
    } catch {
      draftPersistencePausedRef.current = false;
      setSubmitState("failed");
      setMessage(workspaceCopy.composer.messages.preserveDraftError);
    } finally {
      endLocaleMutation();
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
    await deleteOfflineDraft(ownerUserId, draftId).catch(() => undefined);
    setMessage(
      mutation.status === "queued"
        ? localizedLocalSavedMessage(workspaceCopy)
        : localizedLocalDuplicateMessage(workspaceCopy),
    );
    await refreshQueue();
  }

  async function handleSync(mutation: OfflineMutation) {
    beginLocaleMutation();
    setSubmitState("syncing");
    setMessage(workspaceCopy.composer.messages.sending);

    try {
      const result = await syncOfflineJournalEntryMutation(mutation, {
        expectedOwnerUserId: ownerUserId,
      });
      if (isComposerPersistenceFrozen()) return;
      draftPersistencePausedRef.current = true;
      await deleteOfflineDraft(ownerUserId, draftId).catch(() => undefined);
      setSubmitState("synced");
      setMessage(workspaceCopy.composer.messages.saved);
      await refreshQueue();
      router.push(
        result.followUpValuePulse
          ? buildFollowUpValuePulseReadbackUrl(
              result.readbackUrl,
              result.followUpValuePulse.journalEntryId,
            )
          : result.readbackUrl,
      );
      router.refresh();
    } catch (error) {
      if (await resumeAuthentication(error)) return;
      setSubmitState("failed");
      setMessage(localizedJournalSaveErrorMessage(locale, error));
      await refreshQueue();
    } finally {
      endLocaleMutation();
    }
  }

  async function resumeAuthentication(
    error: unknown,
    payload?: OfflinePlantObjectEntryPayload,
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
            id: draftId,
            kind: "follow_up_entry",
            payload: {
              clientMutationId: payload.clientMutationId,
              plantObjectId: payload.plantObjectId,
              draft: {
                title: payload.title,
                body: payload.body,
                entryDate: payload.entryDate,
              },
              mentionSelections: payload.mentionSelections ?? [],
              topicTagInput,
              photoIntent: payload.photoIntent ?? null,
            },
          });
          if (!savedDraft) throw new Error("Offline drafts are unavailable.");
        } catch {
          setSubmitState("failed");
          setMessage(
            workspaceCopy.composer.messages.preserveDraftBeforeSignInError,
          );
          return true;
        }
      }

      setSubmitState("idle");
      setMessage(workspaceCopy.composer.messages.signInToContinue);
      router.push(error.authIntentUrl);
      return true;
    }
    return false;
  }

  async function buildPayload(): Promise<OfflinePlantObjectEntryPayload> {
    const photoIntent = photoFile
      ? await createComposerPhotoIntent(photoFile)
      : storedPhotoIntent;

    return {
      target: "plant_object_entry",
      plantObjectId: objectId,
      title: draft.title,
      body: draft.body,
      contentDocument: draft.contentDocument ?? undefined,
      entryDate: draft.entryDate,
      clientMutationId,
      syncStatus: isOnline ? "online" : "offline_queued",
      mentionSelections,
      topicTags: normalizeJournalTopicTagLabels(topicTagInput),
      photoIntent,
      photoIntentsByBlockId:
        Object.keys(photoIntentsByBlockId).length > 0
          ? photoIntentsByBlockId
          : undefined,
    };
  }

  function updateDraft<K extends keyof FollowUpEntryDraftFields>(
    field: K,
    value: FollowUpEntryDraftFields[K],
  ) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
    setDraft((current) => {
      const next = { ...current, [field]: value };
      return field === "body" || field === "entryDate"
        ? withSuggestedTitle(next)
        : next;
    });
  }

  function updateTitle(value: string) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
    titleEditedByUserRef.current = true;
    setDraft((current) => ({ ...current, title: value }));
  }

  function appendVoiceTranscript(transcript: string) {
    if (isComposerPersistenceFrozen()) return;
    draftPersistencePausedRef.current = false;
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
        setPhotoError(workspaceCopy.composer.photo.keepError);
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
      data-visual-creation-scenario={visualScenario?.id}
      inert={persistenceFrozen}
      data-composer-sign-out-frozen={persistenceFrozen || undefined}
      aria-busy={persistenceFrozen || undefined}
      className={`grid gap-4 transition-opacity ${persistenceFrozen ? "pointer-events-none opacity-60" : ""}`}
    >
      {persistenceFrozen ? (
        <p className="sr-only" role="status" aria-live="polite">
          {workspaceCopy.composer.saveStates.syncing}
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
            ? workspaceCopy.composer.connection.online
            : workspaceCopy.composer.connection.offline}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {workspaceCopy.composer.saveStates[submitState]}
        </span>
      </div>

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
            const existingBytes = sumOfflinePhotoIntentBytes(
              Object.values(photoIntentsByBlockId),
            );
            await assertOfflinePhotoQuotaAllows({
              existingBytes,
              nextBytes: file.size,
            });
            const mediaAssetId = crypto.randomUUID();
            const intent = await createComposerPhotoIntent(file);
            setPhotoIntentsByBlockId((current) => ({
              ...current,
              [mediaAssetId]: intent,
              [blockId]: intent,
            }));
            setStoredPhotoIntent(intent);
            setPhotoFile(file);
            const previewUrl = URL.createObjectURL(file);
            registerOwnerPreviewObjectUrl(ownerUserId, previewUrl);
            return {
              mediaAssetId,
              previewUrl,
            };
          }}
          onRemoveImageBlock={(blockId) => {
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
            ? ownerCopy.composer.actions.saveOnline
            : ownerCopy.composer.actions.saveOffline}
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

      {mutations.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {ownerCopy.composer.queue.title}
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
                    {mutationTitle(mutation, ownerCopy)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {mutationSubtitle(mutation, workspaceCopy, ownerCopy)}
                  </span>
                  {mutation.lastError ? (
                    <span className="text-xs text-destructive">
                      {workspaceCopy.composer.queue.retryError}
                    </span>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {mutation.status === "synced" ? (
                    <Link
                      href={
                        mutationReadbackUrl(mutation) ??
                        `/garden/objects/${objectId}`
                      }
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {workspaceCopy.composer.queue.open}
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
                      {localizedOfflineSaveActionLabel(
                        mutation.status,
                        workspaceCopy,
                      )}
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

function isObjectEntryMutationForObject(
  mutation: OfflineMutation,
  objectId: string,
) {
  const payload = mutation.payload as Partial<OfflineJournalEntryPayload>;
  return (
    payload.target === "plant_object_entry" &&
    payload.plantObjectId === objectId
  );
}

async function persistFollowUpComposerSnapshot(
  snapshot: FollowUpComposerPersistenceSnapshot,
  context: OwnerComposerPersistenceWriteContext,
) {
  if (!snapshot.hydrated) {
    throw new Error("The follow-up draft is not hydrated yet.");
  }

  const payload =
    snapshot.photoFile && !snapshot.payload.photoIntent
      ? {
          ...snapshot.payload,
          photoIntent: await createComposerPhotoIntent(snapshot.photoFile),
        }
      : snapshot.payload;

  if (hasPersistableFollowUpDraft(payload, snapshot.defaultEntryDate)) {
    await upsertOfflineDraft(
      {
        ownerUserId: snapshot.ownerUserId,
        id: snapshot.draftId,
        kind: "follow_up_entry",
        payload,
      },
      context,
    );
    return;
  }

  await deleteOfflineDraft(snapshot.ownerUserId, snapshot.draftId, context);
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

function mutationTitle(mutation: OfflineMutation, copy: OwnerObjectCopy) {
  if (mutation.status === "synced") return copy.composer.queue.saved;
  const payload = mutation.payload as Partial<OfflineJournalEntryPayload>;
  return payload.title || copy.composer.queue.untitled;
}

function mutationSubtitle(
  mutation: OfflineMutation,
  workspaceCopy: GardenWorkspaceCopy,
  ownerCopy: OwnerObjectCopy,
) {
  if (mutation.status === "synced") {
    return workspaceCopy.composer.queue.savedAndRemoved;
  }
  const payload = mutation.payload as Partial<OfflineJournalEntryPayload>;
  const parts = [
    localizedOfflineSaveStatusSentence(mutation.status, workspaceCopy),
    ownerCopy.composer.queue.context,
    payload.entryDate,
    payload.photoIntent ? workspaceCopy.composer.queue.photoLater : null,
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

function localizedLocalSavedMessage(copy: GardenWorkspaceCopy) {
  return formatGardenWorkspaceTemplate(copy.composer.offline.savedMessage, {
    entryKind: copy.composer.offline.followUp,
  });
}

function localizedLocalDuplicateMessage(copy: GardenWorkspaceCopy) {
  return formatGardenWorkspaceTemplate(copy.composer.offline.duplicateMessage, {
    entryKind: copy.composer.offline.followUp,
  });
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
