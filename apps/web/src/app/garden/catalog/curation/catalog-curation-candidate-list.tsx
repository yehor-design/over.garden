"use client";

import { CheckCircle2, GitMerge, Search, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";

interface CatalogCurationCandidate {
  id: string;
  displayName: string;
  normalizedName: string | null;
  locale: string;
  status: "provisional";
  source: string;
  createdAt: Date | string;
  affectedObjectCount: number;
}

interface CatalogCurationCandidateListProps {
  candidates: CatalogCurationCandidate[];
  confirmAction: (formData: FormData) => void | Promise<void>;
  mergeAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
}

type CatalogStatus = "idle" | "loading" | "ready" | "failed";

interface CatalogSuggestion {
  id: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: string;
  source: string;
}

export function CatalogCurationCandidateList({
  candidates,
  confirmAction,
  mergeAction,
  rejectAction,
}: CatalogCurationCandidateListProps) {
  if (candidates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        No pending catalog candidates.
      </p>
    );
  }

  return (
    <ol className="grid gap-4">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <CatalogCurationCandidateCard
            candidate={candidate}
            confirmAction={confirmAction}
            mergeAction={mergeAction}
            rejectAction={rejectAction}
          />
        </li>
      ))}
    </ol>
  );
}

interface CatalogCurationCandidateCardProps {
  candidate: CatalogCurationCandidate;
  confirmAction: (formData: FormData) => void | Promise<void>;
  mergeAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
}

function CatalogCurationCandidateCard({
  candidate,
  confirmAction,
  mergeAction,
  rejectAction,
}: CatalogCurationCandidateCardProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);
  const [selected, setSelected] = useState<CatalogSuggestion | null>(null);
  const [status, setStatus] = useState<CatalogStatus>("idle");

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (
      normalizedQuery.length < 2 ||
      (selected && normalizedQuery === selected.displayName)
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");

      try {
        const response = await fetch(
          `/api/garden/catalog/typeahead?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("Catalog suggestions unavailable.");

        const body = (await response.json()) as unknown;
        setSuggestions(parseCatalogSuggestions(body));
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSuggestions([]);
        setStatus("failed");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  function updateQuery(value: string) {
    setQuery(value);

    if (selected && value !== selected.displayName) {
      setSelected(null);
    }

    if (value.trim().length < 2) {
      setSuggestions([]);
      setStatus("idle");
    }
  }

  function selectSuggestion(suggestion: CatalogSuggestion) {
    setSelected(suggestion);
    setQuery(suggestion.displayName);
    setSuggestions([]);
    setStatus("idle");
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setSuggestions([]);
    setStatus("idle");
  }

  return (
    <article className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {candidate.displayName}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {candidate.locale}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {candidate.status}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {candidate.source}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Objects: {candidate.affectedObjectCount}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Created: {formatDate(candidate.createdAt)}
            </span>
          </div>
        </div>

        <form action={confirmAction}>
          <input type="hidden" name="candidateId" value={candidate.id} />
          <button type="submit" className={buttonVariants()}>
            <CheckCircle2 className="size-4" />
            Confirm
          </button>
        </form>
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        <form action={mergeAction} className="grid gap-3">
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input
            type="hidden"
            name="targetCatalogItemId"
            value={selected?.id ?? ""}
          />

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Merge target
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                maxLength={120}
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Search existing catalog item"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear merge target"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {selected ? (
              <span className="rounded-md border border-border px-2 py-1 text-foreground">
                Target: {selected.displayName}
              </span>
            ) : (
              <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                No merge target selected
              </span>
            )}
            {status === "loading" ? (
              <span className="text-muted-foreground">Searching...</span>
            ) : null}
            {status === "failed" ? (
              <span className="text-destructive">Suggestions unavailable.</span>
            ) : null}
          </div>

          {suggestions.length > 0 ? (
            <ul className="grid gap-2">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onClick={() => selectSuggestion(suggestion)}
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

          <button
            type="submit"
            disabled={!selected}
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            <GitMerge className="size-4" />
            Merge
          </button>
        </form>

        <form action={rejectAction} className="border-t border-border pt-3">
          <input type="hidden" name="candidateId" value={candidate.id} />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            <XCircle className="size-4" />
            Reject
          </button>
        </form>
      </div>
    </article>
  );
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

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
