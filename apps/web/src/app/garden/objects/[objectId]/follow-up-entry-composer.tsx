"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
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
  UploadCloud,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  journalSaveErrorMessage,
  journalSaveStateLabel,
  localDuplicateMessage,
  localSavedMessage,
  offlineSaveActionLabel,
  offlineSaveStatusSentence,
  photoHelpText,
} from "@/lib/garden/pilot-ux-copy";
import {
  createOfflinePhotoIntent,
  enqueueOfflineMutation,
  listOfflineMutations,
  type OfflineJournalEntryPayload,
  type OfflineMutation,
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
import { buildFollowUpValuePulseReadbackUrl } from "@/lib/garden/follow-up-value-pulse";
import {
  submitJournalEntryPayload,
  syncOfflineJournalEntryMutation,
} from "@/lib/offline/journal-entry-sync";

interface FollowUpEntryComposerProps {
  objectId: string;
  today: string;
  initialClientMutationId: string;
}

type SubmitState = "idle" | "queued" | "syncing" | "synced" | "failed";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function FollowUpEntryComposer({
  objectId,
  today,
  initialClientMutationId,
}: FollowUpEntryComposerProps) {
  const router = useRouter();
  const draftPersistencePausedRef = useRef(false);
  const draftId = followUpEntryDraftId(objectId);
  const [clientMutationId, setClientMutationId] = useState(
    initialClientMutationId,
  );
  const [draft, setDraft] = useState<FollowUpEntryDraftFields>({
    title: "",
    body: "",
    entryDate: today,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [storedPhotoIntent, setStoredPhotoIntent] =
    useState<OfflinePhotoIntent | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState(
    "Save a dated follow-up on this existing plant.",
  );
  const [mutations, setMutations] = useState<OfflineMutation[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const refreshQueue = useCallback(async () => {
    const localMutations = await listOfflineMutations([
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
  }, [objectId]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
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
  }, [refreshQueue]);

  useEffect(() => {
    let cancelled = false;

    void getOfflineDraft<FollowUpEntryDraftPayload>(draftId).then(
      (storedDraft) => {
        if (cancelled) return;

        if (storedDraft && storedDraft.payload.plantObjectId === objectId) {
          setClientMutationId(storedDraft.payload.clientMutationId);
          setDraft(storedDraft.payload.draft);
          setStoredPhotoIntent(storedDraft.payload.photoIntent);
          setMessage("Draft restored on this device.");
        }

        setDraftHydrated(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [draftId, objectId]);

  useEffect(() => {
    if (!draftHydrated) return;

    const payload: FollowUpEntryDraftPayload = {
      clientMutationId,
      plantObjectId: objectId,
      draft,
      photoIntent: storedPhotoIntent,
    };

    const timer = window.setTimeout(() => {
      if (draftPersistencePausedRef.current) return;

      if (hasPersistableFollowUpDraft(payload, today)) {
        void upsertOfflineDraft({
          id: draftId,
          kind: "follow_up_entry",
          payload,
        });
      } else {
        void deleteOfflineDraft(draftId);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    clientMutationId,
    draft,
    draftHydrated,
    draftId,
    objectId,
    storedPhotoIntent,
    today,
  ]);

  const photoHelp = useMemo(() => {
    return photoHelpText({
      fileName: photoFile?.name ?? storedPhotoIntent?.fileName ?? null,
      isOnline,
      photoError,
    });
  }, [isOnline, photoError, photoFile, storedPhotoIntent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (photoError) {
      setSubmitState("failed");
      setMessage(photoError);
      return;
    }

    let payload: OfflineJournalEntryPayload;
    try {
      payload = await buildPayload();
    } catch {
      setSubmitState("failed");
      setMessage(
        "We couldn't read that photo on this device. Choose it again.",
      );
      return;
    }

    if (!isOnline) {
      await enqueuePayload(payload);
      return;
    }

    setSubmitState("syncing");
    setMessage("Saving private follow-up...");

    try {
      const result = await submitJournalEntryPayload(payload, {
        idempotencyKey: clientMutationId,
      });
      draftPersistencePausedRef.current = true;
      await deleteOfflineDraft(draftId);
      setSubmitState("synced");
      setMessage("Saved to your garden.");
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
      setSubmitState("failed");
      setMessage(journalSaveErrorMessage(error));
    }
  }

  async function enqueuePayload(payload: OfflineJournalEntryPayload) {
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload,
      idempotencyKey: clientMutationId,
    });

    setSubmitState("queued");
    draftPersistencePausedRef.current = true;
    await deleteOfflineDraft(draftId);
    setMessage(
      mutation.status === "queued"
        ? localSavedMessage("follow-up")
        : localDuplicateMessage("follow-up"),
    );
    await refreshQueue();
  }

  async function handleSync(mutation: OfflineMutation) {
    setSubmitState("syncing");
    setMessage("Sending saved follow-up to your garden...");

    try {
      const result = await syncOfflineJournalEntryMutation(mutation);
      draftPersistencePausedRef.current = true;
      await deleteOfflineDraft(draftId);
      setSubmitState("synced");
      setMessage("Saved to your garden.");
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
      setSubmitState("failed");
      setMessage(journalSaveErrorMessage(error));
      await refreshQueue();
    }
  }

  async function buildPayload(): Promise<OfflineJournalEntryPayload> {
    const photoIntent = photoFile
      ? await createOfflinePhotoIntent(photoFile)
      : storedPhotoIntent;

    return {
      target: "plant_object_entry",
      plantObjectId: objectId,
      title: draft.title,
      body: draft.body,
      entryDate: draft.entryDate,
      clientMutationId,
      syncStatus: isOnline ? "online" : "offline_queued",
      photoIntent,
    };
  }

  function updateDraft<K extends keyof FollowUpEntryDraftFields>(
    field: K,
    value: FollowUpEntryDraftFields[K],
  ) {
    draftPersistencePausedRef.current = false;
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handlePhotoChange(file: File | undefined) {
    draftPersistencePausedRef.current = false;
    setPhotoError(null);

    if (!file) {
      setPhotoFile(null);
      setStoredPhotoIntent(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setPhotoFile(null);
      setStoredPhotoIntent(null);
      setPhotoError("Use a JPEG, PNG, or WebP photo.");
      return;
    }

    setPhotoFile(file);
    void createOfflinePhotoIntent(file)
      .then((intent) => setStoredPhotoIntent(intent))
      .catch(() => {
        setPhotoFile(null);
        setStoredPhotoIntent(null);
        setPhotoError(
          "We couldn't keep that photo on this device. Choose it again.",
        );
      });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
          {isOnline ? (
            <Wifi className="size-3.5" />
          ) : (
            <WifiOff className="size-3.5" />
          )}
          {isOnline ? "Online" : "Offline"}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {journalSaveStateLabel(submitState)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground sm:col-span-2">
          Entry title
          <input
            name="title"
            required
            maxLength={140}
            value={draft.title}
            onChange={(event) => updateDraft("title", event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Second flowering wave"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Date
          <input
            type="date"
            name="entryDate"
            value={draft.entryDate}
            onChange={(event) => updateDraft("entryDate", event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Note
        <textarea
          name="body"
          required
          minLength={1}
          maxLength={2000}
          value={draft.body}
          onChange={(event) => updateDraft("body", event.target.value)}
          className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-base font-normal text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Compared with the previous entry, the new leaves are stronger and the soil stayed moist longer."
        />
      </label>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              handlePhotoChange(event.currentTarget.files?.[0])
            }
            className="block w-full text-sm font-normal text-muted-foreground file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground"
          />
        </label>
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitState === "syncing"}>
          <UploadCloud className="size-4" />
          {isOnline ? "Save follow-up" : "Save on this device"}
        </Button>
        <p
          className={
            submitState === "failed"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {message}
        </p>
      </div>

      {mutations.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">
            Saved follow-ups on this device
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
                    {mutationTitle(mutation)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {mutationSubtitle(mutation)}
                  </span>
                  {mutation.lastError ? (
                    <span className="text-xs text-destructive">
                      {mutation.lastError}
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
                      Open
                    </Link>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !isOnline ||
                        mutation.status === "syncing" ||
                        submitState === "syncing"
                      }
                      onClick={() => void handleSync(mutation)}
                    >
                      <RefreshCw className="size-4" />
                      {offlineSaveActionLabel(mutation.status)}
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

function mutationTitle(mutation: OfflineMutation) {
  const payload = mutation.payload as Partial<OfflineJournalEntryPayload>;
  return payload.title || "Untitled follow-up";
}

function mutationSubtitle(mutation: OfflineMutation) {
  const payload = mutation.payload as Partial<OfflineJournalEntryPayload>;
  const parts = [
    offlineSaveStatusSentence(mutation.status),
    "Follow-up for this plant",
    payload.entryDate,
    payload.photoIntent ? "Photo will upload later" : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function mutationReadbackUrl(mutation: OfflineMutation) {
  const result = mutation.syncResult as { readbackUrl?: unknown } | undefined;
  return typeof result?.readbackUrl === "string" ? result.readbackUrl : null;
}
