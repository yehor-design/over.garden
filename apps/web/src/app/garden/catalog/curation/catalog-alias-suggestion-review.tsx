"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Search,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { buttonVariants } from "@/components/ui/button";
import { catalogSuggestionTrustMetadata } from "@/lib/garden/catalog-trust";
import type {
  CatalogAliasSuggestionReadModel,
  CatalogAliasSuggestionTarget,
} from "@/server/catalog-alias-curation-repository";
import type { CatalogAliasSuggestionActionResult } from "./actions";

type AliasAction = (
  formData: FormData,
) => Promise<CatalogAliasSuggestionActionResult>;

interface CatalogAliasSuggestionReviewProps {
  searchQuery: string;
  targets: CatalogAliasSuggestionTarget[];
  suggestions: CatalogAliasSuggestionReadModel[];
  generateAction: AliasAction;
  approveAction: AliasAction;
  rejectAction: AliasAction;
}

export function CatalogAliasSuggestionReview({
  searchQuery,
  targets,
  suggestions,
  generateAction,
  approveAction,
  rejectAction,
}: CatalogAliasSuggestionReviewProps) {
  return (
    <section className="grid min-w-0 gap-5 border-b border-border pb-6">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">
          Alias and locale suggestions
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Generate deterministic spelling and transliteration variants from an
          approved catalog identity. A generated row reaches typeahead only
          after explicit approval.
        </p>
      </div>

      <form
        action="/garden/catalog/curation"
        method="get"
        className="flex min-w-0 flex-col gap-2 sm:flex-row"
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search catalog identity</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="aliasQuery"
            defaultValue={searchQuery}
            minLength={2}
            maxLength={120}
            className="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Search canonical or accepted name"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className={buttonVariants({ variant: "outline" })}
        >
          <Search className="size-4" />
          Search
        </button>
      </form>

      <AliasTargetResults
        searchQuery={searchQuery}
        targets={targets}
        generateAction={generateAction}
      />

      <div className="grid min-w-0 gap-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            Review queue
          </h3>
          <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
            Rows: {suggestions.length}
          </span>
        </div>

        {suggestions.length > 0 ? (
          <ol className="grid min-w-0 gap-3">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="min-w-0">
                <AliasSuggestionRow
                  suggestion={suggestion}
                  approveAction={approveAction}
                  rejectAction={rejectAction}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No generated alias suggestions yet.
          </p>
        )}
      </div>
    </section>
  );
}

function AliasTargetResults({
  searchQuery,
  targets,
  generateAction,
}: {
  searchQuery: string;
  targets: CatalogAliasSuggestionTarget[];
  generateAction: AliasAction;
}) {
  if (!searchQuery) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Search a catalog identity to generate variants.
      </p>
    );
  }

  if (targets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        No global catalog identities match this search.
      </p>
    );
  }

  return (
    <ol className="grid min-w-0 gap-3 md:grid-cols-2">
      {targets.map((target) => (
        <li key={target.id} className="min-w-0">
          <article className="flex h-full min-w-0 flex-col justify-between gap-4 rounded-lg border border-border p-4">
            <div className="min-w-0">
              <h3 className="font-semibold break-words text-foreground">
                {target.canonicalName}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-md border border-border px-2 py-1">
                  {target.catalogKind}
                </span>
                <span className="rounded-md border border-border px-2 py-1 uppercase">
                  {target.locale}
                </span>
                <span className="rounded-md border border-border px-2 py-1">
                  {target.status}
                </span>
                <span className="rounded-md border border-border px-2 py-1">
                  {
                    catalogSuggestionTrustMetadata({
                      status: target.status,
                      source: target.source,
                      catalogKind: target.catalogKind,
                    }).sourceLabel
                  }
                </span>
                <span className="rounded-md border border-border px-2 py-1">
                  Accepted names: {target.acceptedNameCount}
                </span>
              </div>
            </div>
            <AliasGenerateControl
              catalogItemId={target.id}
              generateAction={generateAction}
            />
          </article>
        </li>
      ))}
    </ol>
  );
}

