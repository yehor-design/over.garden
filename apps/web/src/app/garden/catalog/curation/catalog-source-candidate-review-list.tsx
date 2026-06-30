import {
  CheckCircle2,
  CirclePause,
  Database,
  ExternalLink,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { catalogKindLabel } from "@/lib/garden/pilot-ux-copy";
import type {
  CatalogSourceCandidateReviewItem,
  CatalogSourceCandidateReviewStatus,
} from "@/server/catalog-source/candidate-review-repository";

interface CatalogSourceCandidateReviewListProps {
  candidates: CatalogSourceCandidateReviewItem[];
  promoteAction: (formData: FormData) => void | Promise<void>;
  holdAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
}

const STATUS_GROUPS: Array<{
  status: CatalogSourceCandidateReviewStatus;
  label: string;
}> = [
  { status: "quarantined", label: "Quarantined" },
  { status: "review_needed", label: "Review needed" },
  { status: "projected", label: "Projected" },
  { status: "rejected", label: "Rejected" },
];

export function CatalogSourceCandidateReviewList({
  candidates,
  promoteAction,
  holdAction,
  rejectAction,
}: CatalogSourceCandidateReviewListProps) {
  const grouped = STATUS_GROUPS.map((group) => ({
    ...group,
    candidates: candidates.filter(
      (candidate) => candidate.status === group.status,
    ),
  }));

  return (
    <section className="grid gap-4 border-b border-border pb-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Source candidate review
        </h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            Rows: {candidates.length}
          </span>
          {grouped.map((group) => (
            <span
              key={group.status}
              className="rounded-md border border-border px-2 py-1"
            >
              {group.label}: {group.candidates.length}
            </span>
          ))}
        </div>
      </div>

      {candidates.length > 0 ? (
        <div className="grid gap-5">
          {grouped.map((group) =>
            group.candidates.length > 0 ? (
              <div key={group.status} className="grid gap-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">
                  {group.label}
                </h3>
                <ol className="grid gap-4">
                  {group.candidates.map((candidate) => (
                    <li key={candidate.sourceRecordId}>
                      <CatalogSourceCandidateCard
                        candidate={candidate}
                        promoteAction={promoteAction}
                        holdAction={holdAction}
                        rejectAction={rejectAction}
                      />
                    </li>
                  ))}
                </ol>
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No source candidates are waiting for review.
        </p>
      )}
    </section>
  );
}

function CatalogSourceCandidateCard({
  candidate,
  promoteAction,
  holdAction,
  rejectAction,
}: {
  candidate: CatalogSourceCandidateReviewItem;
  promoteAction: (formData: FormData) => void | Promise<void>;
  holdAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <article className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-4 shrink-0 text-muted-foreground" />
            <h4 className="truncate text-lg font-semibold text-foreground">
              {candidate.review.displayName}
            </h4>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge>{candidate.status}</Badge>
            <Badge>{candidate.sourceSlug}</Badge>
            <Badge>Version: {candidate.sourceVersion}</Badge>
            <Badge>Row: {candidate.sourceRecordKey}</Badge>
            {candidate.review.reviewStatus ? (
              <Badge>{candidate.review.reviewStatus}</Badge>
            ) : null}
            {candidate.review.legalStatus ? (
              <Badge>{candidate.review.legalStatus}</Badge>
            ) : null}
            {candidate.review.curatorDecision ? (
              <Badge>{candidate.review.curatorDecision}</Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {candidate.actions.canPromote ? (
            <form action={promoteAction}>
              <input
                type="hidden"
                name="sourceRecordId"
                value={candidate.sourceRecordId}
              />
              <button type="submit" className={buttonVariants()}>
                <CheckCircle2 className="size-4" />
                Promote
              </button>
            </form>
          ) : null}
          {candidate.actions.canHold ? (
            <form action={holdAction}>
              <input
                type="hidden"
                name="sourceRecordId"
                value={candidate.sourceRecordId}
              />
              <button
                type="submit"
                className={buttonVariants({
                  variant: "outline",
                })}
              >
                <CirclePause className="size-4" />
                Hold
              </button>
            </form>
          ) : null}
          {candidate.actions.canReject ? (
            <form action={rejectAction}>
              <input
                type="hidden"
                name="sourceRecordId"
                value={candidate.sourceRecordId}
              />
              <button
                type="submit"
                className={buttonVariants({
                  variant: "outline",
                })}
              >
                <XCircle className="size-4" />
                Reject
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-2">
        {candidate.review.speciesName ? (
          <div>
            <dt className="text-xs text-muted-foreground">Species</dt>
            <dd className="mt-1 font-medium text-foreground">
              {candidate.review.speciesName}
            </dd>
          </div>
        ) : null}
        {candidate.review.candidateKind ? (
          <div>
            <dt className="text-xs text-muted-foreground">Candidate kind</dt>
            <dd className="mt-1 font-medium text-foreground">
              {candidate.review.candidateKind}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Source</dt>
          <dd className="mt-1">
            <a
              href={candidate.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              <span className="truncate">{candidate.sourceName}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">License</dt>
          <dd className="mt-1 font-medium text-foreground">
            {candidate.licenseUrl ? (
              <a
                href={candidate.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:underline"
              >
                <span className="truncate">{candidate.license}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              candidate.license
            )}
            {candidate.attributionRequired ? " · attribution required" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Parser</dt>
          <dd className="mt-1 font-medium text-foreground">
            {candidate.parserVersion}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Verified</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatDate(candidate.verifiedAt)}
          </dd>
        </div>
        {candidate.review.sourceRowReference ? (
          <div className="md:col-span-2">
            <dt className="text-xs text-muted-foreground">Review note</dt>
            <dd className="mt-1 font-medium text-foreground">
              {candidate.review.sourceRowReference}
            </dd>
          </div>
        ) : null}
      </dl>

      {candidate.promotionPreview ? (
        <div className="rounded-md border border-border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {candidate.promotionPreview.canonicalName}
            </span>
            <Badge>
              {catalogKindLabel(candidate.promotionPreview.catalogKind)}
            </Badge>
            <Badge>{candidate.promotionPreview.source}</Badge>
            <Badge>aliases {candidate.promotionPreview.aliases.length}</Badge>
          </div>
          {candidate.promotionPreview.aliases.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {candidate.promotionPreview.aliases.map((alias) => (
                <span
                  key={`${alias.locale}:${alias.displayName}`}
                  className="rounded border border-border px-1.5 py-0.5"
                >
                  {alias.displayName} · {alias.locale}
                  {alias.isPrimary ? " · primary" : ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : candidate.actions.blockedReason ? (
        <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          {candidate.actions.blockedReason}
        </p>
      ) : null}

      {candidate.projectedCatalog ? (
        <div className="rounded-md border border-border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {candidate.projectedCatalog.canonicalName}
            </span>
            <Badge>{candidate.projectedCatalog.status}</Badge>
            <Badge>
              typeahead names {candidate.projectedCatalog.typeaheadNameCount}
            </Badge>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-border px-2 py-1">
      {children}
    </span>
  );
}

function formatDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}
