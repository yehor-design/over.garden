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

import {
  DocumentMutationGenerationFormField,
  useOptionalDocumentMutationGeneration,
} from "@/components/auth/document-mutation-recovery";
import { buttonVariants } from "@/components/ui/button";
import { buildGardenCatalogTrustMetadata } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOperatorCurationCopy,
  operatorCurationMapLabel,
} from "@/lib/operator-curation-copy";
import type {
  CatalogAliasSuggestionReadModel,
  CatalogAliasSuggestionTarget,
} from "@/server/catalog-alias-curation-repository";
import type { CatalogAliasSuggestionActionResult } from "./actions";

type AliasAction = (
  formData: FormData,
) => Promise<CatalogAliasSuggestionActionResult>;
type AliasOutcome = "queued" | "approved" | "rejected" | "stale" | "collision";

interface CatalogAliasSuggestionReviewProps {
  locale: InterfaceLocale;
  searchQuery: string;
  targets: CatalogAliasSuggestionTarget[];
  suggestions: CatalogAliasSuggestionReadModel[];
  generateAction: AliasAction;
  approveAction: AliasAction;
  rejectAction: AliasAction;
}

export function CatalogAliasSuggestionReview({
  locale,
  searchQuery,
  targets,
  suggestions,
  generateAction,
  approveAction,
  rejectAction,
}: CatalogAliasSuggestionReviewProps) {
  const copy = getOperatorCurationCopy(locale);

  return (
    <section className="grid min-w-0 gap-5 border-b border-border pb-6">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">
          {copy.alias.title}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy.alias.description}
        </p>
      </div>

      <form
        action="/garden/catalog/curation"
        method="get"
        className="flex min-w-0 flex-col gap-2 sm:flex-row"
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{copy.alias.searchLabel}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="aliasQuery"
            defaultValue={searchQuery}
            minLength={2}
            maxLength={120}
            className="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder={copy.alias.searchPlaceholder}
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className={buttonVariants({ variant: "outline" })}
        >
          <Search className="size-4" />
          {copy.alias.search}
        </button>
      </form>

      <AliasTargetResults
        locale={locale}
        searchQuery={searchQuery}
        targets={targets}
        generateAction={generateAction}
      />

      <div className="grid min-w-0 gap-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {copy.alias.reviewQueue}
          </h3>
          <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
            {copy.common.rows}: {suggestions.length}
          </span>
        </div>

        {suggestions.length > 0 ? (
          <ol className="grid min-w-0 gap-3">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="min-w-0">
                <AliasSuggestionRow
                  locale={locale}
                  suggestion={suggestion}
                  approveAction={approveAction}
                  rejectAction={rejectAction}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.alias.noGenerated}
          </p>
        )}
      </div>
    </section>
  );
}

function AliasTargetResults({
  locale,
  searchQuery,
  targets,
  generateAction,
}: {
  locale: InterfaceLocale;
  searchQuery: string;
  targets: CatalogAliasSuggestionTarget[];
  generateAction: AliasAction;
}) {
  const copy = getOperatorCurationCopy(locale);

  if (!searchQuery) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {copy.alias.searchPrompt}
      </p>
    );
  }

  if (targets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {copy.alias.noMatches}
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
                  {operatorCurationMapLabel(
                    copy.common.catalogKinds,
                    target.catalogKind,
                    copy.common.catalogKinds.identity,
                  )}
                </span>
                <span className="rounded-md border border-border px-2 py-1 uppercase">
                  {target.locale}
                </span>
                <span className="rounded-md border border-border px-2 py-1">
                  {operatorCurationMapLabel(
                    copy.common.statuses,
                    target.status,
                    copy.common.unknown,
                  )}
                </span>
                <span className="rounded-md border border-border px-2 py-1">
                  {
                    buildGardenCatalogTrustMetadata(locale, {
                      status: target.status,
                      source: target.source,
                      catalogKind: target.catalogKind,
                    }).sourceLabel
                  }
                </span>
                <span className="rounded-md border border-border px-2 py-1">
                  {copy.alias.acceptedNames}: {target.acceptedNameCount}
                </span>
              </div>
            </div>
            <AliasGenerateControl
              locale={locale}
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
  locale,
  suggestion,
  approveAction,
  rejectAction,
}: {
  locale: InterfaceLocale;
  suggestion: CatalogAliasSuggestionReadModel;
  approveAction: AliasAction;
  rejectAction: AliasAction;
}) {
  const copy = getOperatorCurationCopy(locale);
  const reviewable =
    suggestion.status === "generated" || suggestion.status === "review_needed";
  const sourceLabel = buildGardenCatalogTrustMetadata(locale, {
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
            {operatorCurationMapLabel(
              copy.alias.statuses,
              suggestion.status,
              copy.common.unknown,
            )}
          </span>
        </div>

        <p className="mt-2 text-sm break-words text-muted-foreground">
          {suggestion.catalogCanonicalName} · {copy.alias.generatedFrom}{" "}
          <span className="font-medium text-foreground">
            {suggestion.generatedFromDisplayName}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {suggestion.script}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {operatorCurationMapLabel(
              copy.common.catalogKinds,
              suggestion.catalogKind,
              copy.common.catalogKinds.identity,
            )}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {sourceLabel}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {copy.common.confidence}{" "}
            {formatConfidence(suggestion.confidence, copy.common.unknown)}
          </span>
          {suggestion.reasonCodes.map((reasonCode) => (
            <span
              key={reasonCode}
              className="rounded-md border border-border px-2 py-1"
            >
              {operatorCurationMapLabel(
                copy.alias.reasons,
                reasonCode,
                copy.common.unknown,
              )}
            </span>
          ))}
        </div>

        {suggestion.status === "review_needed" ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {copy.alias.collision}
          </p>
        ) : null}
        {suggestion.status === "rejected" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {copy.alias.decision}:{" "}
            {operatorCurationMapLabel(
              copy.alias.decisions,
              suggestion.decisionReasonCode,
              copy.alias.decisions.rejected,
            )}
          </p>
        ) : null}
      </div>

      {reviewable ? (
        <AliasDecisionControls
          locale={locale}
          suggestion={suggestion}
          approveAction={approveAction}
          rejectAction={rejectAction}
        />
      ) : suggestion.status === "accepted" ? (
        <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          {copy.alias.searchable}
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <XCircle className="size-4" />
          {copy.alias.notSearchable}
        </span>
      )}
    </article>
  );
}

