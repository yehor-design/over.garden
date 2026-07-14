"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { PublicObjectCatalogCopy } from "@/lib/public-object-catalog-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type {
  PublicObjectCatalogIdentityFilter,
  PublicObjectCatalogIdentityState,
  PublicObjectCatalogKind,
} from "@/server/public-object-catalog-repository";

interface PublicObjectSuggestion {
  key: string;
  label: string;
  href: string;
  objectKind: Exclude<PublicObjectCatalogKind, "all">;
  identityState: PublicObjectCatalogIdentityState;
  journalCount: number;
}

export function PublicObjectCatalogSearch({
  locale,
  copy,
  query,
  kind,
  identity,
}: {
  locale: PublicLocale;
  copy: PublicObjectCatalogCopy;
  query: string;
  kind: PublicObjectCatalogKind;
  identity: PublicObjectCatalogIdentityFilter;
}) {
  const [value, setValue] = useState(query);
  const [suggestions, setSuggestions] = useState<PublicObjectSuggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const listboxId = useId();

  useEffect(() => {
    const normalized = value.trim();
    if (normalized.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({ q: normalized });
        if (kind !== "all") params.set("kind", kind);
        if (identity !== "all") params.set("identity", identity);
        const response = await fetch(
          `/api/public/objects/suggestions?${params.toString()}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Suggestions unavailable");
        const body: unknown = await response.json();
        setSuggestions(parseSuggestions(body));
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setSuggestions([]);
        setStatus("error");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [identity, kind, value]);

  function clear() {
    setValue("");
    setSuggestions([]);
    setStatus("idle");
  }

  return (
    <form
      action={localizedPath(locale, "/objects")}
      method="get"
      role="search"
      className="relative grid gap-2"
    >
      {kind !== "all" ? <input type="hidden" name="kind" value={kind} /> : null}
      {identity !== "all" ? (
        <input type="hidden" name="identity" value={identity} />
      ) : null}
      <label htmlFor={`${listboxId}-input`} className="text-sm font-medium">
        {copy.searchLabel}
      </label>
      <div className="flex min-w-0 gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={`${listboxId}-input`}
            name="q"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={listboxId}
            aria-busy={status === "loading"}
            autoComplete="off"
            maxLength={120}
            value={value}
            onChange={(event) => {
              const nextValue = event.target.value;
              setValue(nextValue);
              if (nextValue.trim().length < 2) {
                setSuggestions([]);
                setStatus("idle");
              }
            }}
            placeholder={copy.searchPlaceholder}
            className="h-11 w-full rounded-md border border-input bg-background pr-14 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 sm:pr-10 sm:text-sm"
          />
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={clear}
              aria-label={copy.clearSearch}
              className="absolute top-1/2 right-0 -translate-y-1/2 sm:right-1.5"
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <Button
          type="submit"
          aria-label={copy.searchSubmit}
          className="shrink-0"
        >
          <Search data-icon="inline-start" aria-hidden="true" />
          <span className="hidden sm:inline">{copy.searchSubmit}</span>
        </Button>
      </div>
      {status === "loading" ? (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {copy.suggestionsLoading}
        </span>
      ) : null}
      {status === "error" ? (
        <span className="text-xs text-destructive" role="status">
          {copy.suggestionsUnavailable}
        </span>
      ) : null}
      {suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={copy.suggestionsLabel}
          className="absolute top-full z-20 mt-1 grid w-full max-w-2xl gap-px overflow-hidden rounded-md border border-border bg-border shadow-lg"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.key} role="option" aria-selected="false">
              <Link
                href={suggestion.href}
                className={buttonVariants({
                  variant: "ghost",
                  className:
                    "h-auto w-full justify-between rounded-none bg-background px-3 py-2 text-left",
                })}
              >
                <span className="min-w-0 break-words">{suggestion.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {suggestion.journalCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

function parseSuggestions(value: unknown): PublicObjectSuggestion[] {
  if (!value || typeof value !== "object") return [];
  const suggestions = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];

  return suggestions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<PublicObjectSuggestion>;
    if (
      typeof candidate.key !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.href !== "string" ||
      !isObjectKind(candidate.objectKind) ||
      !isIdentityState(candidate.identityState) ||
      typeof candidate.journalCount !== "number"
    ) {
      return [];
    }
    return [candidate as PublicObjectSuggestion];
  });
}

function isObjectKind(
  value: unknown,
): value is PublicObjectSuggestion["objectKind"] {
  return value === "plant" || value === "animal" || value === "bee_colony";
}

function isIdentityState(
  value: unknown,
): value is PublicObjectCatalogIdentityState {
  return (
    value === "catalog" ||
    value === "provisional" ||
    value === "unknown" ||
    value === "unavailable"
  );
}
