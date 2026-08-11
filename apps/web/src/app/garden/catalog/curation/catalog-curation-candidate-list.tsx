"use client";

import {
  CheckCircle2,
  GitMerge,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  DocumentMutationActionForm,
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
import {
  formatOperatorDate,
  formatOperatorTemplate,
} from "@/lib/operator-copy";
import type { CatalogMatchSuggestionActionResult } from "./actions";

interface CatalogCurationCandidate {
  id: string;
  displayName: string;
  normalizedName: string | null;
  catalogKind: "plant_variety" | "species" | "breed";
  locale: string;
  status: "provisional";
  source: string;
  createdAt: Date | string;
  affectedObjectCount: number;
  matchSuggestions: CatalogMatchSuggestion[];
}

interface CatalogMatchSuggestion {
  id: string;
  targetCatalogItemId: string | null;
  targetDisplayName: string | null;
  targetCanonicalName: string | null;
  catalogKind: string;
  score: number;
  confidenceBucket: "high" | "medium" | "low" | "none";
  matchType:
    | "normalized_exact"
    | "transliteration_exact"
    | "fuzzy_name"
    | "no_safe_match";
  reasonCodes: string[];
  normalizedInput: string;
  matchedName: string | null;
  sourceLocale: string;
  targetLocale: string | null;
  sourceScript: string;
  targetScript: string | null;
  status: "pending" | "rejected";
  generatedAt: Date | string;
  reviewedAt?: Date | string | null;
  decisionReasonCode?: string | null;
  decisionResult?: "catalog_merged" | "suggestion_rejected" | null;
  decisionAffectedObjectCount?: number | null;
}

interface CatalogCurationCandidateListProps {
  locale: InterfaceLocale;
  candidates: CatalogCurationCandidate[];
  confirmAction: (formData: FormData) => Promise<unknown>;
  mergeAction: (formData: FormData) => Promise<unknown>;
  rejectAction: (formData: FormData) => Promise<unknown>;
  rescanAction: (formData: FormData) => Promise<unknown>;
  approveSuggestionAction: CatalogMatchSuggestionAction;
  rejectSuggestionAction: CatalogMatchSuggestionAction;
}

interface CatalogMatchSuggestionFeedback {
  outcome: "approved" | "rejected" | "stale";
  message: string;
}

type CatalogMatchSuggestionAction = (
  formData: FormData,
) => Promise<CatalogMatchSuggestionActionResult>;

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
  locale,
  candidates,
  confirmAction,
  mergeAction,
  rejectAction,
  rescanAction,
  approveSuggestionAction,
  rejectSuggestionAction,
}: CatalogCurationCandidateListProps) {
  const copy = getOperatorCurationCopy(locale);

  if (candidates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {copy.candidate.noPending}
      </p>
    );
  }

  return (
    <ol className="grid gap-4">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <CatalogCurationCandidateCard
            locale={locale}
            candidate={candidate}
            confirmAction={confirmAction}
            mergeAction={mergeAction}
            rejectAction={rejectAction}
            rescanAction={rescanAction}
            approveSuggestionAction={approveSuggestionAction}
            rejectSuggestionAction={rejectSuggestionAction}
          />
        </li>
      ))}
    </ol>
  );
}

interface CatalogCurationCandidateCardProps {
  locale: InterfaceLocale;
  candidate: CatalogCurationCandidate;
  confirmAction: (formData: FormData) => Promise<unknown>;
  mergeAction: (formData: FormData) => Promise<unknown>;
  rejectAction: (formData: FormData) => Promise<unknown>;
  rescanAction: (formData: FormData) => Promise<unknown>;
  approveSuggestionAction: CatalogMatchSuggestionAction;
  rejectSuggestionAction: CatalogMatchSuggestionAction;
}

