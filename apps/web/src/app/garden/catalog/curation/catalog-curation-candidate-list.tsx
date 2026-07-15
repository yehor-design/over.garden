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

import { buttonVariants } from "@/components/ui/button";
import { catalogSuggestionTrustMetadata } from "@/lib/garden/catalog-trust";

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
  pilotOrigin: boolean;
  invitedPilotUserCount: number;
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
  candidates: CatalogCurationCandidate[];
  confirmAction: (formData: FormData) => void | Promise<void>;
  mergeAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
  rescanAction: (formData: FormData) => void | Promise<void>;
  approveSuggestionAction: CatalogMatchSuggestionAction;
  rejectSuggestionAction: CatalogMatchSuggestionAction;
}

interface CatalogMatchSuggestionActionResult {
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
  candidates,
  confirmAction,
  mergeAction,
  rejectAction,
  rescanAction,
  approveSuggestionAction,
  rejectSuggestionAction,
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
  candidate: CatalogCurationCandidate;
  confirmAction: (formData: FormData) => void | Promise<void>;
  mergeAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
  rescanAction: (formData: FormData) => void | Promise<void>;
  approveSuggestionAction: CatalogMatchSuggestionAction;
  rejectSuggestionAction: CatalogMatchSuggestionAction;
}

function CatalogCurationCandidateCard({
  candidate,
  confirmAction,
  mergeAction,
  rejectAction,
  rescanAction,
  approveSuggestionAction,
  rejectSuggestionAction,
}: CatalogCurationCandidateCardProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);
  const [selected, setSelected] = useState<CatalogSuggestion | null>(null);
  const [status, setStatus] = useState<CatalogStatus>("idle");
  const [refreshQueued, setRefreshQueued] = useState(false);
  const candidateTrust = catalogSuggestionTrustMetadata({
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

  return (
    <article
      className={`grid gap-4 rounded-lg border p-4 ${
        candidate.pilotOrigin
          ? "border-primary/40 bg-primary/5"
          : "border-border"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold break-words text-foreground">
            {candidate.displayName}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {candidate.pilotOrigin ? (
              <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
                Pilot signal
              </span>
            ) : null}
            <span className="rounded-md border border-border px-2 py-1">
              {candidate.locale}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {catalogKindLabel(candidate.catalogKind)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {candidateTrust.trustLabel}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {candidateTrust.sourceLabel}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Objects: {candidate.affectedObjectCount}
            </span>
            {candidate.invitedPilotUserCount > 0 ? (
              <span className="rounded-md border border-border px-2 py-1">
                Invited gardeners: {candidate.invitedPilotUserCount}
              </span>
            ) : null}
            <span className="rounded-md border border-border px-2 py-1">
              Created: {formatDate(candidate.createdAt)}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {candidateTrust.sourceCaveat}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={rescanAction} onSubmit={() => setRefreshQueued(true)}>
            <input type="hidden" name="candidateId" value={candidate.id} />
            <CatalogRescanButton queued={refreshQueued} />
          </form>
          <form action={confirmAction}>
            <input type="hidden" name="candidateId" value={candidate.id} />
            <button type="submit" className={buttonVariants()}>
              <CheckCircle2 className="size-4" />
              Confirm
            </button>
          </form>
        </div>
      </div>

      <CatalogMatchSuggestions
        suggestions={candidate.matchSuggestions}
        approveAction={approveSuggestionAction}
        rejectAction={rejectSuggestionAction}
      />

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
              <span className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border px-2 py-1 text-foreground">
                <span>
                  Target: {selected.displayName} ·{" "}
                  {catalogSuggestionTrustMetadata(selected).trustLabel}
                </span>
                <span className="text-muted-foreground">
                  {catalogSuggestionTrustMetadata(selected).disambiguationLabel}
                </span>
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

function CatalogMatchSuggestions({
  suggestions,
  approveAction,
  rejectAction,
}: {
  suggestions: CatalogMatchSuggestion[];
  approveAction: CatalogMatchSuggestionAction;
  rejectAction: CatalogMatchSuggestionAction;
}) {
  return (
    <section className="grid gap-3 border-t border-border pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">
          Deterministic match suggestions
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          Review deterministic evidence before changing catalog identity.
          Rejected evidence stays recorded without changing garden records.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <p className="border-y border-border py-3 text-sm text-muted-foreground">
          Not evaluated yet or refresh pending.
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
                        ? "No safe catalog match"
                        : rejected
                          ? `Rejected match: ${suggestion.targetDisplayName}`
                          : lowConfidence
                            ? `Held: ${suggestion.targetDisplayName}`
                            : `Suggested target: ${suggestion.targetDisplayName}`}
                    </p>
                    {!noSafeMatch &&
                    suggestion.targetCanonicalName &&
                    suggestion.targetCanonicalName !==
                      suggestion.targetDisplayName ? (
                      <p className="text-xs break-words text-muted-foreground">
                        Canonical: {suggestion.targetCanonicalName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 text-xs">
                    {rejected ? (
                      <span className="rounded-md border border-destructive/40 px-2 py-1 font-medium text-destructive">
                        Rejected
                      </span>
                    ) : null}
                    <span className="rounded-md border border-border px-2 py-1 font-medium text-foreground">
                      {suggestion.score}/100
                    </span>
                    <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                      {confidenceLabel(suggestion.confidenceBucket)}
                    </span>
                    <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                      {matchTypeLabel(suggestion.matchType)}
                    </span>
                    <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                      {catalogKindLabel(suggestion.catalogKind)}
                    </span>
                  </div>
                </div>

                <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="flex min-w-0 gap-1">
                    <dt className="shrink-0 font-medium text-foreground">
                      Normalized:
                    </dt>
                    <dd className="min-w-0 break-words">
                      {suggestion.normalizedInput}
                    </dd>
                  </div>
                  <div className="flex min-w-0 gap-1">
                    <dt className="shrink-0 font-medium text-foreground">
                      Locale/script:
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
                      Reasons:
                    </dt>
                    <dd className="min-w-0 break-words">
                      {suggestion.reasonCodes.map(reasonLabel).join(", ")}
                    </dd>
                  </div>
                </dl>

                {rejected ? (
                  <div className="grid gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">
                        Review reason:
                      </span>{" "}
                      {decisionReasonLabel(suggestion.decisionReasonCode)}
                    </p>
                    {suggestion.reviewedAt ? (
                      <p>
                        Reviewed {formatDate(suggestion.reviewedAt)}. Catalog
                        identity and journal history were unchanged.
                      </p>
                    ) : null}
                  </div>
                ) : !noSafeMatch && suggestion.targetCatalogItemId ? (
                  <CatalogMatchSuggestionDecisionControls
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

function CatalogRescanButton({ queued }: { queued: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || queued}
      className={buttonVariants({ variant: "outline" })}
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Queueing..." : queued ? "Refresh queued" : "Refresh matches"}
    </button>
  );
}

function CatalogMatchSuggestionDecisionControls({
  suggestionId,
  approveAction,
  rejectAction,
}: {
  suggestionId: string;
  approveAction: CatalogMatchSuggestionAction;
  rejectAction: CatalogMatchSuggestionAction;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<
    | CatalogMatchSuggestionActionResult
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
        setFeedback(result);
        if (result.outcome !== "stale") router.refresh();
      } catch {
        setFeedback({
          outcome: "error",
          message:
            "The decision could not be applied. Refresh the evidence and try again.",
        });
      }
    });
  }

  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <form onSubmit={(event) => submitDecision(event, approveAction)}>
          <input type="hidden" name="suggestionId" value={suggestionId} />
          <button
            type="submit"
            disabled={pendingDecision || feedback?.outcome === "stale"}
            className={buttonVariants()}
          >
            <CheckCircle2 className="size-4" />
            {pendingDecision ? "Applying..." : "Approve match"}
          </button>
        </form>

        <form
          onSubmit={(event) => submitDecision(event, rejectAction)}
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="suggestionId" value={suggestionId} />
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-foreground">
            Rejection reason
            <select
              name="reasonCode"
              defaultValue="not_same_entity"
              disabled={pendingDecision || feedback?.outcome === "stale"}
              className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="not_same_entity">Incorrect identity</option>
              <option value="wrong_catalog_kind">Wrong catalog kind</option>
              <option value="locale_or_script_mismatch">
                Locale or script mismatch
              </option>
              <option value="insufficient_evidence">
                Insufficient evidence
              </option>
              <option value="other_review_reason">Other review reason</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pendingDecision || feedback?.outcome === "stale"}
            className={buttonVariants({ variant: "outline" })}
          >
            <XCircle className="size-4" />
            {pendingDecision ? "Applying..." : "Reject suggestion"}
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

function confidenceLabel(value: CatalogMatchSuggestion["confidenceBucket"]) {
  switch (value) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
    case "none":
      return "No safe suggestion";
  }
}

function matchTypeLabel(value: CatalogMatchSuggestion["matchType"]) {
  switch (value) {
    case "normalized_exact":
      return "Exact name";
    case "transliteration_exact":
      return "Transliteration match";
    case "fuzzy_name":
      return "Fuzzy name";
    case "no_safe_match":
      return "Held";
  }
}

function reasonLabel(value: string) {
  const labels: Record<string, string> = {
    normalized_exact: "normalized names are identical",
    cyrtranslit_exact: "CyrTranslit keys are identical",
    rapidfuzz_name_similarity: "RapidFuzz name similarity",
    cross_script_similarity: "cross-script similarity",
    same_catalog_kind: "same catalog kind",
    below_safe_threshold: "below safe threshold",
    no_selectable_candidates: "no selectable candidates",
    unmatchable_input: "input cannot be matched safely",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function decisionReasonLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    approved_canonical_match: "Approved canonical match",
    not_same_entity: "Incorrect identity",
    wrong_catalog_kind: "Wrong catalog kind",
    locale_or_script_mismatch: "Locale or script mismatch",
    insufficient_evidence: "Insufficient evidence",
    other_review_reason: "Other review reason",
    legacy_review: "Legacy review decision",
  };
  return value ? (labels[value] ?? value.replaceAll("_", " ")) : "Unknown";
}

function catalogKindLabel(value: string) {
  const labels: Record<string, string> = {
    plant_variety: "Plant variety",
    species: "Species",
    breed: "Breed",
  };
  return labels[value] ?? value.replaceAll("_", " ");
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
