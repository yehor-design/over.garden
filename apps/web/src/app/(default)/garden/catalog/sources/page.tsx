import type { Metadata } from "next";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { catalogSourceRefreshCadence } from "@/lib/catalog/source-cadence";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";
import { formatOperatorDate, getOperatorCopy } from "@/lib/operator-copy";
import {
  assertAdminCapabilityForScope,
  hasAdminCapability,
} from "@/server/admin-access";
import { listCatalogSourceCards } from "@/server/catalog-curation-repository";
import {
  readCatalogAutoAcceptPrecision,
  readCatalogPickHealth,
  readOldestOpenQueueItemAgeDays,
  readTopCatalogSearchMisses,
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

import { CatalogOperatorShell } from "../catalog-operator-shell";
import {
  makeQueueItemFromMissAction,
  refreshCatalogSourceAction,
} from "./actions";

export const CATALOG_SOURCES_PATH = "/garden/catalog/sources";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCatalogCopy(await getRequestInterfaceLocale());
  return {
    title: copy.sources.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function CatalogSourcesPage() {
  const [locale, viewer] = await Promise.all([
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const copy = getOperatorCatalogCopy(locale);
  const operatorCopy = getOperatorCopy(locale);
  const shell = (
    accessState: "sign-in-required" | "denied" | "unavailable" | "allowed",
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
      <WorkspaceSectionError
        locale={locale}
        failure={viewer.failure}
        title={operatorCopy.common.accessDenied}
        retryHref={CATALOG_SOURCES_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
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
      <WorkspaceSectionError
        locale={locale}
        failure={access.failure}
        title={operatorCopy.common.accessDenied}
        retryHref={CATALOG_SOURCES_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, access.failure)}
      />,
    );
  }

  if (access.status === "denied") {
    return shell(
      "denied",
      <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        {operatorCopy.common.accessDenied}
      </p>,
    );
  }

  const canMutate = hasAdminCapability(access.access, "operator:mutate");

  return shell(
    "allowed",
    <div className="grid gap-8">
      <Suspense fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}>
        <CatalogSourcesSection locale={locale} canMutate={canMutate} />
      </Suspense>
      {/* The health figures settle on their own, so a slow percentile never
          holds the source cards back (ADR-0023). */}
      <Suspense fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}>
        <CatalogHealthSection locale={locale} canMutate={canMutate} />
      </Suspense>
    </div>,
  );
}

/**
 * The catalog's own numbers (OVE-398, ADR-0026 D12).
 *
 * Not a third menu link and not a separate page: the owner already comes here
 * to look at sources, and "is picking working" is the same question as "which
 * source deserves attention next".
 */
async function CatalogHealthSection({
  locale,
  canMutate,
}: {
  locale: InterfaceLocale;
  canMutate: boolean;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(
    async () => ({
      health: await readCatalogPickHealth(),
      misses: await readTopCatalogSearchMisses(),
      precision: await readCatalogAutoAcceptPrecision(),
      queueAgeDays: await readOldestOpenQueueItemAgeDays(),
    }),
    {
      deadlineMs: workspaceSectionDeadlineMs(3),
      surface: "catalog-sources",
      section: "health",
    },
  );

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.health.title}
        retryHref={CATALOG_SOURCES_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, settled)}
      />
    );
  }

  const { health, misses, precision, queueAgeDays } = settled.value;
  const duration = (value: number | null) =>
    value === null ? copy.health.notMeasured : `${Math.round(value)} ms`;
  const share = (part: number, whole: number) =>
    whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;

  return (
    <section
      aria-labelledby="catalog-health-heading"
      data-catalog-health="true"
      className="grid gap-4"
    >
      <div className="grid gap-1">
        <h2
          id="catalog-health-heading"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          {copy.health.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {copy.health.description}
        </p>
      </div>

      {health.every((row) => row.attempts === 0) ? (
        <p
          data-catalog-health-empty="true"
          className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
        >
          {copy.health.empty}
        </p>
      ) : (
        <ol className="grid gap-3 md:grid-cols-2">
          {health.map((row) => (
            <li
              key={row.windowDays}
              data-catalog-health-window={row.windowDays}
              className="grid gap-2 rounded-lg border border-border p-4"
            >
              <p className="font-medium text-foreground">
                {copy.health.window[String(row.windowDays) as "7" | "30"]} ·{" "}
                <span data-catalog-health-attempts={row.attempts}>
                  {row.attempts}
                </span>{" "}
                {copy.health.attempts}
              </p>
              <dl className="grid gap-1 text-sm text-muted-foreground">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>{copy.health.pickSuccess}</dt>
                  <dd data-catalog-health-picked={row.picked}>
                    {row.picked} · {share(row.picked, row.attempts)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>{copy.health.ownLabel}</dt>
                  <dd data-catalog-health-own-label={row.ownLabel}>
                    {row.ownLabel} · {share(row.ownLabel, row.attempts)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>{copy.health.abandoned}</dt>
                  <dd data-catalog-health-abandoned={row.abandoned}>
                    {row.abandoned} · {share(row.abandoned, row.attempts)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>{copy.health.medianTimeToPick}</dt>
                  <dd>{duration(row.medianMsToPick)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>{copy.health.p95TimeToPick}</dt>
                  <dd data-catalog-health-p95={row.p95MsToPick ?? ""}>
                    {duration(row.p95MsToPick)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-2">
        <h3 className="font-medium text-foreground">{copy.health.misses}</h3>
        <p className="text-sm text-muted-foreground">
          {copy.health.missesHint}
        </p>
        {misses.length === 0 ? (
          <p
            data-catalog-health-misses-empty="true"
            className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
          >
            {copy.health.missesEmpty}
          </p>
        ) : (
          <ol className="grid gap-2" data-catalog-health-misses="true">
            {misses.map((miss) => (
              <li
                key={`${miss.queryNormalized}:${miss.locale}:${miss.objectKind}`}
                data-catalog-health-miss={miss.queryNormalized}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-words text-foreground">
                  {miss.queryNormalized}
                </span>
                <span className="text-xs text-muted-foreground">
                  {miss.occurrences} {copy.health.occurrences} ·{" "}
                  {formatOperatorDate(locale, miss.lastSeenAt)}
                </span>
                {canMutate ? (
                  <OwnerScopedProgressiveForm action={makeQueueItemFromMissAction}>
                    <input
                      type="hidden"
                      name="queryNormalized"
                      value={miss.queryNormalized}
                    />
                    <input type="hidden" name="locale" value={miss.locale} />
                    <input
                      type="hidden"
                      name="objectKind"
                      value={miss.objectKind}
                    />
                    <button
                      type="submit"
                      data-catalog-health-miss-queue={miss.queryNormalized}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      {copy.health.makeQueueItem}
                    </button>
                  </OwnerScopedProgressiveForm>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-2">
        <h3 className="font-medium text-foreground">{copy.health.precision}</h3>
        <p className="text-sm text-muted-foreground">
          {copy.health.precisionHint}
        </p>
        {precision.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {copy.health.precisionEmpty}
          </p>
        ) : (
          <ul className="grid gap-1 text-sm" data-catalog-health-precision="true">
            {precision.map((rule) => (
              <li
                key={rule.ruleCode}
                data-catalog-health-rule={rule.ruleCode}
                className="flex flex-wrap justify-between gap-2 text-muted-foreground"
              >
                <span className="text-foreground">{rule.ruleCode}</span>
                <span>
                  {rule.applied} {copy.health.applied} · {rule.reverted}{" "}
                  {copy.health.reverted} ·{" "}
                  {share(rule.reverted, rule.applied + rule.reverted)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">
          {copy.health.queueAge}:{" "}
          <span data-catalog-health-queue-age={queueAgeDays ?? ""}>
            {queueAgeDays === null
              ? copy.health.queueAgeEmpty
              : `${queueAgeDays} ${copy.health.days}`}
          </span>
        </p>
      </div>
    </section>
  );
}

async function CatalogSourcesSection({
  locale,
  canMutate,
}: {
  locale: InterfaceLocale;
  canMutate: boolean;
}) {
  const copy = getOperatorCatalogCopy(locale);
  const settled = await settleSection(() => listCatalogSourceCards(), {
    deadlineMs: workspaceSectionDeadlineMs(3),
    surface: "catalog-sources",
    section: "sources",
  });

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.sources.title}
        retryHref={CATALOG_SOURCES_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, settled)}
      />
    );
  }

  const sources = settled.value;
  if (sources.length === 0) {
    return (
      <p
        data-catalog-sources-empty="true"
        className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
      >
        {copy.sources.empty}
      </p>
    );
  }

  // How often the upstream publishes, so the refresh button says whether
  // pressing it again this week could find anything.
  const cards = sources.map((source) => ({
    ...source,
    cadence: catalogSourceRefreshCadence(source.sourceSlug),
  }));

  return (
    <ol className="grid gap-3 md:grid-cols-2" data-catalog-sources="true">
      {cards.map((source) => (
        <li
          key={source.sourceSlug}
          data-catalog-source={source.sourceSlug}
          className="grid gap-2 rounded-lg border border-border p-4"
        >
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
          >
            <span className="truncate">{source.sourceName}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {copy.sources.version}: {source.sourceVersion}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.sources.license}: {source.license}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.sources.fetchedAt}:{" "}
              {formatOperatorDate(locale, source.fetchedAt)}
            </span>
            {source.cadence ? (
              <span
                data-catalog-source-cadence={source.cadence}
                className="rounded-md border border-border px-2 py-1"
              >
                {copy.sources.cadence}:{" "}
                {copy.sources.cadenceNames[source.cadence]}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {source.recordCount} {copy.sources.records} · {source.linkedCount}{" "}
            {copy.sources.linked} · {source.identifierCount}{" "}
            {copy.sources.identifiers} · {source.assertionCount}{" "}
            {copy.sources.assertions}
          </p>
          {source.attributionText ? (
            <p className="text-xs text-muted-foreground">
              {copy.sources.attribution}: {source.attributionText}
            </p>
          ) : null}
          {source.lastRefreshQueuedAt ? (
            <p
              data-catalog-source-refresh-status={source.lastRefreshStatus ?? ""}
              className="text-xs text-muted-foreground"
            >
              {copy.sources.lastRefresh}:{" "}
              {formatOperatorDate(locale, source.lastRefreshQueuedAt)}
              {source.lastRefreshStatus === "pending" ||
              source.lastRefreshStatus === "processing"
                ? ` · ${copy.sources.refreshQueued}`
                : ""}
            </p>
          ) : null}
          {canMutate ? (
            <OwnerScopedProgressiveForm action={refreshCatalogSourceAction}>
              <input type="hidden" name="sourceSlug" value={source.sourceSlug} />
              <button
                type="submit"
                data-catalog-source-refresh={source.sourceSlug}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {copy.sources.refresh}
              </button>
            </OwnerScopedProgressiveForm>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