function CatalogCurationCandidateCard({
  locale,
  candidate,
  confirmAction,
  mergeAction,
  rejectAction,
  rescanAction: executeRescanAction,
  approveSuggestionAction,
  rejectSuggestionAction,
}: CatalogCurationCandidateCardProps) {
  const copy = getOperatorCurationCopy(locale);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);
  const [selected, setSelected] = useState<CatalogSuggestion | null>(null);
  const [status, setStatus] = useState<CatalogStatus>("idle");
  const [refreshQueued, setRefreshQueued] = useState(false);
  const candidateTrust = buildGardenCatalogTrustMetadata(locale, {
    status: candidate.status,
    source: candidate.source,
    catalogKind: candidate.catalogKind,
    locale: candidate.locale,
  });

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

  async function rescanAction(formData: FormData) {
    const result = await executeRescanAction(formData);
    if (
      !result ||
      typeof result !== "object" ||
      !("documentMutationAdmission" in result)
    ) {
      setRefreshQueued(true);
    }
    return result;
  }

  return (
    <article className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold break-words text-foreground">
            {candidate.displayName}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {candidate.locale}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {operatorCurationMapLabel(
                copy.common.catalogKinds,
                candidate.catalogKind,
                copy.common.catalogKinds.identity,
              )}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {candidateTrust.trustLabel}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {candidateTrust.sourceLabel}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.candidate.objects}: {candidate.affectedObjectCount}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.candidate.created}:{" "}
              {formatOperatorDate(locale, candidate.createdAt)}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {candidateTrust.sourceCaveat}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <DocumentMutationActionForm action={rescanAction}>
            <input type="hidden" name="candidateId" value={candidate.id} />
            <CatalogRescanButton locale={locale} queued={refreshQueued} />
          </DocumentMutationActionForm>
          <DocumentMutationActionForm action={confirmAction}>
            <input type="hidden" name="candidateId" value={candidate.id} />
            <button type="submit" className={buttonVariants()}>
              <CheckCircle2 className="size-4" />
              {copy.candidate.confirm}
            </button>
          </DocumentMutationActionForm>
        </div>
      </div>

      <CatalogMatchSuggestions
        locale={locale}
        suggestions={candidate.matchSuggestions}
        approveAction={approveSuggestionAction}
        rejectAction={rejectSuggestionAction}
      />

      <div className="grid gap-3 border-t border-border pt-4">
        <DocumentMutationActionForm action={mergeAction} className="grid gap-3">
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input
            type="hidden"
            name="targetCatalogItemId"
            value={selected?.id ?? ""}
          />

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            {copy.candidate.mergeTarget}
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                maxLength={120}
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-9 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder={copy.candidate.searchExisting}
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={copy.candidate.clearMergeTarget}
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
                  {copy.candidate.target}: {selected.displayName} ·{" "}
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
                {copy.candidate.noMergeTarget}
              </span>
            )}
            {status === "loading" ? (
              <span className="text-muted-foreground">
                {copy.common.searching}
              </span>
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
                const trust = buildGardenCatalogTrustMetadata(
                  locale,
                  suggestion,
                );

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
                          {suggestion.canonicalName} ·{" "}
                          {trust.disambiguationLabel}
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
              variant: "outline",
              className: "self-start",
            })}
          >
            <GitMerge className="size-4" />
            {copy.candidate.merge}
          </button>
        </DocumentMutationActionForm>

        <DocumentMutationActionForm
          action={rejectAction}
          className="border-t border-border pt-3"
        >
          <input type="hidden" name="candidateId" value={candidate.id} />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            <XCircle className="size-4" />
            {copy.candidate.reject}
          </button>
        </DocumentMutationActionForm>
      </div>
    </article>
  );
}

