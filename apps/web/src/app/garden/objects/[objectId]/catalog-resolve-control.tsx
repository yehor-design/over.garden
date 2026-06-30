"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { CatalogKind, VarietyState } from "@/db/schema";
import {
  catalogKindLabel,
  catalogSuggestionStatusLabel,
  varietyStateLabel,
} from "@/lib/garden/pilot-ux-copy";

interface CatalogResolveControlProps {
  objectId: string;
  currentVarietyText: string | null;
  currentVarietyState: VarietyState;
  action: (formData: FormData) => void | Promise<void>;
}

type CatalogStatus = "idle" | "loading" | "ready" | "failed";

interface CatalogSuggestion {
  id: string;
  displayName: string;
  canonicalName: string;
  catalogKind: CatalogKind;
  locale: string;
  status: string;
  source: string;
}

export function CatalogResolveControl({
  objectId,
  currentVarietyText,
  currentVarietyState,
  action,
}: CatalogResolveControlProps) {
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
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Match this object to the catalog
        </h2>
        <p className="text-sm text-muted-foreground">
          Current: {currentVarietyText ?? "No catalog name yet"} ·{" "}
          {varietyStateLabel(currentVarietyState)}
        </p>
      </div>

      <form action={action} className="grid gap-3">
        <input type="hidden" name="objectId" value={objectId} />
        <input type="hidden" name="catalogItemId" value={selected?.id ?? ""} />

        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Catalog match
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              maxLength={120}
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Search seeded catalog"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={clearSelection}
                className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear catalog match"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {selected ? (
            <span className="rounded-md border border-border px-2 py-1 text-foreground">
              Matched in catalog: {selected.displayName} ·{" "}
              {catalogKindLabel(selected.catalogKind)}
            </span>
          ) : (
            <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              No catalog match chosen yet
            </span>
          )}
          {status === "loading" ? (
            <span className="text-muted-foreground">Searching...</span>
          ) : null}
          {status === "failed" ? (
            <span className="text-destructive">
              Suggestions unavailable. The object stays unchanged.
            </span>
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

        <button
          type="submit"
          disabled={!selected}
          className={buttonVariants({
            className: "self-start",
          })}
        >
          Save catalog match
        </button>
      </form>
    </section>
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
      !isSelectableCatalogKind(candidate.catalogKind) ||
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
        catalogKind: candidate.catalogKind,
        locale: candidate.locale,
        status: candidate.status,
        source: candidate.source,
      },
    ];
  });
}

function isSelectableCatalogKind(value: unknown): value is CatalogKind {
  return value === "plant_variety" || value === "species" || value === "breed";
}
