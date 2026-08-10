"use client";

import Link from "next/link";
import { ExternalLink, FileText, Save, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { buttonVariants } from "@/components/ui/button";
import { buildGardenCatalogTrustMetadata } from "@/lib/garden-workspace-copy";
import { publicVarietyPath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOperatorCurationCopy,
  operatorCurationMapLabel,
} from "@/lib/operator-curation-copy";
import { formatOperatorDate } from "@/lib/operator-copy";

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
  locale: InterfaceLocale;
  seedProofs: VarietySeedProofCurationRow[];
  upsertAction: (formData: FormData) => Promise<unknown>;
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
  locale,
  seedProofs,
  upsertAction,
}: VarietySeedProofEditorProps) {
  const copy = getOperatorCurationCopy(locale);
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
          {copy.seedProof.title}
        </h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {copy.seedProof.existing}: {seedProofs.length}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {copy.seedProof.plainText}
          </span>
        </div>
      </div>

      <article className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText className="size-4 text-muted-foreground" />
          {copy.seedProof.newProof}
        </div>

        <DocumentMutationActionForm
          action={upsertAction}
          className="grid gap-3"
        >
          <input
            type="hidden"
            name="catalogItemId"
            value={selected?.id ?? ""}
          />

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            {copy.seedProof.catalogItem}
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                maxLength={120}
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder={copy.seedProof.searchPlaceholder}
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={copy.seedProof.clearCatalogItem}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </span>
          </label>

          <CatalogSearchState
            locale={locale}
            selected={selected}
            status={status}
            suggestions={suggestions}
            selectSuggestion={selectSuggestion}
          />

          <SeedProofFields locale={locale} />

          <button
            type="submit"
            disabled={!selected}
            className={buttonVariants({ className: "self-start" })}
          >
            <Save className="size-4" />
            {copy.seedProof.save}
          </button>
        </DocumentMutationActionForm>
      </article>

      {seedProofs.length > 0 ? (
        <ol className="grid gap-4">
          {seedProofs.map((seedProof) => (
            <li key={seedProof.id}>
              <ExistingSeedProofForm
                locale={locale}
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
  locale,
  seedProof,
  upsertAction,
}: {
  locale: InterfaceLocale;
  seedProof: VarietySeedProofCurationRow;
  upsertAction: (formData: FormData) => Promise<unknown>;
}) {
  const copy = getOperatorCurationCopy(locale);
  return (
    <article className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-foreground">
            {seedProof.catalogCanonicalName}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {operatorCurationMapLabel(
                copy.common.statuses,
                seedProof.status,
                copy.common.unknown,
              )}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {operatorCurationMapLabel(
                copy.common.statuses,
                seedProof.catalogStatus,
                copy.common.unknown,
              )}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {seedProof.catalogLocale}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.common.updated}:{" "}
              {formatOperatorDate(locale, seedProof.updatedAt)}
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
          {copy.common.publicPage}
        </Link>
      </div>

      <DocumentMutationActionForm action={upsertAction} className="grid gap-3">
        <input
          type="hidden"
          name="catalogItemId"
          value={seedProof.catalogItemId}
        />
        <SeedProofFields locale={locale} seedProof={seedProof} />
        <button
          type="submit"
          className={buttonVariants({ className: "self-start" })}
        >
          <Save className="size-4" />
          {copy.seedProof.update}
        </button>
      </DocumentMutationActionForm>
    </article>
  );
}

function SeedProofFields({
  locale,
  seedProof,
}: {
  locale: InterfaceLocale;
  seedProof?: Pick<
    VarietySeedProofCurationRow,
    "title" | "summary" | "body" | "sourceLabel" | "status"
  >;
}) {
  const copy = getOperatorCurationCopy(locale);
  return (
    <div className="grid gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        {copy.seedProof.titleField}
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={seedProof?.title ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        {copy.seedProof.summary}
        <textarea
          name="summary"
          required
          maxLength={280}
          defaultValue={seedProof?.summary ?? ""}
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        {copy.seedProof.body}
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
        {copy.seedProof.sourceLabel}
        <input
          name="sourceLabel"
          maxLength={160}
          defaultValue={seedProof?.sourceLabel ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-foreground sm:max-w-xs">
        {copy.common.status}
        <select
          name="status"
          defaultValue={seedProof?.status ?? "draft"}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="draft">{copy.common.statuses.draft}</option>
          <option value="published">{copy.common.statuses.published}</option>
        </select>
      </label>
    </div>
  );
}

function CatalogSearchState({
  locale,
  selected,
  status,
  suggestions,
  selectSuggestion,
}: {
  locale: InterfaceLocale;
  selected: CatalogSuggestion | null;
  status: CatalogStatus;
  suggestions: CatalogSuggestion[];
  selectSuggestion: (suggestion: CatalogSuggestion) => void;
}) {
  const copy = getOperatorCurationCopy(locale);
  return (
    <div className="grid gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {selected ? (
          <span className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border px-2 py-1 text-foreground">
            <span>
              {copy.common.selected}: {selected.displayName} ·{" "}
              {buildGardenCatalogTrustMetadata(locale, selected).trustLabel}
            </span>
            <span className="text-muted-foreground">
              {
                buildGardenCatalogTrustMetadata(locale, selected)
                  .disambiguationLabel
              }
            </span>
          </span>
        ) : (
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
            {copy.seedProof.noSelection}
          </span>
        )}
        {status === "loading" ? (
          <span className="text-muted-foreground">{copy.common.searching}</span>
        ) : null}
        {status === "failed" ? (
          <span className="text-destructive">
            {copy.common.suggestionsUnavailable}
          </span>
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