function CatalogMatchSuggestions({
  locale,
  suggestions,
  approveAction,
  rejectAction,
}: {
  locale: InterfaceLocale;
  suggestions: CatalogMatchSuggestion[];
  approveAction: CatalogMatchSuggestionAction;
  rejectAction: CatalogMatchSuggestionAction;
}) {
  const copy = getOperatorCurationCopy(locale);

  return (
    <section className="grid gap-3 border-t border-border pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">
          {copy.candidate.suggestionsTitle}
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          {copy.candidate.suggestionsDescription}
        </p>
      </div>

      {suggestions.length === 0 ? (
        <p className="border-y border-border py-3 text-sm text-muted-foreground">
          {copy.candidate.notEvaluated}
        </p>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {suggestions.map((suggestion) => {
            const noSafeMatch = suggestion.matchType === "no_safe_match";
            const lowConfidence = suggestion.confidenceBucket === "low";
            const rejected = suggestion.status === "rejected";

            return (
              <li key={suggestion.id} className="grid gap-2 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium break-words text-foreground">
                      {noSafeMatch
                        ? copy.candidate.noSafeMatch
                        : rejected
                          ? formatOperatorTemplate(
                              copy.candidate.rejectedMatch,
                              { name: suggestion.targetDisplayName ?? "" },
                            )
                          : lowConfidence
                            ? formatOperatorTemplate(copy.candidate.heldMatch, {
                                name: suggestion.targetDisplayName ?? "",
                              })
                            : formatOperatorTemplate(
                                copy.candidate.suggestedTarget,
                                { name: suggestion.targetDisplayName ?? "" },
                              )}
                    </p>
                    {!noSafeMatch &&
                    suggestion.targetCanonicalName &&
                    suggestion.targetCanonicalName !==
                      suggestion.targetDisplayName ? (
                      <p className="text-xs break-words text-muted-foreground">
                        {copy.candidate.canonical}:{" "}
                        {suggestion.targetCanonicalName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 text-xs">
                    {rejected ? (
                      <span className="rounded-md border border-destructive/40 px-2 py-1 font-medium text-destructive">
                        {copy.candidate.rejected}
                      </span>
                    ) : null}
                    <span className="rounded-md border border-border px-2 py-1 font-medium text-foreground">
                      {suggestion.score}/100
                    </span>
                    <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                      {operatorCurationMapLabel(
                        copy.candidate.confidenceBuckets,
                        suggestion.confidenceBucket,
                        copy.common.unknown,
                      )}
                    </span>
                    <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                      {operatorCurationMapLabel(
                        copy.candidate.matchTypes,
                        suggestion.matchType,
                        copy.common.unknown,
                      )}
                    </span>
                    <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                      {operatorCurationMapLabel(
                        copy.common.catalogKinds,
                        suggestion.catalogKind,
                        copy.common.catalogKinds.identity,
                      )}
                    </span>
                  </div>
                </div>

                <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="flex min-w-0 gap-1">
                    <dt className="shrink-0 font-medium text-foreground">
                      {copy.candidate.normalized}:
                    </dt>
                    <dd className="min-w-0 break-words">
                      {suggestion.normalizedInput}
                    </dd>
                  </div>
                  <div className="flex min-w-0 gap-1">
                    <dt className="shrink-0 font-medium text-foreground">
                      {copy.candidate.localeScript}:
                    </dt>
                    <dd className="min-w-0 break-words">
                      {suggestion.sourceLocale}/{suggestion.sourceScript}
                      {suggestion.targetLocale && suggestion.targetScript
                        ? ` -> ${suggestion.targetLocale}/${suggestion.targetScript}`
                        : ""}
                    </dd>
                  </div>
                  <div className="flex min-w-0 gap-1 sm:col-span-2">
                    <dt className="shrink-0 font-medium text-foreground">
                      {copy.candidate.reasons}:
                    </dt>
                    <dd className="min-w-0 break-words">
                      {suggestion.reasonCodes
                        .map((reason) =>
                          operatorCurationMapLabel(
                            copy.entity.reasonCodes,
                            reason,
                            copy.common.unknown,
                          ),
                        )
                        .join(", ")}
                    </dd>
                  </div>
                </dl>

                {rejected ? (
                  <div className="grid gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">
                        {copy.candidate.reviewReason}:
                      </span>{" "}
                      {operatorCurationMapLabel(
                        copy.candidate.decisions,
                        suggestion.decisionReasonCode,
                        copy.common.unknown,
                      )}
                    </p>
                    {suggestion.reviewedAt ? (
                      <p>
                        {formatOperatorTemplate(
                          copy.candidate.reviewedUnchanged,
                          {
                            date: formatOperatorDate(
                              locale,
                              suggestion.reviewedAt,
                            ),
                          },
                        )}
                      </p>
                    ) : null}
                  </div>
                ) : !noSafeMatch && suggestion.targetCatalogItemId ? (
                  <CatalogMatchSuggestionDecisionControls
                    locale={locale}
                    suggestionId={suggestion.id}
                    approveAction={approveAction}
                    rejectAction={rejectAction}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function CatalogRescanButton({
  locale,
  queued,
}: {
  locale: InterfaceLocale;
  queued: boolean;
}) {
  const { pending } = useFormStatus();
  const copy = getOperatorCurationCopy(locale);

  return (
    <button
      type="submit"
      disabled={pending || queued}
      className={buttonVariants({ variant: "outline" })}
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending
        ? copy.common.queueing
        : queued
          ? copy.common.refreshQueued
          : copy.candidate.refreshMatches}
    </button>
  );
}

function CatalogMatchSuggestionDecisionControls({
  locale,
  suggestionId,
  approveAction,
  rejectAction,
}: {
  locale: InterfaceLocale;
  suggestionId: string;
  approveAction: CatalogMatchSuggestionAction;
  rejectAction: CatalogMatchSuggestionAction;
}) {
  const copy = getOperatorCurationCopy(locale);
  const documentMutation = useOptionalDocumentMutationGeneration();
  const router = useRouter();
  const [feedback, setFeedback] = useState<
    | CatalogMatchSuggestionFeedback
    | { outcome: "error"; message: string }
    | null
  >(null);
  const [pendingDecision, startDecision] = useTransition();

  function submitDecision(
    event: FormEvent<HTMLFormElement>,
    action: CatalogMatchSuggestionAction,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);

    startDecision(async () => {
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
          message: matchActionFeedback(copy, result.outcome),
        });
        if (result.outcome !== "stale") router.refresh();
      } catch {
        setFeedback({
          outcome: "error",
          message: copy.candidate.decisionError,
        });
      }
    });
  }

  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <form
          onSubmit={(event) => submitDecision(event, approveAction)}
          data-document-mutation-managed="true"
        >
          <DocumentMutationGenerationFormField />
          <input type="hidden" name="suggestionId" value={suggestionId} />
          <button
            type="submit"
            disabled={pendingDecision || feedback?.outcome === "stale"}
            className={buttonVariants()}
          >
            <CheckCircle2 className="size-4" />
            {pendingDecision
              ? copy.common.applying
              : copy.candidate.approveMatch}
          </button>
        </form>

        <form
          onSubmit={(event) => submitDecision(event, rejectAction)}
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end"
          data-document-mutation-managed="true"
        >
          <DocumentMutationGenerationFormField />
          <input type="hidden" name="suggestionId" value={suggestionId} />
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-foreground">
            {copy.common.rejectionReason}
            <select
              name="reasonCode"
              defaultValue="not_same_entity"
              disabled={pendingDecision || feedback?.outcome === "stale"}
              className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="not_same_entity">
                {copy.candidate.decisions.not_same_entity}
              </option>
              <option value="wrong_catalog_kind">
                {copy.candidate.decisions.wrong_catalog_kind}
              </option>
              <option value="locale_or_script_mismatch">
                {copy.candidate.decisions.locale_or_script_mismatch}
              </option>
              <option value="insufficient_evidence">
                {copy.candidate.decisions.insufficient_evidence}
              </option>
              <option value="other_review_reason">
                {copy.candidate.decisions.other_review_reason}
              </option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pendingDecision || feedback?.outcome === "stale"}
            className={buttonVariants({ variant: "outline" })}
          >
            <XCircle className="size-4" />
            {pendingDecision
              ? copy.common.applying
              : copy.candidate.rejectSuggestion}
          </button>
        </form>
      </div>

      {feedback ? (
        <p
          role={feedback.outcome === "error" ? "alert" : "status"}
          className={
            feedback.outcome === "error"
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

function matchActionFeedback(
  copy: ReturnType<typeof getOperatorCurationCopy>,
  outcome: CatalogMatchSuggestionFeedback["outcome"],
) {
  switch (outcome) {
    case "approved":
      return copy.candidate.approvedFeedback;
    case "rejected":
      return copy.candidate.rejectedFeedback;
    case "stale":
      return copy.candidate.staleFeedback;
  }
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
