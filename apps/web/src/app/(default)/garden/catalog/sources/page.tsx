import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { WorkspaceSectionRetry } from "@/components/garden/workspace-state-controls";
import { ArrowSquareOutIcon as ExternalLink } from "@/components/icons/ArrowSquareOut";
import { ActionOutcomeNotice } from "@/components/ui/action-outcome-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HiddenField } from "@/components/ui/hidden-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CATALOG_SOURCES_OUTCOME_ANCHOR,
  CATALOG_SOURCES_PATH,
  catalogSourceAnchor,
  curationItemName,
  curationQueueHref,
  quoteCurationText,
  readCatalogSourcesOutcome,
  type CatalogSourcesOutcome,
} from "@/lib/catalog/curation-queue";
import {
  formatPickDuration,
  PICK_MEDIAN_MIN_SAMPLE,
  PICK_P95_MIN_SAMPLE,
  PICK_SHARE_MIN_SAMPLE,
  pickSharePercent,
  readPickFigure,
} from "@/lib/catalog/pick-latency";
import { catalogSourceRefreshCadence } from "@/lib/catalog/source-cadence";
import {
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  countOperatorCatalogUnit,
  getOperatorCatalogCopy,
  type OperatorCatalogCopy,
} from "@/lib/operator-catalog-copy";
import { formatOperatorTemplate } from "@/lib/operator-copy";
import {
  assertAdminCapabilityForScope,
  hasAdminCapability,
} from "@/server/admin-access";
import {
  listCatalogSources,
  readCatalogSourceCoverage,
  readCurationQueueItemSummary,
  type CatalogSourceSummary,
} from "@/server/catalog-curation-repository";
import {
  readCatalogAutoAcceptPrecision,
  readCatalogPickHealth,
  readTopCatalogSearchMisses,
  readUnplacedRecords,
  type CatalogPickHealthRow,
} from "@/server/catalog-health-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import {
  CatalogOperatorDenied,
  CatalogOperatorShell,
  CatalogOperatorUnavailable,
  CatalogReadAt,
  formatCatalogOperatorDate,
  type CatalogOperatorAccessState,
} from "../catalog-operator-shell";
import { ReasonLine } from "../catalog-reason";
import { WorkTable } from "../catalog-work-table";
import {
  makeQueueItemFromMissAction,
  refreshCatalogSourceAction,
} from "./actions";

