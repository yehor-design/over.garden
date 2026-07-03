"use client";

import Link from "next/link";
import { ExternalLink, FileText, Save, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { catalogSuggestionTrustMetadata } from "@/lib/garden/catalog-trust";
import { publicVarietyPath } from "@/lib/garden/public-paths";

interface VarietySeedProofCurationRow {
  id: string;
  catalogItemId: string;
  catalogCanonicalName: string;
  catalogPublicSlug: string;
  catalogStatus: "seeded" | "confirmed";
  catalogLocale: string;
  title: string;
  summary: string;
  body: string;
  sourceLabel: string | null;
  status: "draft" | "published";
  publishedAt: Date | string | null;
  updatedAt: Date | string;
}

interface VarietySeedProofEditorProps {
  seedProofs: VarietySeedProofCurationRow[];
  upsertAction: (formData: FormData) => void | Promise<void>;
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

export function VarietySeedProofEditor({
  seedProofs,
  upsertAction,
}: VarietySeedProofEditorProps) {
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
    <section className="grid gap-4 border-b border-border pb-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Variety proof blocks
        </h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            Existing: {seedProofs.length}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            Plain text
          </span>
        </div>
      </div>

      <article className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText className="size-4 text-muted-foreground" />
          New proof block
        </div>

        <form action={upsertAction} className="grid gap-3">
          <input
            type="hidden"
            name="catalogItemId"
            value={selected?.id ?? ""}
          />

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Catalog item
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                maxLength={120}
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Search catalog item"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear catalog item"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </span>
          </label>

          <CatalogSearchState
            selected={selected}
            status={status}
            suggestions={suggestions}
            selectSuggestion={selectSuggestion}
          />

          <SeedProofFields />

          <button
            type="submit"
            disabled={!selected}
            className={buttonVariants({ className: "self-start" })}
          >
            <Save className="size-4" />
            Save proof
          </button>
        </form>
      </article>

      {seedProofs.length > 0 ? (
        <ol className="grid gap-4">
          {seedProofs.map((seedProof) => (
            <li key={seedProof.id}>
              <ExistingSeedProofForm
                seedProof={seedProof}
                upsertAction={upsertAction}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ExistingSeedProofForm({
  seedProof,
  upsertAction,
}: {
  seedProof: VarietySeedProofCurationRow;
  upsertAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <article className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-foreground">
            {seedProof.catalogCanonicalName}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {seedProof.status}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {seedProof.catalogStatus}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {seedProof.catalogLocale}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Updated: {formatDate(seedProof.updatedAt)}
            </span>
          </div>
        </div>
        <Link
          href={publicVarietyPath(seedProof.catalogPublicSlug)}
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          <ExternalLink className="size-4" />
          Public page
        </Link>
      </div>

      <form action={upsertAction} className="grid gap-3">
        <input
          type="hidden"
          name="catalogItemId"
          value={seedProof.catalogItemId}
        />
        <SeedProofFields seedProof={seedProof} />
        <button
          type="submit"
          className={buttonVariants({ className: "self-start" })}
        >
          <Save className="size-4" />
          Update proof
        </button>
      </form>
    </article>
  );
}

function SeedProofFields({
  seedProof,
}: {
  seedProof?: Pick<
    VarietySeedProofCurationRow,
    "title" | "summary" | "body" | "sourceLabel" | "status"
  >;
}) {
  return (
    <div className="grid gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Title
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={seedProof?.title ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Summary
        <textarea
          name="summary"
          required
          maxLength={280}
          defaultValue={seedProof?.summary ?? ""}
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Body
        <textarea
          name="body"
          required
          minLength={80}
          maxLength={1600}
          defaultValue={seedProof?.body ?? ""}
          className="min-h-36 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Source label
        <input
          name="sourceLabel"
          maxLength={160}
          defaultValue={seedProof?.sourceLabel ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground sm:max-w-xs">
        Status
        <select
          name="status"
          defaultValue={seedProof?.status ?? "draft"}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
    </div>
  );
}

function CatalogSearchState({
  selected,
  status,
  suggestions,
  selectSuggestion,
}: {
  selected: CatalogSuggestion | null;
  status: CatalogStatus;
  suggestions: CatalogSuggestion[];
  selectSuggestion: (suggestion: CatalogSuggestion) => void;
}) {
  return (
    <div className="grid gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {selected ? (
          <span className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border px-2 py-1 text-foreground">
            <span>
              Selected: {selected.displayName} ·{" "}
              {catalogSuggestionTrustMetadata(selected).trustLabel}
            </span>
            <span className="text-muted-foreground">
              {catalogSuggestionTrustMetadata(selected).disambiguationLabel}
            </span>
          </span>
        ) : (
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
            No catalog item selected
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
          {suggestions.map((suggestion) => {
            const trust = catalogSuggestionTrustMetadata(suggestion);

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
    </div>
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