function AliasGenerateControl({
  locale,
  catalogItemId,
  generateAction,
}: {
  locale: InterfaceLocale;
  catalogItemId: string;
  generateAction: AliasAction;
}) {
  const copy = getOperatorCurationCopy(locale);
  const documentMutation = useOptionalDocumentMutationGeneration();
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
        if ("documentMutationAdmission" in result) {
          documentMutation?.handleTransportResult(
            result.documentMutationAdmission,
          );
          return;
        }
        setFeedback(aliasActionFeedback(copy, result.outcome));
        router.refresh();
      } catch {
        setFeedback(copy.alias.generateError);
      }
    });
  }

  return (
    <div className="grid gap-2">
      <form onSubmit={submit} data-document-mutation-managed="true">
        <DocumentMutationGenerationFormField />
        <input type="hidden" name="catalogItemId" value={catalogItemId} />
        <button type="submit" disabled={pending} className={buttonVariants()}>
          <WandSparkles className="size-4" />
          {pending ? copy.common.queueing : copy.alias.generate}
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
  locale,
  suggestion,
  approveAction,
  rejectAction,
}: {
  locale: InterfaceLocale;
  suggestion: CatalogAliasSuggestionReadModel;
  approveAction: AliasAction;
  rejectAction: AliasAction;
}) {
  const copy = getOperatorCurationCopy(locale);
  const documentMutation = useOptionalDocumentMutationGeneration();
  const router = useRouter();
  const [feedback, setFeedback] = useState<{
    outcome: AliasOutcome | "error";
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>, action: AliasAction) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);

    startTransition(async () => {
      try {
        const result = await action(formData);
        if ("documentMutationAdmission" in result) {
          documentMutation?.handleTransportResult(
            result.documentMutationAdmission,
          );
          return;
        }
        setFeedback({
          ...result,
          message: aliasActionFeedback(copy, result.outcome),
        });
        router.refresh();
      } catch {
        setFeedback({
          outcome: "error",
          message: copy.alias.decisionError,
        });
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:w-64 lg:flex-col">
      {suggestion.status === "generated" ? (
        <form
          onSubmit={(event) => submit(event, approveAction)}
          data-document-mutation-managed="true"
        >
          <DocumentMutationGenerationFormField />
          <input type="hidden" name="aliasProjectionId" value={suggestion.id} />
          <button type="submit" disabled={pending} className={buttonVariants()}>
            <CheckCircle2 className="size-4" />
            {pending ? copy.common.applying : copy.alias.approve}
          </button>
        </form>
      ) : null}

      <form
        onSubmit={(event) => submit(event, rejectAction)}
        className="grid min-w-0 gap-2"
        data-document-mutation-managed="true"
      >
        <DocumentMutationGenerationFormField />
        <input type="hidden" name="aliasProjectionId" value={suggestion.id} />
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {copy.common.rejectionReason}
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
            <option value="incorrect_variant">
              {copy.alias.decisions.incorrect_variant}
            </option>
            <option value="locale_or_script_mismatch">
              {copy.alias.decisions.locale_or_script_mismatch}
            </option>
            <option value="ambiguous_catalog_identity">
              {copy.alias.decisions.ambiguous_catalog_identity}
            </option>
            <option value="unsafe_generated_form">
              {copy.alias.decisions.unsafe_generated_form}
            </option>
            <option value="other_review_reason">
              {copy.alias.decisions.other_review_reason}
            </option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className={buttonVariants({ variant: "outline" })}
        >
          <XCircle className="size-4" />
          {pending ? copy.common.applying : copy.alias.reject}
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

function formatConfidence(value: number, fallback: string) {
  if (!Number.isFinite(value)) return fallback;
  return String(Math.round(value * 100)) + "%";
}

function aliasActionFeedback(
  copy: ReturnType<typeof getOperatorCurationCopy>,
  outcome: AliasOutcome,
) {
  switch (outcome) {
    case "queued":
      return copy.alias.queuedFeedback;
    case "approved":
      return copy.alias.approvedFeedback;
    case "rejected":
      return copy.alias.rejectedFeedback;
    case "stale":
      return copy.alias.staleFeedback;
    case "collision":
      return copy.alias.collisionFeedback;
  }
}