const MISSES_OUTCOME_ANCHOR = "misses-outcome";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCatalogCopy(await getRequestInterfaceLocale());
  return {
    title: `${copy.sources.metadataTitle} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

/**
 * The catalogue's sources and its own numbers (ADR-0026 D10, D12), rebuilt
 * as diagnostics (`OVE-506`): which sources the catalogue holds and how fresh
 * they are, then whether picking works, what gardeners could not find, how
 * often an automatic decision was taken back, and what no card can hold.
 *
 * Every block is its own settled read, and so is every source's count: one
 * slow source — the audit caught EPPO's timing out on production — fails
 * beside its own name and nothing else.
 */
export default async function CatalogSourcesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const emptyParams: Record<string, string | string[] | undefined> = {};
  const [locale, viewer, query] = await Promise.all([
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
    searchParams ?? Promise.resolve(emptyParams),
  ]);
  const copy = getOperatorCatalogCopy(locale);
  const outcome = readCatalogSourcesOutcome(query);
  const shell = (
    accessState: CatalogOperatorAccessState,
    children: React.ReactNode,
  ) => (
    <CatalogOperatorShell
      locale={locale}
      surface="catalog-sources"
      accessState={accessState}
      title={copy.sources.title}
      description={copy.sources.description}
    >
      {children}
    </CatalogOperatorShell>
  );

  if (viewer.status === "unavailable") {
    return shell(
      "unavailable",
      <CatalogOperatorUnavailable
        locale={locale}
        failure={viewer.failure}
        retryHref={CATALOG_SOURCES_PATH}
      />,
    );
  }

  if (viewer.status === "sign-in-required") {
    return shell(
      "sign-in-required",
      <SignInPrompt locale={locale} next={CATALOG_SOURCES_PATH} />,
    );
  }

  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(viewer.scope, "operator:read"),
  );

  if (access.status === "unavailable") {
    return shell(
      "unavailable",
      <CatalogOperatorUnavailable
        locale={locale}
        failure={access.failure}
        retryHref={CATALOG_SOURCES_PATH}
      />,
    );
  }

  if (access.status === "denied") {
    return shell("denied", <CatalogOperatorDenied locale={locale} />);
  }

  const canMutate = hasAdminCapability(access.access, "operator:mutate");
  const skeleton = (title: string) => (
    <WorkspaceSectionSkeleton
      locale={locale}
      title={title}
      rows={2}
      media={false}
    />
  );

  return shell(
    "allowed",
    <div className="grid gap-10">
      <Suspense fallback={skeleton(copy.sources.heading)}>
        <CatalogSourcesSection
          locale={locale}
          canMutate={canMutate}
          outcome={
            outcome && !outcome.result.startsWith("miss-") ? outcome : null
          }
        />
      </Suspense>
      <Suspense fallback={skeleton(copy.health.title)}>
        <CatalogPickHealthSection locale={locale} />
      </Suspense>
      <Suspense fallback={skeleton(copy.health.misses)}>
        <CatalogSearchMissesSection
          locale={locale}
          canMutate={canMutate}
          outcome={
            outcome && outcome.result.startsWith("miss-") ? outcome : null
          }
        />
      </Suspense>
      <Suspense fallback={skeleton(copy.health.precision)}>
        <CatalogPrecisionSection locale={locale} />
      </Suspense>
      <Suspense fallback={skeleton(copy.health.unplaced)}>
        <CatalogUnplacedSection locale={locale} />
      </Suspense>
    </div>,
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="grid gap-1">
      <h2 id={id} className="text-h3 font-semibold tracking-tight text-text">
        {title}
      </h2>
      {description ? (
        <p className="max-w-prose text-body-sm text-text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

async function CatalogSourcesSection({
  locale,
  canMutate,
  outcome,
}: {
  locale: InterfaceLocale;
  canMutate: boolean;
  outcome: CatalogSourcesOutcome | null;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => ({ sources: await listCatalogSources(), readAt: new Date() }),
    {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface: "catalog-sources",
      section: "sources",
    },
  );
  const heading = (
    <SectionHeading id="catalog-sources-heading" title={copy.sources.heading} />
  );

  if (settled.status === "error") {
    return (
      <section className="grid gap-3" aria-labelledby="catalog-sources-heading">
        {heading}
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          retryHref={CATALOG_SOURCES_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </section>
    );
  }

  const { sources, readAt } = settled.value;
  const named = outcome?.source
    ? (sources.find((source) => source.sourceSlug === outcome.source)
        ?.sourceName ?? outcome.source)
    : null;

  return (
    <section
      className="grid gap-3"
      aria-labelledby="catalog-sources-heading"
      data-catalog-sources-section="true"
    >
      {heading}
      <CatalogReadAt locale={locale} readAt={readAt} />
      {outcome ? (
        <div id={CATALOG_SOURCES_OUTCOME_ANCHOR} className="scroll-mt-24">
          <ActionOutcomeNotice
            outcome={outcome.result}
            about={`${outcome.result}:${outcome.source ?? ""}`}
            tone={outcome.result === "queued" ? "success" : "danger"}
            title={formatOperatorTemplate(
              outcome.result === "queued"
                ? copy.sources.outcome.queued
                : outcome.result === "denied"
                  ? copy.sources.outcome.denied
                  : outcome.result === "unknown-source"
                    ? copy.sources.outcome.unknownSource
                    : copy.sources.outcome.failed,
              { source: named ?? "—" },
            )}
          />
        </div>
      ) : null}
      {sources.length === 0 ? (
        <p
          data-catalog-sources-empty="true"
          className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted"
        >
          {copy.sources.empty}
        </p>
      ) : (
        <WorkTable
          caption={copy.sources.caption}
          data-catalog-sources="true"
          columns={[
            {
              key: "source",
              header: copy.sources.columns.source,
              primary: true,
            },
            { key: "freshness", header: copy.sources.columns.freshness },
            { key: "coverage", header: copy.sources.columns.coverage },
            { key: "action", header: copy.sources.columns.action },
          ]}
          rows={sources.map((source) => ({
            key: source.sourceSlug,
            id: catalogSourceAnchor(source.sourceSlug),
            attributes: { "data-catalog-source": source.sourceSlug },
            cells: {
              source: <SourceIdentity copy={copy} source={source} />,
              freshness: (
                <SourceFreshness locale={locale} copy={copy} source={source} />
              ),
              coverage: (
                <Suspense
                  fallback={
                    <span className="grid gap-1" aria-hidden="true">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </span>
                  }
                >
                  <SourceCoverage locale={locale} copy={copy} source={source} />
                </Suspense>
              ),
              action: canMutate ? (
                <OwnerScopedProgressiveForm action={refreshCatalogSourceAction}>
                  <HiddenField name="sourceSlug" value={source.sourceSlug} />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    aria-label={formatOperatorTemplate(
                      copy.sources.refreshLabel,
                      {
                        source: source.sourceName,
                      },
                    )}
                    data-catalog-source-refresh={source.sourceSlug}
                  >
                    {copy.sources.refresh}
                  </Button>
                </OwnerScopedProgressiveForm>
              ) : (
                "—"
              ),
            },
          }))}
        />
      )}
    </section>
  );
}

function SourceIdentity({
  copy,
  source,
}: {
  copy: OperatorCatalogCopy;
  source: CatalogSourceSummary;
}) {
  return (
    <span className="grid gap-1">
      <a
        href={source.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 items-start gap-1 font-medium text-text underline-offset-4 hover:underline"
      >
        <span className="wrap-anywhere">{source.sourceName}</span>
        <ExternalLink aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      </a>
      <code className="font-mono text-caption wrap-anywhere text-text-muted">
        {source.sourceSlug}
      </code>
      <span className="text-caption wrap-anywhere text-text-muted">
        {formatOperatorTemplate(copy.sources.version, {
          version: source.sourceVersion,
        })}
        {" · "}
        {formatOperatorTemplate(copy.sources.license, {
          license: source.license,
        })}
      </span>
      {source.attributionText ? (
        <span className="text-caption wrap-anywhere text-text-muted">
          {copy.sources.attribution}: {source.attributionText}
        </span>
      ) : null}
    </span>
  );
}

/**
 * How fresh a source is, from the two things that can be known without
 * counting anything: the snapshot the catalogue holds, and its refresh job.
 * This stays on screen when the counts beside it cannot be read.
 */
function SourceFreshness({
  locale,
  copy,
  source,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  source: CatalogSourceSummary;
}) {
  const cadence = catalogSourceRefreshCadence(source.sourceSlug);
  const refresh = source.refresh;
  // The job's row is reused by every press (one idempotency key per source),
  // so its creation date is the first-ever refresh; `updated_at` is when this
  // state began — queued again, claimed, finished or failed.
  const refreshLine = refresh
    ? formatOperatorTemplate(copy.sources.refreshStates[refresh.status], {
        date: formatCatalogOperatorDate(locale, refresh.updatedAt),
      })
    : copy.sources.refreshStates.none;
  return (
    <span className="grid gap-1">
      <span
        className="text-text"
        data-catalog-source-fetched-at={new Date(
          source.fetchedAt,
        ).toISOString()}
      >
        {formatOperatorTemplate(copy.sources.snapshot, {
          date: formatCatalogOperatorDate(locale, source.fetchedAt, {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
        })}
        <span className="text-text-muted">
          {" · "}
          {formatOperatorTemplate(copy.sources.verified, {
            date: formatCatalogOperatorDate(locale, source.verifiedAt, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
          })}
        </span>
      </span>
      {cadence ? (
        <span
          className="text-caption text-text-muted"
          data-catalog-source-cadence={cadence}
        >
          {formatOperatorTemplate(copy.sources.cadence, {
            cadence: copy.sources.cadenceNames[cadence],
          })}
        </span>
      ) : null}
      {source.rejectedAfterAt ? (
        <Badge tone="warning" data-catalog-source-rejected-after="true">
          {formatOperatorTemplate(copy.sources.rejectedAfter, {
            date: formatCatalogOperatorDate(locale, source.rejectedAfterAt, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
          })}
        </Badge>
      ) : null}
      <span
        className="text-caption text-text-muted"
        data-catalog-source-refresh-status={refresh?.status ?? "none"}
      >
        {refreshLine}
      </span>
    </span>
  );
}

/**
 * One source's counts, read on their own (`OVE-506` AC3): a source that is
 * slow to count fails in its own cell, with a retry that lands on its row,
 * while its name and freshness stay on screen and every other source is
 * still counted. It used to be one statement for all of them.
 */
async function SourceCoverage({
  locale,
  copy,
  source,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  source: CatalogSourceSummary;
}) {
  const settled = await settleSection(
    () => readCatalogSourceCoverage(source.snapshotId),
    {
      deadlineMs: workspaceSectionDeadlineMs(4),
      surface: "catalog-sources",
      section: `coverage:${source.sourceSlug}`,
    },
  );
  if (settled.status === "error") {
    return (
      <span
        className="grid gap-1"
        data-catalog-source-coverage="failed"
        data-section-failure={settled.failureClass}
      >
        <span className="text-body-sm text-text">
          {copy.sources.coverageFailed}
        </span>
        <span className="text-caption text-text-muted">
          {formatGardenWorkspaceTemplate(
            getGardenWorkspaceCopy(locale).workspace.sectionError.reference,
            { digest: settled.digest },
          )}
        </span>
        {/* The page itself, not an anchor on it: before hydration a link to
            `#source-…` on the same page only scrolls, and nothing is read
            again. Once hydrated, the press is a refresh that keeps the place. */}
        <span className="justify-self-start">
          <WorkspaceSectionRetry
            href={CATALOG_SOURCES_PATH}
            label={copy.sources.coverageRetry}
          />
        </span>
      </span>
    );
  }
  const coverage = settled.value;
  const share =
    coverage.recordCount > 0
      ? Math.round((coverage.linkedCount / coverage.recordCount) * 100)
      : null;
  return (
    <span
      className="grid gap-1"
      data-catalog-source-coverage="ready"
      data-catalog-source-records={coverage.recordCount}
      data-catalog-source-linked={coverage.linkedCount}
    >
      <span className="text-text">
        {countOperatorCatalogUnit(
          locale,
          coverage.recordCount,
          copy.units.records,
        )}
      </span>
      {share === null ? null : (
        <span className="text-text">
          {formatOperatorTemplate(copy.sources.linkedShare, {
            linked: new Intl.NumberFormat(locale).format(coverage.linkedCount),
            records: new Intl.NumberFormat(locale).format(coverage.recordCount),
            share,
          })}
        </span>
      )}
      <span className="text-caption text-text-muted">
        {countOperatorCatalogUnit(
          locale,
          coverage.identifierCount,
          copy.units.identifiers,
        )}
        {" · "}
        {countOperatorCatalogUnit(
          locale,
          coverage.assertionCount,
          copy.units.assertions,
        )}
      </span>
    </span>
  );
}

