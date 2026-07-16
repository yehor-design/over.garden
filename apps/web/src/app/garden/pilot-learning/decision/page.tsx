import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { OperatorPilotCopy } from "@/lib/operator-pilot-copy";
import {
  getOperatorPilotCopy,
  operatorDecisionSignalLabel,
  operatorPilotLabel,
} from "@/lib/operator-pilot-copy";
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
  getPilotCohortDecisionReadoutSafely,
  type PilotCohortDecisionReadout,
} from "@/server/pilot-cohort-decision-repository";
import { scopedToUser } from "@/server/request-scope";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { GardenAuthPanel } from "../../garden-auth-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorPilotCopy(await getRequestInterfaceLocale()).decision;
  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function PilotCohortDecisionPage() {
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
        <PilotCohortDecisionHeader operatorCopy={operatorCopy} copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotCohortDecisionHeader operatorCopy={operatorCopy} copy={copy} />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {operatorCopy.common.accessDenied}
        </p>
      </main>
    );
  }

  const readout = await getPilotCohortDecisionReadoutSafely();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <PilotCohortDecisionHeader operatorCopy={operatorCopy} copy={copy} />

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.gate}:{" "}
          {operatorAccessModeLabel(locale, access.mode)}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.role}: {operatorRoleLabel(locale, access.role)}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.status}: {copy.decision.provisionalStatus}
        </span>
        {readout ? (
          <span className="rounded-md border border-border px-2 py-1">
            {operatorCopy.common.generated}:{" "}
            {formatOperatorDate(locale, readout.generatedAt)}
          </span>
        ) : null}
      </div>

      {!readout ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.decision.unavailable}
        </p>
      ) : (
        <>
          <DecisionPanel readout={readout} locale={locale} copy={copy} />

          {readout.decision.dataGaps.length > 0 ? (
            <section className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <h2 className="text-lg font-semibold text-foreground">
                {copy.decision.dataGaps}
              </h2>
              <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
                {readout.decision.dataGaps.map((gap) => (
                  <li key={gap}>{copy.decision.dataGapItem}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                {copy.decision.behaviorTitle}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {formatOperatorTemplate(copy.decision.evaluationWindow, {
                  window: copy.health.windows[readout.evaluationWindow.key],
                  date: formatOperatorDate(
                    locale,
                    readout.evaluationWindow.since,
                    { year: "numeric", month: "short", day: "numeric" },
                  ),
                })}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile
                label={copy.metrics.closedPilotWriters}
                value={readout.cohort.writeEligibleGardeners}
              />
              <MetricTile
                label={copy.metrics.founderRehearsal}
                value={readout.cohort.founderRehearsalGardeners}
              />
              <MetricTile
                label={copy.metrics.inviteStartsSaves}
                value={`${readout.cohort.inviteStarts} -> ${readout.cohort.firstEntrySaves}`}
              />
              <MetricTile
                label={copy.metrics.firstSaveRate}
                value={formatPercent(readout.cohort.firstEntrySaveRate)}
              />
              <MetricTile
                label={copy.metrics.sameObjectFollowUps}
                value={readout.cohort.sameObjectFollowUps}
              />
              <MetricTile
                label={copy.metrics.returningGardeners}
                value={readout.cohort.returningGardeners}
              />
              <MetricTile
                label={copy.metrics.returnRate}
                value={formatPercent(
                  readout.cohort.followUpRateAmongFirstSavers,
                )}
              />
            </div>
            <SegmentCohortPanel readout={readout} locale={locale} copy={copy} />
          </section>

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                {copy.decision.productSignalsTitle}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.decision.productSignalsDescription}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile
                label={copy.metrics.photoUsage}
                value={formatPercent(readout.productSignals.photoUsageRate)}
              />
              <MetricTile
                label={copy.metrics.publishedEntries}
                value={readout.productSignals.publishedEntries}
              />
              <MetricTile
                label={copy.metrics.publishRate}
                value={formatPercent(readout.productSignals.publishRate)}
              />
              <MetricTile
                label={copy.metrics.offlineQueued}
                value={readout.productSignals.offlineQueued}
              />
              <MetricTile
                label={copy.metrics.offlineSynced}
                value={readout.productSignals.offlineSynced}
              />
              <MetricTile
                label={copy.metrics.offlineFailed}
                value={operatorCopy.common.notServerObservable}
              />
            </div>
          </section>

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                {copy.decision.valuePulseTitle}
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label={copy.metrics.responses}
                value={readout.valuePulse.responses}
              />
              <MetricTile
                label={copy.metrics.submittedSkipped}
                value={`${readout.valuePulse.submitted} -> ${readout.valuePulse.skipped}`}
              />
              <MetricTile
                label={copy.metrics.usefulness}
                value={`${readout.valuePulse.useful} / ${readout.valuePulse.notSure} / ${readout.valuePulse.notUseful}`}
              />
              <MetricTile
                label={copy.metrics.usefulRate}
                value={formatPercent(readout.valuePulse.usefulRate)}
              />
            </div>
          </section>

          <InterviewCategoryPanel
            readout={readout}
            locale={locale}
            copy={copy}
          />

          <section className="grid gap-3 rounded-lg border border-border p-4">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.decision.interpretationTitle}
            </h2>
            <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
              {copy.decision.interpretation.map((note) => (
                <li key={note}>{note}</li>
              ))}
              {copy.decision.caveats.map((note) => (
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

function DecisionPanel({
  readout,
  locale,
  copy,
}: {
  readout: PilotCohortDecisionReadout;
  locale: InterfaceLocale;
  copy: OperatorPilotCopy;
}) {
  const { decision } = readout;

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.decision.recommendationTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.decision.recommendationDescription}
          </p>
        </div>
        <RecommendationBadge
          recommendation={decision.recommendation}
          copy={copy}
        />
      </div>

      <div className="grid gap-2 rounded-lg border border-border p-4">
        <p className="text-xl font-semibold text-foreground">
          {copy.decision.headlines[decision.recommendation]}
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {copy.decision.behavioralSignal}:{" "}
            {operatorDecisionSignalLabel(locale, decision.behavioralSignal)}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {copy.decision.interviewSignal}:{" "}
            {operatorDecisionSignalLabel(locale, decision.qualitativeSignal)}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {copy.decision.segmentSignal}:{" "}
            {operatorDecisionSignalLabel(locale, decision.segmentSignal)}
          </span>
        </div>
      </div>

      <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
        <li>{copy.decision.rationale[decision.recommendation]}</li>
      </ul>
    </section>
  );
}

function InterviewCategoryPanel({
  readout,
  locale,
  copy,
}: {
  readout: PilotCohortDecisionReadout;
  locale: InterfaceLocale;
  copy: OperatorPilotCopy;
}) {
  const { interviews } = readout;

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.decision.structuredTitle}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.decision.structuredDescription}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          label={copy.metrics.interviewRecords}
          value={interviews.totalRecords}
        />
        <MetricTile
          label={copy.metrics.decisionSignals}
          value={`${interviews.continueSignals} / ${interviews.iterateSignals} / ${interviews.stopSignals}`}
        />
      </div>

      <CategoryGrid
        title={copy.decision.segments}
        counts={interviews.bySegment}
        labelFor={(value) => operatorPilotLabel(locale, "segments", value)}
        emptyLabel={copy.decision.noRecords}
      />
      <CategoryGrid
        title={copy.decision.activationResults}
        counts={interviews.byActivationResult}
        labelFor={(value) =>
          operatorPilotLabel(locale, "activationResults", value)
        }
        emptyLabel={copy.decision.noRecords}
      />
      <CategoryGrid
        title={copy.decision.observedValue}
        counts={interviews.byObservedValue}
        labelFor={(value) =>
          operatorPilotLabel(locale, "observedValues", value)
        }
        emptyLabel={copy.decision.noRecords}
      />
      <CategoryGrid
        title={copy.decision.nextAction}
        counts={interviews.byNextAction}
        labelFor={(value) => operatorPilotLabel(locale, "nextActions", value)}
        emptyLabel={copy.decision.noRecords}
      />
    </section>
  );
}

function SegmentCohortPanel({
  readout,
  locale,
  copy,
}: {
  readout: PilotCohortDecisionReadout;
  locale: InterfaceLocale;
  copy: OperatorPilotCopy;
}) {
  const segments = [...readout.cohort.segments].sort((left, right) =>
    left.segment.localeCompare(right.segment),
  );

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold text-foreground">
          {copy.decision.segmentSlicesTitle}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.decision.segmentSlicesDescription}
        </p>
      </div>

      {segments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {copy.decision.noSegmentGrants}
        </p>
      ) : (
        <div className="grid gap-2">
          {segments.map((segment) => (
            <div
              key={segment.segment}
              className="grid gap-3 rounded-md border border-border p-3 text-sm lg:grid-cols-6"
            >
              <div className="grid gap-1">
                <span className="font-medium text-foreground">
                  {operatorPilotLabel(locale, "segments", segment.segment)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {operatorPilotLabel(
                    locale,
                    "coreBuckets",
                    segment.coreBucket,
                  )}{" "}
                  /{" "}
                  {operatorPilotLabel(
                    locale,
                    "diagnosticBuckets",
                    segment.diagnosticBucket,
                  )}
                </span>
                {segment.isUnknownSegment || segment.isLowSample ? (
                  <span className="text-xs font-medium text-amber-700">
                    {segment.isUnknownSegment
                      ? copy.decision.unknownSegment
                      : copy.decision.lowSample}
                  </span>
                ) : null}
              </div>
              <InlineMetric
                label={copy.metrics.starts}
                value={segment.starts}
              />
              <InlineMetric
                label={copy.metrics.firstSaves}
                value={segment.firstEntrySaves}
              />
              <InlineMetric
                label={copy.metrics.followUps}
                value={segment.sameObjectFollowUpEntries}
              />
              <InlineMetric
                label={copy.metrics.returning}
                value={segment.returningGardeners}
              />
              <InlineMetric
                label={copy.metrics.followUpRate}
                value={formatPercent(segment.followUpRateAmongFirstSavers)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryGrid({
  title,
  counts,
  labelFor,
  emptyLabel,
}: {
  title: string;
  counts: Record<string, number>;
  labelFor: (value: string) => string;
  emptyLabel: string;
}) {
  const entries = Object.entries(counts).sort((left, right) =>
    left[0].localeCompare(right[0]),
  );

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {entries.map(([value, count]) => (
            <div
              key={value}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{labelFor(value)}</span>
              <span className="font-semibold text-foreground tabular-nums">
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecommendationBadge({
  recommendation,
  copy,
}: {
  recommendation: PilotCohortDecisionReadout["decision"]["recommendation"];
  copy: OperatorPilotCopy;
}) {
  return (
    <span className="rounded-full border border-border px-3 py-1 text-sm font-medium text-foreground">
      {copy.decision.recommendations[recommendation]}
    </span>
  );
}

function PilotCohortDecisionHeader({
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
        href="/garden/pilot-health"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        {operatorCopy.common.pilotHealth}
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
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.decision.title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy.decision.description}
        </p>
      </div>
    </header>
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

function InlineMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <dl className="grid gap-1">
      <dt className="text-xs text-muted-foreground uppercase">{label}</dt>
      <dd className="font-semibold text-foreground tabular-nums">{value}</dd>
    </dl>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
