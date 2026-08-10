import { AlertTriangle, GitMerge, Route } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getOperatorCurationCopy,
  operatorCurationMapLabel,
} from "@/lib/operator-curation-copy";
import { formatOperatorTemplate } from "@/lib/operator-copy";
import type {
  CatalogEntityResolutionCluster,
  CatalogEntityResolutionQaReport,
} from "@/server/catalog-source/entity-resolution-qa-repository";
import { FuzzyDuplicateRefreshForm } from "./fuzzy-duplicate-refresh-form";

interface CatalogEntityResolutionReportProps {
  locale: InterfaceLocale;
  report: CatalogEntityResolutionQaReport;
  refreshAction: (formData: FormData) => Promise<unknown>;
}

export function CatalogEntityResolutionReport({
  locale,
  report,
  refreshAction,
}: CatalogEntityResolutionReportProps) {
  const copy = getOperatorCurationCopy(locale);

  return (
    <section className="grid min-w-0 gap-4 border-b border-border pb-6 [&>*]:min-w-0">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <GitMerge className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold break-words text-foreground">
              {copy.entity.title}
            </h2>
          </div>
          <FuzzyDuplicateRefreshForm
            locale={locale}
            refreshAction={refreshAction}
          />
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge>
            {copy.entity.clusters}: {report.summary.clusterCount}
          </Badge>
          <Badge>
            {copy.entity.catalogRows}:{" "}
            {report.summary.sourceBackedCatalogRowsReviewed}
          </Badge>
          <Badge>
            {copy.entity.aliasChecks}:{" "}
            {report.summary.aliasCollisionRowsReviewed}
          </Badge>
          <Badge>
            {copy.entity.sourceGroups}:{" "}
            {report.summary.sourceCandidateGroupsReviewed}
          </Badge>
          <Badge>
            {formatOperatorTemplate(copy.entity.fuzzyReviewed, {
              reviewed: report.summary.fuzzyDuplicateRowsReviewed,
              total: report.summary.fuzzyDuplicatePairCount,
            })}
          </Badge>
          <Badge>
            {copy.entity.leakCheck}:{" "}
            {operatorCurationMapLabel(
              copy.common.statuses,
              report.leakCheck,
              copy.common.unknown,
            )}
          </Badge>
        </div>
        <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {report.summary.groups.map((group) => (
            <div
              key={group.kind}
              className="min-w-0 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 font-medium break-words text-foreground">
                  {copy.entity.groups[group.kind].label}
                </span>
                <Badge>{group.count}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {copy.entity.groups[group.kind].nextAction}
              </p>
            </div>
          ))}
        </div>
      </div>

      {report.clusters.length > 0 ? (
        <ol className="grid min-w-0 gap-3">
          {report.clusters.map((cluster) => (
            <li key={cluster.id} className="min-w-0">
              <EntityResolutionClusterCard locale={locale} cluster={cluster} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.entity.noClusters}
        </p>
      )}
    </section>
  );
}

function EntityResolutionClusterCard({
  locale,
  cluster,
}: {
  locale: InterfaceLocale;
  cluster: CatalogEntityResolutionCluster;
}) {
  const copy = getOperatorCurationCopy(locale);
  const kind = copy.entity.groups[cluster.kind].label;

  return (
    <article className="grid min-w-0 gap-3 rounded-lg border border-border p-4 [&>*]:min-w-0">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="min-w-0 text-base font-semibold break-words text-foreground">
              {formatOperatorTemplate(copy.entity.clusterTitle, {
                kind,
                count: cluster.members.length,
              })}
            </h3>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge>{kind}</Badge>
            <Badge>
              {operatorCurationMapLabel(
                copy.entity.riskLevels,
                cluster.riskLevel,
                copy.common.unknown,
              )}
            </Badge>
            <Badge>
              {operatorCurationMapLabel(
                copy.entity.actions,
                cluster.recommendedAction,
                copy.common.unknown,
              )}
            </Badge>
            {cluster.fuzzyScore !== undefined ? (
              <Badge>
                {copy.entity.score}: {cluster.fuzzyScore}%
              </Badge>
            ) : null}
            {cluster.fuzzyScoreBucket ? (
              <Badge>
                {operatorCurationMapLabel(
                  copy.entity.scoreBuckets,
                  cluster.fuzzyScoreBucket,
                  copy.common.unknown,
                )}
              </Badge>
            ) : null}
            {cluster.localeRelation ? (
              <Badge>
                {operatorCurationMapLabel(
                  copy.entity.localeRelations,
                  cluster.localeRelation,
                  copy.common.unknown,
                )}
              </Badge>
            ) : null}
            {cluster.evidenceStatus ? (
              <Badge>
                {operatorCurationMapLabel(
                  copy.entity.evidenceStatuses,
                  cluster.evidenceStatus,
                  copy.common.unknown,
                )}
              </Badge>
            ) : null}
          </div>
          {cluster.reasonCodes?.length ? (
            <p className="mt-2 text-xs break-words text-muted-foreground">
              {copy.entity.reasons}:{" "}
              {cluster.reasonCodes
                .map((reason) =>
                  operatorCurationMapLabel(
                    copy.entity.reasonCodes,
                    reason,
                    copy.common.unknown,
                  ),
                )
                .join(", ")}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {copy.entity.clusterReason}
          </p>
        </div>
        <Link
          href={cluster.actionHref}
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          <Route className="size-4" />
          {copy.entity.reviewPath}
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
              {member.catalogKind ? (
                <Badge>
                  {operatorCurationMapLabel(
                    copy.common.catalogKinds,
                    member.catalogKind,
                    copy.common.catalogKinds.identity,
                  )}
                </Badge>
              ) : null}
              {member.source ? <Badge>{member.source}</Badge> : null}
              {member.status ? (
                <Badge>
                  {operatorCurationMapLabel(
                    copy.common.statuses,
                    member.status,
                    copy.common.unknown,
                  )}
                </Badge>
              ) : null}
              {member.locale ? (
                <Badge>
                  {copy.entity.locale}: {member.locale}
                </Badge>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {member.typeaheadNameCount !== undefined ? (
                <span>
                  {copy.common.typeaheadNames}: {member.typeaheadNameCount}
                </span>
              ) : null}
              {member.sourceLinkCount !== undefined ? (
                <span>
                  {copy.entity.sourceLinks}: {member.sourceLinkCount}
                </span>
              ) : null}
              {member.rowCount !== undefined ? (
                <span>
                  {copy.common.rows}: {member.rowCount}
                </span>
              ) : null}
              {member.publicSlug ? (
                <span>
                  {copy.entity.slug}: {member.publicSlug}
                </span>
              ) : null}
              {member.normalizedLabel ? (
                <span>
                  {copy.entity.normalized}: {member.normalizedLabel}
                </span>
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
