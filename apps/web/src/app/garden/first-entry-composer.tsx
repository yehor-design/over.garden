"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
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
  enqueueOfflineMutation,
  listOfflineMutations,
  type OfflineJournalEntryPayload,
  type OfflineMutation,
} from "@/lib/offline/queue";
import {
  submitJournalEntryPayload,
  syncOfflineJournalEntryMutation,
} from "@/lib/offline/journal-entry-sync";

interface FirstEntryComposerProps {
  today: string;
  initialClientMutationId: string;
}

type SubmitState = "idle" | "queued" | "syncing" | "synced" | "failed";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function FirstEntryComposer({
  today,
  initialClientMutationId,
}: FirstEntryComposerProps) {
  const router = useRouter();
  const [clientMutationId] = useState(initialClientMutationId);
  const [draft, setDraft] = useState({
    spaceName: "",
    plantName: "",
    varietyText: "",
    title: "",
    body: "",
    entryDate: today,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState(
    "The server strips photo metadata before readback.",
  );
  const [mutations, setMutations] = useState<OfflineMutation[]>([]);

  const refreshQueue = useCallback(async () => {
    const localMutations = await listOfflineMutations([
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
  }, []);

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

  const photoHelp = useMemo(() => {
    if (photoError) return photoError;
    if (!photoFile) return "Optional JPEG, PNG, or WebP.";
    if (!isOnline) {
      return `${photoFile.name} is queued as photo intent; upload starts after connection returns.`;
    }
    return `${photoFile.name} will upload to private quarantine on save.`;
  }, [isOnline, photoError, photoFile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (photoError) {
      setSubmitState("failed");
      setMessage(photoError);
      return;
    }

    const payload = buildPayload();

    if (!isOnline) {
      await enqueuePayload(payload);
      return;
    }

    setSubmitState("syncing");
    setMessage("Saving entry...");

    try {
      const result = await submitJournalEntryPayload(payload, {
        idempotencyKey: clientMutationId,
      });
      setSubmitState("synced");
      setMessage("Synced.");
      router.push(result.readbackUrl);
    } catch (error) {
      setSubmitState("failed");
      setMessage(normalizeError(error));
    }
  }

  async function enqueuePayload(payload: OfflineJournalEntryPayload) {
    const mutation = await enqueueOfflineMutation({
      kind: "journal_entry",
      payload,
      idempotencyKey: clientMutationId,
    });

    setSubmitState("queued");
    setMessage(
      mutation.status === "queued"
        ? "Saved locally. Sync when connection returns."
        : "This entry is already in the local queue.",
    );
    await refreshQueue();
  }

  async function handleSync(mutation: OfflineMutation) {
    setSubmitState("syncing");
    setMessage("Syncing queued entry...");

    try {
      const result = await syncOfflineJournalEntryMutation(mutation);
      setSubmitState("synced");
      setMessage("Synced.");
      await refreshQueue();
      router.push(result.readbackUrl);
    } catch (error) {
      setSubmitState("failed");
      setMessage(normalizeError(error));
      await refreshQueue();
    }
  }

  function buildPayload(): OfflineJournalEntryPayload {
    return {
      ...draft,
      clientMutationId,
      photoIntent: photoFile
        ? {
            fileName: photoFile.name,
            contentType: photoFile.type,
            size: photoFile.size,
            lastModified: photoFile.lastModified,
            blob: photoFile,
          }
        : null,
    };
  }

  function updateDraft(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handlePhotoChange(file: File | undefined) {
    setPhotoError(null);

    if (!file) {
      setPhotoFile(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setPhotoFile(null);
      setPhotoError("Use a JPEG, PNG, or WebP photo.");
      return;
    }

    setPhotoFile(file);
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
          {statusLabel(submitState)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Space
          <input
            name="spaceName"
            required
            maxLength={120}
            value={draft.spaceName}
            onChange={(event) => updateDraft("spaceName", event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Balcony"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Plant
          <input
            name="plantName"
            required
            maxLength={120}
            value={draft.plantName}
            onChange={(event) => updateDraft("plantName", event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Cherry tomato"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Variety
        <input
          name="varietyText"
          maxLength={120}
          value={draft.varietyText}
          onChange={(event) => updateDraft("varietyText", event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Unknown"
        />
      </label>

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
            placeholder="First flowers"
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
          className="min-h-36 rounded-md border border-input bg-background px-3 py-2 text-base font-normal text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="The plant recovered after repotting and has two new flower clusters."
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
          {isOnline ? "Save first entry" : "Queue first entry"}
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
          <h3 className="text-sm font-semibold text-foreground">Local queue</h3>
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
                      href={mutationReadbackUrl(mutation) ?? "/garden"}
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
                      {mutation.status === "failed" ? "Retry" : "Sync"}
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

function statusLabel(status: SubmitState) {
  switch (status) {
    case "queued":
      return "Queued";
    case "syncing":
      return "Syncing";
    case "synced":
      return "Synced";
    case "failed":
      return "Failed";
    default:
      return "Ready";
  }
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
  return payload.title || "Untitled entry";
}

function mutationSubtitle(mutation: OfflineMutation) {
  const payload = mutation.payload as Partial<OfflineJournalEntryPayload>;
  const parts = [
    mutation.status,
    payload.plantName,
    payload.entryDate,
    payload.photoIntent ? "photo intent" : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function mutationReadbackUrl(mutation: OfflineMutation) {
  const result = mutation.syncResult as { readbackUrl?: unknown } | undefined;
  return typeof result?.readbackUrl === "string" ? result.readbackUrl : null;
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "Sync failed.";
}
