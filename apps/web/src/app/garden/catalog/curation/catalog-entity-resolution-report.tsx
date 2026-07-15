import { AlertTriangle, GitMerge, Route } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import type {
  CatalogEntityResolutionCluster,
  CatalogEntityResolutionQaReport,
} from "@/server/catalog-source/entity-resolution-qa-repository";
import { FuzzyDuplicateRefreshForm } from "./fuzzy-duplicate-refresh-form";

interface CatalogEntityResolutionReportProps {
  report: CatalogEntityResolutionQaReport;
  refreshAction: () => Promise<void>;
}

export function CatalogEntityResolutionReport({
  report,
  refreshAction,
}: CatalogEntityResolutionReportProps) {
  return (
    <section className="grid min-w-0 gap-4 border-b border-border pb-6 [&>*]:min-w-0">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <GitMerge className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold break-words text-foreground">
              Entity-resolution QA
            </h2>
          </div>
          <FuzzyDuplicateRefreshForm refreshAction={refreshAction} />
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge>Clusters: {report.summary.clusterCount}</Badge>
          <Badge>
            Catalog rows: {report.summary.sourceBackedCatalogRowsReviewed}
          </Badge>
          <Badge>
            Alias checks: {report.summary.aliasCollisionRowsReviewed}
          </Badge>
          <Badge>
            Source groups: {report.summary.sourceCandidateGroupsReviewed}
          </Badge>
          <Badge>
            Fuzzy reviewed: {report.summary.fuzzyDuplicateRowsReviewed} of{" "}
            {report.summary.fuzzyDuplicatePairCount}
          </Badge>
          <Badge>Leak check: {report.leakCheck}</Badge>
        </div>
        <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {report.summary.groups.map((group) => (
            <div
              key={group.kind}
              className="min-w-0 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 font-medium break-words text-foreground">
                  {group.label}
                </span>
                <Badge>{group.count}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {group.nextAction}
              </p>
            </div>
          ))}
        </div>
      </div>

      {report.clusters.length > 0 ? (
        <ol className="grid min-w-0 gap-3">
          {report.clusters.map((cluster) => (
            <li key={cluster.id} className="min-w-0">
              <EntityResolutionClusterCard cluster={cluster} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No entity-resolution clusters need review in the current safe report.
        </p>
      )}
    </section>
  );
}

function EntityResolutionClusterCard({
  cluster,
}: {
  cluster: CatalogEntityResolutionCluster;
}) {
  return (
    <article className="grid min-w-0 gap-3 rounded-lg border border-border p-4 [&>*]:min-w-0">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="min-w-0 text-base font-semibold break-words text-foreground">
              {cluster.title}
            </h3>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge>{cluster.kind}</Badge>
            <Badge>{cluster.riskLevel}</Badge>
            <Badge>{cluster.recommendedAction}</Badge>
            {cluster.fuzzyScore !== undefined ? (
              <Badge>Score: {cluster.fuzzyScore}%</Badge>
            ) : null}
            {cluster.fuzzyScoreBucket ? (
              <Badge>{cluster.fuzzyScoreBucket}</Badge>
            ) : null}
            {cluster.localeRelation ? (
              <Badge>{cluster.localeRelation}</Badge>
            ) : null}
            {cluster.evidenceStatus ? (
              <Badge>{cluster.evidenceStatus}</Badge>
            ) : null}
          </div>
          {cluster.reasonCodes?.length ? (
            <p className="mt-2 text-xs break-words text-muted-foreground">
              Reasons: {cluster.reasonCodes.join(", ")}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">{cluster.reason}</p>
        </div>
        <Link
          href={cluster.actionHref}
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          <Route className="size-4" />
          Review path
        </Link>
      </div>

      <div className="grid min-w-0 gap-2">
        {cluster.members.map((member) => (
          <div
            key={`${cluster.id}:${member.label}:${member.source ?? ""}`}
            className="min-w-0 rounded-md border border-border px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words text-foreground">
                {member.label}
              </span>
              {member.catalogKind ? <Badge>{member.catalogKind}</Badge> : null}
              {member.source ? <Badge>{member.source}</Badge> : null}
              {member.status ? <Badge>{member.status}</Badge> : null}
              {member.locale ? <Badge>Locale: {member.locale}</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {member.typeaheadNameCount !== undefined ? (
                <span>Typeahead names: {member.typeaheadNameCount}</span>
              ) : null}
              {member.sourceLinkCount !== undefined ? (
                <span>Source links: {member.sourceLinkCount}</span>
              ) : null}
              {member.rowCount !== undefined ? (
                <span>Rows: {member.rowCount}</span>
              ) : null}
              {member.publicSlug ? (
                <span>Slug: {member.publicSlug}</span>
              ) : null}
              {member.normalizedLabel ? (
                <span>Normalized: {member.normalizedLabel}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
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