/**
 * Whether picking works (OVE-398, ADR-0026 D12), with the sample every figure
 * rests on (`OVE-506`, OG-UX-039). A median or a P95 is printed only over
 * enough measurements to be one; below that the cell says how many there
 * were and how many it takes.
 */
async function CatalogPickHealthSection({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => ({ health: await readCatalogPickHealth(), readAt: new Date() }),
    {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface: "catalog-sources",
      section: "health",
    },
  );
  const heading = (
    <SectionHeading
      id="catalog-health-heading"
      title={copy.health.title}
      description={copy.health.description}
    />
  );

  if (settled.status === "error") {
    return (
      <section className="grid gap-3" aria-labelledby="catalog-health-heading">
        {heading}
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          retryHref={CATALOG_SOURCES_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </section>
    );
  }

  const { health, readAt } = settled.value;
  return (
    <section
      className="grid gap-3"
      aria-labelledby="catalog-health-heading"
      data-catalog-health="true"
    >
      {heading}
      <CatalogReadAt locale={locale} readAt={readAt} />
      {health.every((row) => row.attempts === 0) ? (
        <p
          data-catalog-health-empty="true"
          className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted"
        >
          {copy.health.empty}
        </p>
      ) : (
        <>
          <PickHealthTable locale={locale} copy={copy} health={health} />
          <p className="max-w-prose text-caption text-text-muted">
            {formatOperatorTemplate(copy.health.sampleRule, {
              median: PICK_MEDIAN_MIN_SAMPLE,
              p95: PICK_P95_MIN_SAMPLE,
              share: PICK_SHARE_MIN_SAMPLE,
            })}
          </p>
        </>
      )}
    </section>
  );
}

function PickHealthTable({
  locale,
  copy,
  health,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  health: CatalogPickHealthRow[];
}) {
  const windowHeader = (row: CatalogPickHealthRow) => {
    const day = { day: "numeric", month: "short" } as const;
    return `${copy.health.window[String(row.windowDays) as "7" | "30"] ?? row.windowDays} · ${formatOperatorTemplate(
      copy.health.windowRange,
      {
        from: formatCatalogOperatorDate(locale, row.windowStart, day),
        to: formatCatalogOperatorDate(locale, row.windowEnd, day),
      },
    )}`;
  };
  const share = (part: number, whole: number) => {
    const percent = pickSharePercent(part, whole);
    const counted = formatOperatorTemplate(copy.health.share, { part, whole });
    return percent === null ? counted : `${counted} · ${percent}%`;
  };
  const latency = (
    row: CatalogPickHealthRow,
    value: number | null,
    needed: number,
    figure: "median" | "p95",
  ) => {
    const reading = readPickFigure(value, row.timedPicks, needed);
    const text =
      reading.status === "measured"
        ? formatOperatorTemplate(copy.health.measured, {
            value: formatPickDuration(reading.value, locale),
            sample: countOperatorCatalogUnit(
              locale,
              reading.sample,
              copy.units.measurements,
            ),
          })
        : reading.status === "insufficient"
          ? formatOperatorTemplate(copy.health.insufficient, {
              sample: reading.sample,
              needed: reading.needed,
            })
          : copy.health.notMeasured;
    return (
      <span
        data-catalog-health-figure={figure}
        data-catalog-health-figure-status={reading.status}
        data-catalog-health-window={row.windowDays}
        className={
          reading.status === "measured" ? "text-text" : "text-text-muted"
        }
      >
        {text}
      </span>
    );
  };
  const metricRows: Array<{
    key: string;
    label: string;
    cell: (row: CatalogPickHealthRow) => React.ReactNode;
  }> = [
    {
      key: "attempts",
      label: copy.health.attempts,
      cell: (row) => (
        <span data-catalog-health-attempts={row.attempts}>
          {countOperatorCatalogUnit(locale, row.attempts, copy.units.attempts)}
        </span>
      ),
    },
    {
      key: "picked",
      label: copy.health.pickSuccess,
      cell: (row) => (
        <span data-catalog-health-picked={row.picked}>
          {share(row.picked, row.attempts)}
        </span>
      ),
    },
    {
      key: "own-label",
      label: copy.health.ownLabel,
      cell: (row) => (
        <span data-catalog-health-own-label={row.ownLabel}>
          {share(row.ownLabel, row.attempts)}
        </span>
      ),
    },
    {
      key: "abandoned",
      label: copy.health.abandoned,
      cell: (row) => (
        <span data-catalog-health-abandoned={row.abandoned}>
          {share(row.abandoned, row.attempts)}
        </span>
      ),
    },
    {
      key: "median",
      label: copy.health.medianTimeToPick,
      cell: (row) =>
        latency(row, row.medianMsToPick, PICK_MEDIAN_MIN_SAMPLE, "median"),
    },
    {
      key: "p95",
      label: copy.health.p95TimeToPick,
      cell: (row) => latency(row, row.p95MsToPick, PICK_P95_MIN_SAMPLE, "p95"),
    },
  ];

  return (
    <WorkTable
      caption={copy.health.caption}
      data-catalog-health-table="true"
      columns={[
        { key: "metric", header: copy.health.metric, primary: true },
        ...health.map((row) => ({
          key: `window-${row.windowDays}`,
          header: windowHeader(row),
        })),
      ]}
      rows={metricRows.map((metric) => ({
        key: metric.key,
        attributes: { "data-catalog-health-metric": metric.key },
        cells: {
          metric: <span className="font-medium text-text">{metric.label}</span>,
          ...Object.fromEntries(
            health.map((row) => [`window-${row.windowDays}`, metric.cell(row)]),
          ),
        },
      }))}
    />
  );
}

async function CatalogSearchMissesSection({
  locale,
  canMutate,
  outcome,
}: {
  locale: InterfaceLocale;
  canMutate: boolean;
  outcome: CatalogSourcesOutcome | null;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => {
      const [misses, queued] = await Promise.all([
        readTopCatalogSearchMisses(),
        outcome?.queueItem
          ? readCurationQueueItemSummary(outcome.queueItem)
          : Promise.resolve(null),
      ]);
      return { misses, queued, readAt: new Date() };
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "catalog-sources",
      section: "misses",
    },
  );
  const heading = (
    <SectionHeading
      id="catalog-misses-heading"
      title={copy.health.misses}
      description={copy.health.missesHint}
    />
  );

  if (settled.status === "error") {
    return (
      <section className="grid gap-3" aria-labelledby="catalog-misses-heading">
        {heading}
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          retryHref={CATALOG_SOURCES_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </section>
    );
  }

  const { misses, queued, readAt } = settled.value;
  return (
    <section
      className="grid gap-3"
      aria-labelledby="catalog-misses-heading"
      data-catalog-health-misses-section="true"
    >
      {heading}
      <CatalogReadAt locale={locale} readAt={readAt} />
      {/* A "queued" whose item cannot be read back says nothing: the page
          only reports what the record shows. */}
      {outcome && (outcome.result !== "miss-queued" || queued) ? (
        <div id={MISSES_OUTCOME_ANCHOR} className="scroll-mt-24">
          <ActionOutcomeNotice
            outcome={outcome.result}
            about={`${outcome.result}:${outcome.queueItem ?? ""}`}
            tone={outcome.result === "miss-queued" ? "success" : "danger"}
            title={
              outcome.result === "miss-queued" && queued
                ? formatOperatorTemplate(copy.health.missOutcome.queued, {
                    query: curationItemName(locale, queued),
                  })
                : outcome.result === "miss-denied"
                  ? copy.health.missOutcome.denied
                  : copy.health.missOutcome.failed
            }
          >
            {outcome.result === "miss-queued" && queued ? (
              <Link
                href={curationQueueHref({
                  type: "label_link",
                  item: queued.id,
                  hash: "decision",
                })}
                className="text-link inline-flex min-h-10 items-center font-medium underline-offset-4 hover:underline"
                data-catalog-miss-queue-item={queued.id}
              >
                {copy.health.openQueueItem}
              </Link>
            ) : null}
          </ActionOutcomeNotice>
        </div>
      ) : null}
      {misses.length === 0 ? (
        <p
          data-catalog-health-misses-empty="true"
          className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted"
        >
          {copy.health.missesEmpty}
        </p>
      ) : (
        <WorkTable
          caption={copy.health.missesCaption}
          data-catalog-health-misses="true"
          columns={[
            {
              key: "query",
              header: copy.health.missesColumns.query,
              primary: true,
            },
            {
              key: "times",
              header: copy.health.missesColumns.times,
              numeric: true,
            },
            { key: "lastSeen", header: copy.health.missesColumns.lastSeen },
            { key: "action", header: copy.health.missesColumns.action },
          ]}
          rows={misses.map((miss) => ({
            key: `${miss.queryNormalized}:${miss.locale}:${miss.objectKind}`,
            attributes: { "data-catalog-health-miss": miss.queryNormalized },
            cells: {
              query: (
                <span className="font-medium text-text">
                  {quoteCurationText(locale, miss.queryNormalized)}
                </span>
              ),
              times: (
                <span className="tabular-nums">
                  {countOperatorCatalogUnit(
                    locale,
                    miss.occurrences,
                    copy.units.times,
                  )}
                </span>
              ),
              lastSeen: formatCatalogOperatorDate(locale, miss.lastSeenAt, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
              action: canMutate ? (
                <OwnerScopedProgressiveForm
                  action={makeQueueItemFromMissAction}
                >
                  <HiddenField
                    name="queryNormalized"
                    value={miss.queryNormalized}
                  />
                  <HiddenField name="locale" value={miss.locale} />
                  <HiddenField name="objectKind" value={miss.objectKind} />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    aria-label={formatOperatorTemplate(
                      copy.health.makeQueueItemLabel,
                      {
                        query: quoteCurationText(locale, miss.queryNormalized),
                      },
                    )}
                    data-catalog-health-miss-queue={miss.queryNormalized}
                  >
                    {copy.health.makeQueueItem}
                  </Button>
                </OwnerScopedProgressiveForm>
              ) : (
                "—"
              ),
            },
          }))}
        />
      )}
    </section>
  );
}

/**
 * How often an automatic decision was taken back, per rule. It sits with the
 * diagnostics rather than in the queue: it tells the owner which rule's
 * threshold to distrust, and nothing here is a decision.
 */
async function CatalogPrecisionSection({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => ({
      precision: await readCatalogAutoAcceptPrecision(),
      readAt: new Date(),
    }),
    {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface: "catalog-sources",
      section: "precision",
    },
  );
  const heading = (
    <SectionHeading
      id="catalog-precision-heading"
      title={copy.health.precision}
      description={copy.health.precisionHint}
    />
  );

  if (settled.status === "error") {
    return (
      <section
        className="grid gap-3"
        aria-labelledby="catalog-precision-heading"
      >
        {heading}
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          retryHref={CATALOG_SOURCES_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </section>
    );
  }

  const { precision, readAt } = settled.value;
  return (
    <section
      className="grid gap-3"
      aria-labelledby="catalog-precision-heading"
      data-catalog-health-precision-section="true"
    >
      {heading}
      <CatalogReadAt locale={locale} readAt={readAt} />
      {precision.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted">
          {copy.health.precisionEmpty}
        </p>
      ) : (
        <WorkTable
          caption={copy.health.precisionCaption}
          data-catalog-health-precision="true"
          columns={[
            {
              key: "rule",
              header: copy.health.precisionColumns.rule,
              primary: true,
            },
            {
              key: "applied",
              header: copy.health.precisionColumns.applied,
              numeric: true,
            },
            {
              key: "reverted",
              header: copy.health.precisionColumns.reverted,
              numeric: true,
            },
            { key: "share", header: copy.health.precisionColumns.share },
          ]}
          rows={precision.map((rule) => {
            const percent = pickSharePercent(rule.reverted, rule.applied);
            return {
              key: rule.ruleCode,
              attributes: {
                "data-catalog-health-rule": rule.ruleCode,
                "data-catalog-health-rule-reverted": String(rule.reverted),
              },
              cells: {
                rule: (
                  <ReasonLine
                    locale={locale}
                    copy={copy}
                    code={rule.ruleCode}
                  />
                ),
                applied: <span className="tabular-nums">{rule.applied}</span>,
                reverted: <span className="tabular-nums">{rule.reverted}</span>,
                share: (
                  <span className="text-text-muted">
                    {formatOperatorTemplate(copy.health.share, {
                      part: rule.reverted,
                      whole: rule.applied,
                    })}
                    {percent === null ? "" : ` · ${percent}%`}
                  </span>
                ),
              },
            };
          })}
        />
      )}
    </section>
  );
}

/**
 * Coverage, where the other measurements are. These used to sit in the
 * owner's decision stream — 13,450 of 13,456 open rows on 2026-09-20, and the
 * apply function refused every one of them, because there is no node to
 * attach an unplaced record to.
 */
async function CatalogUnplacedSection({ locale }: { locale: InterfaceLocale }) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => ({ unplaced: await readUnplacedRecords(), readAt: new Date() }),
    {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface: "catalog-sources",
      section: "unplaced",
    },
  );
  const heading = (
    <SectionHeading
      id="catalog-unplaced-heading"
      title={copy.health.unplaced}
      description={copy.health.unplacedHint}
    />
  );

  if (settled.status === "error") {
    return (
      <section
        className="grid gap-3"
        aria-labelledby="catalog-unplaced-heading"
      >
        {heading}
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          retryHref={CATALOG_SOURCES_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </section>
    );
  }

  const { unplaced, readAt } = settled.value;
  return (
    <section
      className="grid gap-3"
      aria-labelledby="catalog-unplaced-heading"
      data-catalog-unplaced-section="true"
    >
      {heading}
      <CatalogReadAt locale={locale} readAt={readAt} />
      {unplaced.length === 0 ? (
        <p
          data-catalog-unplaced-empty="true"
          className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted"
        >
          {copy.health.unplacedEmpty}
        </p>
      ) : (
        <WorkTable
          caption={copy.health.unplacedCaption}
          data-catalog-unplaced="true"
          columns={[
            {
              key: "source",
              header: copy.health.unplacedColumns.source,
              primary: true,
            },
            {
              key: "records",
              header: copy.health.unplacedColumns.records,
              numeric: true,
            },
            { key: "oldest", header: copy.health.unplacedColumns.oldest },
          ]}
          rows={unplaced.map((row) => ({
            key: row.sourceSlug,
            attributes: {
              "data-catalog-unplaced-source": row.sourceSlug,
              "data-catalog-unplaced-records": String(row.records),
            },
            cells: {
              source: (
                <code className="font-mono text-body-sm wrap-anywhere text-text">
                  {row.sourceSlug}
                </code>
              ),
              records: (
                <span className="tabular-nums">
                  {new Intl.NumberFormat(locale).format(row.records)}
                </span>
              ),
              oldest:
                row.oldestAgeDays === null
                  ? "—"
                  : countOperatorCatalogUnit(
                      locale,
                      row.oldestAgeDays,
                      copy.units.days,
                    ),
            },
          }))}
        />
      )}
    </section>
  );
}
