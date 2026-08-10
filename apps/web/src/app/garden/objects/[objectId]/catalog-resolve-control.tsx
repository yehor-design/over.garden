"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { buttonVariants } from "@/components/ui/button";
import type { VarietyState } from "@/db/schema";
import {
  catalogItemIdForSelection,
  parseCatalogTypeaheadResponse,
} from "@/lib/garden/catalog-typeahead-contract";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import {
  buildGardenCatalogTrustMetadata,
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
  type GardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";

interface CatalogResolveControlProps {
  locale: InterfaceLocale;
  objectId: string;
  currentVarietyText: string | null;
  currentVarietyState: VarietyState;
  action: (formData: FormData) => Promise<unknown>;
}

type CatalogStatus = "idle" | "loading" | "ready" | "failed";

type CatalogSuggestion = FirstEntryCatalogSelection;

export function CatalogResolveControl({
  locale,
  objectId,
  currentVarietyText,
  currentVarietyState,
  action,
}: CatalogResolveControlProps) {
  const copy = getOwnerObjectCopy(locale).catalog;
  const workspaceCopy = getGardenWorkspaceCopy(locale);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);
  const [selected, setSelected] = useState<CatalogSuggestion | null>(null);
  const [status, setStatus] = useState<CatalogStatus>("idle");
  const selectedTrust = selected
    ? buildGardenCatalogTrustMetadata(locale, selected)
    : null;

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
        setSuggestions(parseCatalogTypeaheadResponse(body));
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
    <section className="grid min-w-0 gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">
          {formatGardenWorkspaceTemplate(copy.current, {
            value: currentVarietyText ?? copy.noName,
            state: localizedVarietyStateLabel(
              currentVarietyState,
              workspaceCopy,
            ),
          })}
        </p>
      </div>

      <DocumentMutationActionForm
        action={action}
        className="grid min-w-0 gap-3"
      >
        <input type="hidden" name="objectId" value={objectId} />
        <input
          type="hidden"
          name="catalogItemId"
          value={catalogItemIdForSelection(selected) ?? ""}
        />

        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
          {copy.matchLabel}
          <span className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              maxLength={120}
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder={copy.placeholder}
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={clearSelection}
                className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={copy.clearAria}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {selected ? (
            <span className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border px-2 py-1 text-foreground">
              <span>
                {copy.matched} {selected.displayName} ·{" "}
                {selectedTrust?.trustLabel} ·{" "}
                {localizedCatalogKindLabel(selected.catalogKind, workspaceCopy)}
              </span>
              <span className="text-muted-foreground">
                {selectedTrust?.disambiguationLabel} ·{" "}
                {selectedTrust?.sourceCaveat}
              </span>
            </span>
          ) : (
            <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              {copy.noMatch}
            </span>
          )}
          {status === "loading" ? (
            <span className="text-muted-foreground">{copy.searching}</span>
          ) : null}
          {status === "failed" ? (
            <span className="text-destructive">{copy.unavailable}</span>
          ) : null}
        </div>

        {suggestions.length > 0 ? (
          <ul className="grid gap-2">
            {suggestions.map((suggestion) => {
              const trust = buildGardenCatalogTrustMetadata(locale, suggestion);

              return (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onClick={() => selectSuggestion(suggestion)}
                    className="flex w-full items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {suggestion.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {suggestion.canonicalName} · {trust.disambiguationLabel}
                      </span>
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

        <button
          type="submit"
          disabled={!selected}
          className={buttonVariants({
            className: "self-start",
          })}
        >
          {copy.save}
        </button>
      </DocumentMutationActionForm>
    </section>
  );
}

function localizedVarietyStateLabel(
  value: VarietyState,
  copy: GardenWorkspaceCopy,
) {
  if (value === "selected") return copy.composer.varietyStates.selected;
  if (value === "user_added") return copy.composer.varietyStates.userAdded;
  if (value === "free_text") return copy.composer.varietyStates.freeText;
  return copy.composer.varietyStates.unknown;
}

function localizedCatalogKindLabel(
  value: string | null | undefined,
  copy: GardenWorkspaceCopy,
) {
  if (value === "breed") return copy.composer.catalogKinds.breed;
  if (value === "species") return copy.composer.catalogKinds.species;
  if (value === "plant_variety") {
    return copy.composer.catalogKinds.plantVariety;
  }
  return copy.composer.catalogKinds.match;
}
