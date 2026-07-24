import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { OperatorPilotCopy } from "@/lib/operator-pilot-copy";
import { getOperatorPilotCopy } from "@/lib/operator-pilot-copy";
import type { OperatorCopy } from "@/lib/operator-copy";
import {
  formatOperatorDate,
  formatOperatorTemplate,
  getOperatorCopy,
  operatorAccessModeLabel,
  operatorRoleLabel,
} from "@/lib/operator-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolvePilotHealthOperatorAccess } from "@/server/pilot-health-access";
import {
  getPilotHealthReadoutSafely,
  type PilotHealthMetrics,
} from "@/server/pilot-health-repository";
import { getMvpLearningReportSafely } from "@/server/mvp-learning/report";
import { scopedToUser } from "@/server/request-scope";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { GardenAuthPanel } from "../garden-auth-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorPilotCopy(await getRequestInterfaceLocale()).health;
  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function PilotHealthPage() {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const operatorCopy = getOperatorCopy(locale);
  const copy = getOperatorPilotCopy(locale);
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const access = await resolvePilotHealthOperatorAccess(scope);

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotHealthHeader operatorCopy={operatorCopy} copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotHealthHeader operatorCopy={operatorCopy} copy={copy} />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {operatorCopy.common.accessDenied}
        </p>
      </main>
    );
  }

  const [readout, mvpLearning] = await Promise.all([
    getPilotHealthReadoutSafely(),
    getMvpLearningReportSafely(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <PilotHealthHeader operatorCopy={operatorCopy} copy={copy} />

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.gate}:{" "}
          {operatorAccessModeLabel(locale, access.mode)}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.role}: {operatorRoleLabel(locale, access.role)}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.status}: {copy.health.provisionalStatus}
        </span>
        {readout ? (
          <span className="rounded-md border border-border px-2 py-1">
            {operatorCopy.common.generated}:{" "}
            {formatOperatorDate(locale, readout.generatedAt)}
          </span>
        ) : null}
      </div>

      {mvpLearning ? (
        <section className="grid gap-3 rounded-lg border border-border p-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.health.mvpLearningTitle}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {formatOperatorTemplate(copy.health.mvpLearningDescription, {
                policyVersion: mvpLearning.policyVersion,
                retentionPolicyVersion: mvpLearning.retentionPolicyVersion,
                decisionGate: mvpLearning.decisionGate,
              })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile
              label={copy.health.mvpLearningSelfServeActivated}
              value={mvpLearning.cohorts.real_self_serve.activatedGardeners}
            />
            <MetricTile
              label={copy.health.mvpLearningSelfServeH1}
              value={mvpLearning.cohorts.real_self_serve.h1RetainedGardeners}
            />
            <MetricTile
              label={copy.health.mvpLearningClosedPilotActivated}
              value={mvpLearning.cohorts.real_closed_pilot.activatedGardeners}
            />
            <MetricTile
              label={copy.health.mvpLearningClosedPilotH1}
              value={mvpLearning.cohorts.real_closed_pilot.h1RetainedGardeners}
            />
            <MetricTile
              label={copy.health.mvpLearningUnclassified}
              value={mvpLearning.unclassifiedEventCount}
            />
            <MetricTile
              label={copy.health.mvpLearningExcluded}
              value={Object.values(mvpLearning.exclusions).reduce(
                (sum, count) => sum + count,
                0,
              )}
            />
          </div>
        </section>
      ) : null}

      {!readout ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.health.unavailable}
        </p>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            {readout.windows.map((window) => (
              <WindowPanel
                key={window.key}
                title={copy.health.windows[window.key]}
                since={window.since}
                metrics={window.metrics}
                locale={locale}
                copy={copy}
              />
            ))}
          </section>

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                {copy.health.writeAccessTitle}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.health.writeAccessDescription}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label={copy.metrics.closedPilotWriters}
                value={readout.writeAccess.writeEligibleGardeners}
              />
              <MetricTile
                label={copy.metrics.founderRehearsal}
                value={readout.writeAccess.founderRehearsalGardeners}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {copy.health.rehearsalNote}
            </p>
          </section>

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                {copy.health.publicVarietyTitle}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.health.publicVarietyDescription}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricTile
                label={copy.metrics.promotedIndexable}
                value={readout.publicVarietyIndexability.promotedIndexableCount}
              />
              <MetricTile
                label={copy.metrics.thinNoindex}
                value={readout.publicVarietyIndexability.thinNoindexCount}
              />
              <MetricTile
                label={copy.metrics.demoted410}
                value={
                  readout.publicVarietyIndexability.demotedByArchiveOrGoneCount
                }
              />
              <MetricTile
                label={copy.metrics.currentPublicVarieties}
                value={
                  readout.publicVarietyIndexability.currentPublicVarietyCount
                }
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {formatOperatorTemplate(copy.health.threshold, {
                entries:
                  readout.publicVarietyIndexability.threshold
                    .minPublicEntryCount,
                characters:
                  readout.publicVarietyIndexability.threshold
                    .minAggregateBodyLength,
              })}
            </p>
          </section>

          <section className="grid gap-3 rounded-lg border border-border p-4">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.health.guardrailsTitle}
            </h2>
            <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
              {copy.health.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {readout.references.map((reference) => (
                <span
                  key={reference.path}
                  className="rounded-md border border-border px-2 py-1"
                >
                  {copy.health.references[
                    reference.path as keyof typeof copy.health.references
                  ] ?? reference.path}
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function PilotHealthHeader({
  operatorCopy,
  copy,
}: {
  operatorCopy: OperatorCopy;
  copy: OperatorPilotCopy;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <Link
        href="/garden"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        {operatorCopy.common.backToJournal}
      </Link>
      <Link
        href="/garden/pilot-smoke"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        {operatorCopy.common.pilotSmoke}
      </Link>
      <Link
        href="/garden/pilot-learning/interviews"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        {operatorCopy.common.founderInterviews}
      </Link>
      <Link
        href="/garden/pilot-learning/decision"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        {operatorCopy.common.cohortDecision}
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.health.title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy.health.description}
        </p>
      </div>
    </header>
  );
}

function WindowPanel({
  title,
  since,
  metrics,
  locale,
  copy,
}: {
  title: string;
  since: Date;
  metrics: PilotHealthMetrics;
  locale: InterfaceLocale;
  copy: OperatorPilotCopy;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">
          {formatOperatorTemplate(copy.health.since, {
            date: formatOperatorDate(locale, since, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
          })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          label={copy.metrics.firstEntryActivations}
          value={metrics.firstEntryActivations}
        />
        <MetricTile
          label={copy.metrics.totalEntries}
          value={metrics.totalEntries}
        />
        <MetricTile
          label={copy.metrics.activeGardeners}
          value={metrics.activeGardeners}
        />
        <MetricTile
          label={copy.metrics.sameObjectFollowUps}
          value={metrics.sameObjectFollowUpEntries}
        />
        <MetricTile
          label={copy.metrics.revisitFollowUp}
          value={metrics.sameSessionRevisitFollowUps}
        />
        <MetricTile
          label={copy.metrics.photoUsage}
          value={formatPercent(metrics.photoUsageRate)}
        />
        <MetricTile
          label={copy.metrics.offlineQueued}
          value={metrics.offlineQueued}
        />
        <MetricTile
          label={copy.metrics.offlineSynced}
          value={metrics.offlineSynced}
        />
        <MetricTile
          label={copy.metrics.offlineFailed}
          value={getOperatorCopy(locale).common.notServerObservable}
        />
        <MetricTile
          label={copy.metrics.publishedEntries}
          value={metrics.publishedEntries}
        />
        <MetricTile
          label={copy.metrics.publishRate}
          value={formatPercent(metrics.publishRate)}
        />
        <MetricTile
          label={copy.metrics.archive410}
          value={metrics.publicGoneEntries}
        />
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">
          {copy.health.acquisitionTitle}
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label={copy.metrics.homepageStartsSaves}
            value={`${metrics.activationStarts.homepage} -> ${metrics.entrySavesByActivationSource.homepage}`}
          />
          <MetricTile
            label={copy.metrics.publicVarietyStartsSaves}
            value={`${metrics.activationStarts.publicVariety} -> ${metrics.entrySavesByActivationSource.publicVariety}`}
          />
          <MetricTile
            label={copy.metrics.directGardenStartsSaves}
            value={`${metrics.activationStarts.directGarden} -> ${metrics.entrySavesByActivationSource.directGarden}`}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {formatOperatorTemplate(copy.health.publicVarietyRate, {
            rate: formatPercent(metrics.publicVarietySaveRate),
          })}
        </p>
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">
          {copy.health.invitedLoopTitle}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label={copy.metrics.inviteStartsSaves}
            value={`${metrics.invitedCohort.starts} -> ${metrics.invitedCohort.firstEntrySaves}`}
          />
          <MetricTile
            label={copy.metrics.firstSaveRate}
            value={formatPercent(metrics.invitedCohort.firstEntrySaveRate)}
          />
          <MetricTile
            label={copy.metrics.sameObjectFollowUps}
            value={metrics.invitedCohort.sameObjectFollowUpEntries}
          />
          <MetricTile
            label={copy.metrics.returningGardeners}
            value={metrics.invitedCohort.returningGardeners}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {copy.health.invitedLoopDescription}
        </p>
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">
          {copy.health.valuePulseTitle}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label={copy.metrics.responses}
            value={metrics.followUpValuePulse.responses}
          />
          <MetricTile
            label={copy.metrics.submittedSkipped}
            value={`${metrics.followUpValuePulse.submitted} -> ${metrics.followUpValuePulse.skipped}`}
          />
          <MetricTile
            label={copy.metrics.usefulness}
            value={`${metrics.followUpValuePulse.useful} / ${metrics.followUpValuePulse.notSure} / ${metrics.followUpValuePulse.notUseful}`}
          />
          <MetricTile
            label={copy.metrics.usefulRate}
            value={formatPercent(metrics.followUpValuePulse.usefulRate)}
          />
          <MetricTile
            label={copy.metrics.withReason}
            value={metrics.followUpValuePulse.withReason}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {copy.health.valuePulseDescription}
        </p>
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <dl className="grid min-h-20 gap-1 rounded-lg border border-border p-3">
      <dt className="text-xs text-muted-foreground uppercase">{label}</dt>
      <dd className="text-2xl font-semibold text-foreground tabular-nums">
        {value}
      </dd>
    </dl>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