function AliasSuggestionRow({
  suggestion,
  approveAction,
  rejectAction,
}: {
  suggestion: CatalogAliasSuggestionReadModel;
  approveAction: AliasAction;
  rejectAction: AliasAction;
}) {
  const reviewable =
    suggestion.status === "generated" || suggestion.status === "review_needed";
  const sourceLabel = catalogSuggestionTrustMetadata({
    source: suggestion.catalogSource,
    catalogKind: suggestion.catalogKind,
  }).sourceLabel;

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 lg:flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold break-words text-foreground">
            {suggestion.displayName}
          </h4>
          <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground uppercase">
            {suggestion.locale}
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
            {aliasStatusLabel(suggestion.status)}
          </span>
        </div>

        <p className="mt-2 text-sm break-words text-muted-foreground">
          {suggestion.catalogCanonicalName} · generated from{" "}
          <span className="font-medium text-foreground">
            {suggestion.generatedFromDisplayName}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {suggestion.script}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {suggestion.catalogKind}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {sourceLabel}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            Confidence {formatConfidence(suggestion.confidence)}
          </span>
          {suggestion.reasonCodes.map((reasonCode) => (
            <span
              key={reasonCode}
              className="rounded-md border border-border px-2 py-1"
            >
              {aliasReasonLabel(reasonCode)}
            </span>
          ))}
        </div>

        {suggestion.status === "review_needed" ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Approval is blocked because this normalized name resolves to another
            catalog identity. Resolve the collision, then regenerate.
          </p>
        ) : null}
        {suggestion.status === "rejected" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Decision: {aliasDecisionLabel(suggestion.decisionReasonCode)}
          </p>
        ) : null}
      </div>

      {reviewable ? (
        <AliasDecisionControls
          suggestion={suggestion}
          approveAction={approveAction}
          rejectAction={rejectAction}
        />
      ) : suggestion.status === "accepted" ? (
        <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          Searchable
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <XCircle className="size-4" />
          Not searchable
        </span>
      )}
    </article>
  );
}

function AliasGenerateControl({
  catalogItemId,
  generateAction,
}: {
  catalogItemId: string;
  generateAction: AliasAction;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);

    startTransition(async () => {
      try {
        const result = await generateAction(formData);
        setFeedback(result.message);
        router.refresh();
      } catch {
        setFeedback("Alias generation could not be queued. Try again.");
      }
    });
  }

  return (
    <div className="grid gap-2">
      <form onSubmit={submit}>
        <input type="hidden" name="catalogItemId" value={catalogItemId} />
        <button type="submit" disabled={pending} className={buttonVariants()}>
          <WandSparkles className="size-4" />
          {pending ? "Queueing..." : "Generate aliases"}
        </button>
      </form>
      {feedback ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function AliasDecisionControls({
  suggestion,
  approveAction,
  rejectAction,
}: {
  suggestion: CatalogAliasSuggestionReadModel;
  approveAction: AliasAction;
  rejectAction: AliasAction;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<
    | CatalogAliasSuggestionActionResult
    | { outcome: "error"; message: string }
    | null
  >(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>, action: AliasAction) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);

    startTransition(async () => {
      try {
        const result = await action(formData);
        setFeedback(result);
        router.refresh();
      } catch {
        setFeedback({
          outcome: "error",
          message:
            "The alias decision could not be applied. Refresh and try again.",
        });
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:w-64 lg:flex-col">
      {suggestion.status === "generated" ? (
        <form onSubmit={(event) => submit(event, approveAction)}>
          <input type="hidden" name="aliasProjectionId" value={suggestion.id} />
          <button type="submit" disabled={pending} className={buttonVariants()}>
            <CheckCircle2 className="size-4" />
            {pending ? "Applying..." : "Approve alias"}
          </button>
        </form>
      ) : null}

      <form
        onSubmit={(event) => submit(event, rejectAction)}
        className="grid min-w-0 gap-2"
      >
        <input type="hidden" name="aliasProjectionId" value={suggestion.id} />
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Rejection reason
          <select
            name="reasonCode"
            disabled={pending}
            defaultValue={
              suggestion.status === "review_needed"
                ? "ambiguous_catalog_identity"
                : "incorrect_variant"
            }
            className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="incorrect_variant">Incorrect variant</option>
            <option value="locale_or_script_mismatch">
              Locale or script mismatch
            </option>
            <option value="ambiguous_catalog_identity">
              Ambiguous catalog identity
            </option>
            <option value="unsafe_generated_form">Unsafe generated form</option>
            <option value="other_review_reason">Other review reason</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className={buttonVariants({ variant: "outline" })}
        >
          <XCircle className="size-4" />
          {pending ? "Applying..." : "Reject alias"}
        </button>
      </form>

      {feedback ? (
        <p
          aria-live="polite"
          className={
            feedback.outcome === "error" || feedback.outcome === "collision"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

function aliasStatusLabel(status: CatalogAliasSuggestionReadModel["status"]) {
  switch (status) {
    case "generated":
      return "Generated candidate";
    case "review_needed":
      return "Collision review required";
    case "rejected":
      return "Rejected alias";
    case "accepted":
      return "Accepted · typeahead";
  }
}

function aliasReasonLabel(reasonCode: string) {
  switch (reasonCode) {
    case "cyrtranslit_forward":
      return "CyrTranslit forward";
    case "cyrtranslit_reverse":
      return "CyrTranslit reverse";
    case "ru_yo_fold":
      return "Russian ё/е variant";
    case "uk_ghe_fold":
      return "Ukrainian ґ/г variant";
    case "normalized_collision":
      return "Normalized-name collision";
    default:
      return reasonCode.replaceAll("_", " ");
  }
}

function aliasDecisionLabel(reasonCode: string | null) {
  if (!reasonCode) return "Rejected";
  return reasonCode.replaceAll("_", " ");
}

function formatConfidence(value: number) {
  if (!Number.isFinite(value)) return "unknown";
  return String(Math.round(value * 100)) + "%";
}
