import {
  CheckCircle2,
  CirclePause,
  Database,
  ExternalLink,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { buildGardenCatalogTrustMetadata } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOperatorCurationCopy,
  operatorCurationMapLabel,
} from "@/lib/operator-curation-copy";
import { formatOperatorDate } from "@/lib/operator-copy";
import type {
  CatalogSourceCandidateReviewItem,
  CatalogSourceCandidateReviewSummary,
  CatalogSourceCandidateReviewStatus,
} from "@/server/catalog-source/candidate-review-repository";

interface CatalogSourceCandidateReviewListProps {
  locale: InterfaceLocale;
  candidates: CatalogSourceCandidateReviewItem[];
  summary?: CatalogSourceCandidateReviewSummary;
  activeStatus?: CatalogSourceCandidateReviewStatus | null;
  promoteAction: (formData: FormData) => void | Promise<void>;
  holdAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
}

const STATUS_GROUPS: CatalogSourceCandidateReviewStatus[] = [
  "quarantined",
  "held",
  "review_needed",
  "blocked",
  "rejected",
  "promoted",
];

export function CatalogSourceCandidateReviewList({
  locale,
  candidates,
  summary,
  activeStatus,
  promoteAction,
  holdAction,
  rejectAction,
}: CatalogSourceCandidateReviewListProps) {
  const copy = getOperatorCurationCopy(locale);
  const statusSummary = summary ?? buildLocalSummary(candidates);
  const grouped = STATUS_GROUPS.map((status) => ({
    status,
    candidates: candidates.filter((candidate) => candidate.status === status),
  }));

  return (
    <section className="grid min-w-0 gap-4 border-b border-border pb-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {copy.sourceReview.title}
        </h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {copy.common.rows}: {statusSummary.total}
          </span>
          {statusSummary.statuses.map((group) => (
            <span
              key={group.status}
              className="rounded-md border border-border px-2 py-1"
            >
              {operatorCurationMapLabel(
                copy.common.statuses,
                group.status,
                copy.common.unknown,
              )}
              : {group.count}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <FilterLink active={!activeStatus} href="/garden/catalog/curation">
            {copy.common.all}
          </FilterLink>
          {STATUS_GROUPS.map((status) => (
            <FilterLink
              key={status}
              active={activeStatus === status}
              href={`/garden/catalog/curation?sourceStatus=${status}`}
            >
              {operatorCurationMapLabel(
                copy.common.statuses,
                status,
                copy.common.unknown,
              )}
            </FilterLink>
          ))}
        </div>
      </div>

      {candidates.length > 0 ? (
        <div className="grid min-w-0 gap-5">
          {grouped.map((group) =>
            group.candidates.length > 0 ? (
              <div key={group.status} className="grid min-w-0 gap-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">
                  {operatorCurationMapLabel(
                    copy.common.statuses,
                    group.status,
                    copy.common.unknown,
                  )}
                </h3>
                <ol className="grid min-w-0 gap-4">
                  {group.candidates.map((candidate) => (
                    <li key={candidate.sourceRecordId} className="min-w-0">
                      <CatalogSourceCandidateCard
                        locale={locale}
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
          {copy.sourceReview.noCandidates}
        </p>
      )}
    </section>
  );
}

function buildLocalSummary(
  candidates: CatalogSourceCandidateReviewItem[],
): CatalogSourceCandidateReviewSummary {
  return {
    total: candidates.length,
    statuses: STATUS_GROUPS.map((status) => ({
      status,
      label: status,
      count: candidates.filter((candidate) => candidate.status === status)
        .length,
    })),
  };
}

function FilterLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-md border border-foreground bg-foreground px-2 py-1 text-background"
          : "rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </Link>
  );
}

function CatalogSourceCandidateCard({
  locale,
  candidate,
  promoteAction,
  holdAction,
  rejectAction,
}: {
  locale: InterfaceLocale;
  candidate: CatalogSourceCandidateReviewItem;
  promoteAction: (formData: FormData) => void | Promise<void>;
  holdAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
}) {
  const copy = getOperatorCurationCopy(locale);
  const trust = buildGardenCatalogTrustMetadata(locale, {
    status: candidate.status,
    source: candidate.promotionPreview?.source ?? candidate.sourceSlug,
    catalogKind:
      candidate.promotionPreview?.catalogKind ??
      candidate.projectedCatalog?.catalogKind ??
      null,
  });

  return (
    <article className="grid min-w-0 gap-4 rounded-lg border border-border p-4 [&>*]:min-w-0">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-4 shrink-0 text-muted-foreground" />
            <h4 className="truncate text-lg font-semibold text-foreground">
              {candidate.review.displayName}
            </h4>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge>{trust.trustLabel}</Badge>
            <Badge>{trust.sourceLabel}</Badge>
            <Badge>
              {copy.common.version}: {candidate.sourceVersion}
            </Badge>
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
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {trust.sourceCaveat}
          </p>
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
                {copy.sourceReview.promote}
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
                {copy.sourceReview.hold}
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
                {copy.sourceReview.reject}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <dl className="grid min-w-0 gap-3 text-sm md:grid-cols-2 [&>div]:min-w-0">
        {candidate.review.speciesName ? (
          <div>
            <dt className="text-xs text-muted-foreground">
              {copy.common.species}
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {candidate.review.speciesName}
            </dd>
          </div>
        ) : null}
        {candidate.review.candidateKind ? (
          <div>
            <dt className="text-xs text-muted-foreground">
              {copy.common.candidateKind}
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {operatorCurationMapLabel(
                copy.common.catalogKinds,
                candidate.review.candidateKind,
                copy.common.unknown,
              )}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">
            {copy.common.source}
          </dt>
          <dd className="mt-1">
            <a
              href={candidate.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full min-w-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              <span className="truncate">{candidate.sourceName}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {copy.common.license}
          </dt>
          <dd className="mt-1 font-medium break-words text-foreground">
            {candidate.licenseUrl ? (
              <a
                href={candidate.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full min-w-0 items-center gap-1 underline-offset-4 hover:underline"
              >
                <span className="truncate">{candidate.license}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              candidate.license
            )}
            {candidate.attributionRequired
              ? ` · ${copy.common.attributionRequired}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {copy.common.parser}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {candidate.parserVersion}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {copy.common.verified}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatOperatorDate(locale, candidate.verifiedAt)}
          </dd>
        </div>
        {candidate.review.sourceRowReference ? (
          <div className="md:col-span-2">
            <dt className="text-xs text-muted-foreground">
              {copy.common.reviewNote}
            </dt>
            <dd className="mt-1 font-medium break-words text-foreground">
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
              {operatorCurationMapLabel(
                copy.common.catalogKinds,
                candidate.promotionPreview.catalogKind,
                copy.common.catalogKinds.identity,
              )}
            </Badge>
            <Badge>
              {
                buildGardenCatalogTrustMetadata(locale, {
                  status: "seeded",
                  source: candidate.promotionPreview.source,
                  catalogKind: candidate.promotionPreview.catalogKind,
                }).sourceLabel
              }
            </Badge>
            <Badge>
              {copy.common.aliases} {candidate.promotionPreview.aliases.length}
            </Badge>
          </div>
          {candidate.promotionPreview.aliases.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {candidate.promotionPreview.aliases.map((alias) => (
                <span
                  key={`${alias.locale}:${alias.displayName}`}
                  className="rounded border border-border px-1.5 py-0.5"
                >
                  {alias.displayName} · {alias.locale}
                  {alias.isPrimary ? ` · ${copy.common.primary}` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : candidate.actions.blockedReason ? (
        <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          {copy.sourceReview.promotionBlocked}
        </p>
      ) : null}

      {candidate.projectedCatalog ? (
        <div className="rounded-md border border-border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {candidate.projectedCatalog.canonicalName}
            </span>
            <Badge>
              {
                buildGardenCatalogTrustMetadata(locale, {
                  status: candidate.projectedCatalog.status,
                  catalogKind: candidate.projectedCatalog.catalogKind,
                }).trustLabel
              }
            </Badge>
            <Badge>
              {copy.common.typeaheadNames}{" "}
              {candidate.projectedCatalog.typeaheadNameCount}
            </Badge>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="max-w-full rounded-md border border-border px-2 py-1 break-words">
      {children}
    </span>
  );
}
