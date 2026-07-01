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
import type { PlantObjectKind } from "@/db/schema";
import type {
  ActivationSource,
  FirstEntryCatalogSelection,
} from "@/lib/garden/entry-contracts";
import { defaultObjectKindForCatalogSelection } from "@/lib/garden/catalog-object-kind";
import {
  catalogKindLabel,
  catalogSuggestionStatusLabel,
  journalSaveErrorMessage,
  journalSaveStateLabel,
  locationVisibilityHelpText,
  localDuplicateMessage,
  localSavedMessage,
  offlineSaveActionLabel,
  offlineSaveStatusLabel,
  offlineSaveStatusSentence,
  photoHelpText,
  plantObjectKindLabel,
  varietyStateLabel,
} from "@/lib/garden/pilot-ux-copy";
import {
  COARSE_REGION_OPTIONS,
  getCoarseRegionLabel,
} from "@/lib/garden/regions";
import {
  createOfflinePhotoIntent,
  enqueueOfflineMutation,
  listOfflineMutations,
  type OfflineFirstPlantEntryPayload,
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
  initialCatalogItem?: FirstEntryCatalogSelection | null;
  activationSource?: ActivationSource | null;
}

type SubmitState = "idle" | "queued" | "syncing" | "synced" | "failed";
type CatalogStatus = "idle" | "loading" | "ready" | "failed";

