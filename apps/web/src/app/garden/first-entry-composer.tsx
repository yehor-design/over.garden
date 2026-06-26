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
  Search,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { COARSE_REGION_OPTIONS } from "@/lib/garden/regions";
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
type CatalogStatus = "idle" | "loading" | "ready" | "failed";

interface CatalogSuggestion {
  id: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: string;
  source: string;
}

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
    title: "",
    body: "",
    entryDate: today,
    locationVisibility: "hidden",
    coarseRegionCode: "",
  });
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSuggestions, setCatalogSuggestions] = useState<
    CatalogSuggestion[]
  >([]);
  const [selectedCatalogItem, setSelectedCatalogItem] =
    useState<CatalogSuggestion | null>(null);
  const [userAddedCatalogName, setUserAddedCatalogName] = useState<
    string | null
  >(null);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("idle");
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

  useEffect(() => {
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
        setCatalogSuggestions(parseCatalogSuggestions(body));
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
  }, [catalogQuery, selectedCatalogItem, userAddedCatalogName]);

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
      catalogItemId: selectedCatalogItem?.id ?? null,
      userAddedCatalogName:
        !selectedCatalogItem && userAddedCatalogName
          ? userAddedCatalogName
          : null,
      varietyText: selectedCatalogItem?.displayName ?? userAddedCatalogName,
      locationVisibility: draft.locationVisibility,
      coarseRegionCode:
        draft.locationVisibility === "region" ? draft.coarseRegionCode : null,
      clientMutationId,
      syncStatus: isOnline ? "online" : "offline_queued",
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

  function updateLocationVisibility(value: string) {
    setDraft((current) => ({
      ...current,
      locationVisibility: value === "region" ? "region" : "hidden",
      coarseRegionCode: value === "region" ? current.coarseRegionCode : "",
    }));
  }

  function updateCatalogQuery(value: string) {
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
    setSelectedCatalogItem(suggestion);
    setUserAddedCatalogName(null);
    setCatalogQuery(suggestion.displayName);
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
  }

  function addMissingCatalogName() {
    const displayName = catalogQuery.trim().replace(/\s+/g, " ");
    if (displayName.length < 1) return;

    setSelectedCatalogItem(null);
    setUserAddedCatalogName(displayName);
    setCatalogQuery(displayName);
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
  }

  function chooseUnknownCatalog() {
    setSelectedCatalogItem(null);
    setUserAddedCatalogName(null);
    setCatalogQuery("");
    setCatalogSuggestions([]);
    setCatalogStatus("idle");
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Location
          <select
            name="locationVisibility"
            value={draft.locationVisibility}
            onChange={(event) => updateLocationVisibility(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="hidden">Hidden</option>
            <option value="region">Region</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Coarse region
          <select
            name="coarseRegionCode"
            required={draft.locationVisibility === "region"}
            disabled={draft.locationVisibility === "hidden"}
            value={draft.coarseRegionCode}
            onChange={(event) =>
              updateDraft("coarseRegionCode", event.target.value)
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none disabled:opacity-60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Choose region</option>
            {COARSE_REGION_OPTIONS.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Catalog match
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="catalogQuery"
              maxLength={120}
              value={catalogQuery}
              onChange={(event) => updateCatalogQuery(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Search seeded catalog or keep unknown"
              autoComplete="off"
            />
            {catalogQuery ? (
              <button
                type="button"
                onClick={chooseUnknownCatalog}
                className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear catalog match"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {selectedCatalogItem ? (
            <span className="rounded-md border border-border px-2 py-1 text-foreground">
              Selected: {selectedCatalogItem.displayName}
            </span>
          ) : userAddedCatalogName ? (
            <span className="rounded-md border border-border px-2 py-1 text-foreground">
              Added missing: {userAddedCatalogName}
            </span>
          ) : (
            <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              Variety: Unknown
            </span>
          )}
          <button
            type="button"
            onClick={chooseUnknownCatalog}
            className="rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted"
          >
            Use Unknown
          </button>
          {!selectedCatalogItem && catalogQuery.trim().length >= 2 ? (
            <button
              type="button"
              onClick={addMissingCatalogName}
              className="rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted"
            >
              Add missing name
            </button>
          ) : null}
          {catalogStatus === "loading" ? (
            <span className="text-muted-foreground">Searching...</span>
          ) : null}
          {catalogStatus === "failed" ? (
            <span className="text-destructive">
              Suggestions unavailable. Unknown still works.
            </span>
          ) : null}
        </div>

        {catalogSuggestions.length > 0 ? (
          <ul className="grid gap-2">
            {catalogSuggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  onClick={() => selectCatalogSuggestion(suggestion)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {suggestion.displayName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {suggestion.canonicalName} · {suggestion.locale}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {suggestion.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
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
    payload.locationVisibility === "region" && payload.coarseRegionCode
      ? payload.coarseRegionCode
      : "location hidden",
    payload.catalogItemId
      ? "catalog selected"
      : payload.userAddedCatalogName
        ? "missing name"
        : "unknown variety",
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

function parseCatalogSuggestions(value: unknown): CatalogSuggestion[] {
  if (!value || typeof value !== "object") return [];

  const suggestions = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];

  return suggestions.flatMap((suggestion) => {
    if (!suggestion || typeof suggestion !== "object") return [];

    const candidate = suggestion as Partial<CatalogSuggestion>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.displayName !== "string" ||
      typeof candidate.canonicalName !== "string" ||
      typeof candidate.locale !== "string" ||
      typeof candidate.status !== "string" ||
      typeof candidate.source !== "string"
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        displayName: candidate.displayName,
        canonicalName: candidate.canonicalName,
        locale: candidate.locale,
        status: candidate.status,
        source: candidate.source,
      },
    ];
  });
}