type CatalogSuggestion = FirstEntryCatalogSelection;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function FirstEntryComposer({
  today,
  initialClientMutationId,
  initialCatalogItem = null,
  activationSource = null,
}: FirstEntryComposerProps) {
  const router = useRouter();
  const [clientMutationId] = useState(initialClientMutationId);
  const [draft, setDraft] = useState({
    spaceName: "",
    plantName: "",
    objectKind: "plant" as PlantObjectKind,
    title: "",
    body: "",
    entryDate: today,
    locationVisibility: "hidden",
    coarseRegionCode: "",
  });
  const [catalogQuery, setCatalogQuery] = useState(
    initialCatalogItem?.displayName ?? "",
  );
  const [catalogSuggestions, setCatalogSuggestions] = useState<
    CatalogSuggestion[]
  >([]);
  const [selectedCatalogItem, setSelectedCatalogItem] =
    useState<CatalogSuggestion | null>(initialCatalogItem);
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
    "Private by default. You choose later whether an entry becomes public.",
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
    return photoHelpText({
      fileName: photoFile?.name ?? null,
      isOnline,
      photoError,
    });
  }, [isOnline, photoError, photoFile]);

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
    setMessage("Saving private entry...");

    try {
      const result = await submitJournalEntryPayload(payload, {
        idempotencyKey: clientMutationId,
      });
      setSubmitState("synced");
      setMessage("Saved to your garden.");
      router.push(result.readbackUrl);
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
    setMessage(
      mutation.status === "queued"
        ? localSavedMessage("entry")
        : localDuplicateMessage("entry"),
    );
    await refreshQueue();
  }

  async function handleSync(mutation: OfflineMutation) {
    setSubmitState("syncing");
    setMessage("Sending saved entry to your garden...");

    try {
      const result = await syncOfflineJournalEntryMutation(mutation);
      setSubmitState("synced");
      setMessage("Saved to your garden.");
      await refreshQueue();
      router.push(result.readbackUrl);
    } catch (error) {
      setSubmitState("failed");
      setMessage(journalSaveErrorMessage(error));
      await refreshQueue();
    }
  }

  async function buildPayload(): Promise<OfflineJournalEntryPayload> {
    const photoIntent = photoFile
      ? await createOfflinePhotoIntent(photoFile)
      : null;

    return {
      target: "first_plant_entry",
      ...draft,
      objectKind: draft.objectKind,
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
      activationSource,
      syncStatus: isOnline ? "online" : "offline_queued",
      photoIntent,
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
    setDraft((current) => ({
      ...current,
      objectKind: defaultObjectKindForCatalogSelection(
        suggestion.catalogKind,
        suggestion.source,
      ),
    }));
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
          {journalSaveStateLabel(submitState)}
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
          Living object
          <input
            name="plantName"
            required
            maxLength={120}
            value={draft.plantName}
            onChange={(event) => updateDraft("plantName", event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Cherry tomato or Carpathian colony"
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
          <span className="text-xs leading-5 font-normal text-muted-foreground">
            {locationVisibilityHelpText(draft.locationVisibility)}
          </span>
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
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
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
              placeholder="Search catalog or keep without match"
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
              Matched in catalog: {selectedCatalogItem.displayName} ·{" "}
              {catalogKindLabel(
                selectedCatalogItem.catalogKind,
                draft.objectKind,
              )}{" "}
              · {plantObjectKindLabel(draft.objectKind)}
            </span>
          ) : userAddedCatalogName ? (
            <span className="rounded-md border border-border px-2 py-1 text-foreground">
              Saved with your catalog name: {userAddedCatalogName}
            </span>
          ) : (
            <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              No catalog match yet
            </span>
          )}
          <button
            type="button"
            onClick={chooseUnknownCatalog}
            className="rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted"
          >
            Keep without match
          </button>
          {!selectedCatalogItem && catalogQuery.trim().length >= 2 ? (
            <button
              type="button"
              onClick={addMissingCatalogName}
              className="rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted"
            >
              Use this name
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
                      {suggestion.canonicalName} ·{" "}
                      {catalogKindLabel(suggestion.catalogKind)} ·{" "}
                      {suggestion.locale}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {catalogSuggestionStatusLabel(suggestion.status)}
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
          {isOnline ? "Save first entry" : "Save on this device"}
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
            Saved entries on this device
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
  if (payload.target === "plant_object_entry") {
    const parts = [
      offlineSaveStatusSentence(mutation.status),
      "Follow-up for an existing plant",
      payload.entryDate,
      payload.photoIntent ? "Photo will upload later" : null,
    ].filter(Boolean);

    return parts.join(" · ");
  }

  const firstEntryPayload = payload as Partial<OfflineFirstPlantEntryPayload>;
  const regionLabel =
    firstEntryPayload.locationVisibility === "region" &&
    firstEntryPayload.coarseRegionCode
      ? getCoarseRegionLabel(firstEntryPayload.coarseRegionCode)
      : null;
  const parts = [
    offlineSaveStatusLabel(mutation.status),
    firstEntryPayload.plantName,
    regionLabel ? `Region: ${regionLabel}` : "Location hidden",
    firstEntryPayload.catalogItemId
      ? varietyStateLabel("selected")
      : firstEntryPayload.userAddedCatalogName
        ? varietyStateLabel("user_added")
        : varietyStateLabel("unknown"),
    firstEntryPayload.entryDate,
    firstEntryPayload.photoIntent ? "Photo will upload later" : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function mutationReadbackUrl(mutation: OfflineMutation) {
  const result = mutation.syncResult as { readbackUrl?: unknown } | undefined;
  return typeof result?.readbackUrl === "string" ? result.readbackUrl : null;
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
      !isSelectableCatalogKind(candidate.catalogKind) ||
      typeof candidate.locale !== "string" ||
      !isSelectableCatalogStatus(candidate.status) ||
      typeof candidate.source !== "string"
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        displayName: candidate.displayName,
        canonicalName: candidate.canonicalName,
        catalogKind: candidate.catalogKind,
        locale: candidate.locale,
        status: candidate.status,
        source: candidate.source,
      },
    ];
  });
}

function isSelectableCatalogKind(
  value: unknown,
): value is CatalogSuggestion["catalogKind"] {
  return value === "plant_variety" || value === "species" || value === "breed";
}

function isSelectableCatalogStatus(
  value: unknown,
): value is CatalogSuggestion["status"] {
  return value === "seeded" || value === "confirmed";
}
