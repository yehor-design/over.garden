import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  getPilotInterviewActivationResultLabel,
  getPilotInterviewNextActionLabel,
  getPilotInterviewObservedValueLabel,
} from "@/lib/pilot/interview-learning";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolvePilotHealthOperatorAccess } from "@/server/pilot-health-access";
import {
  getPilotCohortDecisionReadoutSafely,
  type PilotCohortDecisionReadout,
} from "@/server/pilot-cohort-decision-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden-auth-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pilot cohort decision | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PilotCohortDecisionPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const access = resolvePilotHealthOperatorAccess(scope);

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotCohortDecisionHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotCohortDecisionHeader />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Access denied.
        </p>
      </main>
    );
  }

  const readout = await getPilotCohortDecisionReadoutSafely();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <PilotCohortDecisionHeader />

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          Gate: {access.mode}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          Status: provisional decision support
        </span>
        {readout ? (
          <span className="rounded-md border border-border px-2 py-1">
            Generated: {formatDateTime(readout.generatedAt)}
          </span>
        ) : null}
      </div>

      {!readout ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Pilot cohort decision readout is temporarily unavailable. User-facing
          journal save flows do not depend on this operator read.
        </p>
      ) : (
        <>
          <DecisionPanel readout={readout} />

          {readout.decision.dataGaps.length > 0 ? (
            <section className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <h2 className="text-lg font-semibold text-foreground">
                Data gaps
              </h2>
              <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
                {readout.decision.dataGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                Closed cohort behavior
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Evaluation window: {readout.evaluationWindow.label} (since{" "}
                {formatDate(readout.evaluationWindow.since)}). Denominator is
                invited gardeners who started through the enum-only
                `invited_cohort` source.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile
                label="Write-eligible gardeners"
                value={readout.cohort.writeEligibleGardeners}
              />
              <MetricTile
                label="Invite starts -> first saves"
                value={`${readout.cohort.inviteStarts} -> ${readout.cohort.firstEntrySaves}`}
              />
              <MetricTile
                label="First-save rate"
                value={formatPercent(readout.cohort.firstEntrySaveRate)}
              />
              <MetricTile
                label="Same-object follow-ups"
                value={readout.cohort.sameObjectFollowUps}
              />
              <MetricTile
                label="Returning gardeners"
                value={readout.cohort.returningGardeners}
              />
              <MetricTile
                label="Return rate / first savers"
                value={formatPercent(readout.cohort.followUpRateAmongFirstSavers)}
              />
            </div>
          </section>

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                Product usage signals
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Supporting context for iteration decisions. Publish intent and
                offline reliability are secondary to the H1 return loop.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile
                label="Photo usage"
                value={formatPercent(readout.productSignals.photoUsageRate)}
              />
              <MetricTile
                label="Published entries"
                value={readout.productSignals.publishedEntries}
              />
              <MetricTile
                label="Publish rate"
                value={formatPercent(readout.productSignals.publishRate)}
              />
              <MetricTile
                label="Offline queued"
                value={readout.productSignals.offlineQueued}
              />
              <MetricTile
                label="Offline synced"
                value={readout.productSignals.offlineSynced}
              />
              <MetricTile
                label="Offline failed"
                value="not server-observable"
              />
            </div>
          </section>

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                Follow-up value pulse
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                label="Responses (submitted + skipped)"
                value={readout.valuePulse.responses}
              />
              <MetricTile
                label="Submitted -> skipped"
                value={`${readout.valuePulse.submitted} -> ${readout.valuePulse.skipped}`}
              />
              <MetricTile
                label="Useful / not sure / not useful"
                value={`${readout.valuePulse.useful} / ${readout.valuePulse.notSure} / ${readout.valuePulse.notUseful}`}
              />
              <MetricTile
                label="Useful rate (of submitted)"
                value={formatPercent(readout.valuePulse.usefulRate)}
              />
            </div>
          </section>

          <InterviewCategoryPanel readout={readout} />

          <section className="grid gap-3 rounded-lg border border-border p-4">
            <h2 className="text-lg font-semibold text-foreground">
              How to interpret continue / iterate / stop
            </h2>
            <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
              <li>
                Continue: invited first-save rate stays at or above roughly
                two-thirds and returning gardeners reach roughly 30% of first
                savers — the closed-pilot H1 loop looks real enough to widen
                invites.
              </li>
              <li>
                Iterate: first entries happen, but same-object return stays low.
                Improve the return prompt and follow-up path before inviting
                more people.
              </li>
              <li>
                Stop / re-segment: invited gardeners rarely save a first entry.
                Pause recruiting and revisit ICP/JTBD rather than scaling.
              </li>
              {readout.caveats.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {readout.references.map((reference) => (
                <span
                  key={reference.path}
                  className="rounded-md border border-border px-2 py-1"
                >
                  {reference.label}
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function DecisionPanel({ readout }: { readout: PilotCohortDecisionReadout }) {
  const { decision } = readout;

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            Provisional recommendation
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Combines invited-cohort behavior, value pulse, and structured
            interview categories. This does not auto-decide product strategy.
          </p>
        </div>
        <RecommendationBadge recommendation={decision.recommendation} />
      </div>

      <div className="grid gap-2 rounded-lg border border-border p-4">
        <p className="text-xl font-semibold text-foreground">
          {decision.headline}
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            Behavioral signal: {decision.behavioralSignal}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            Interview signal: {decision.qualitativeSignal}
          </span>
        </div>
      </div>

      <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
        {decision.rationale.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function InterviewCategoryPanel({
  readout,
}: {
  readout: PilotCohortDecisionReadout;
}) {
  const { interviews } = readout;

  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Structured interview categories
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Aggregate enum counts only. Redacted notes, subject identifiers, and
          journal text never appear here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="Interview records" value={interviews.totalRecords} />
        <MetricTile
          label="Continue / iterate / stop signals"
          value={`${interviews.continueSignals} / ${interviews.iterateSignals} / ${interviews.stopSignals}`}
        />
      </div>

      <CategoryGrid
        title="Activation results"
        counts={interviews.byActivationResult}
        labelFor={(value) => getPilotInterviewActivationResultLabel(value)}
      />
      <CategoryGrid
        title="Observed value"
        counts={interviews.byObservedValue}
        labelFor={(value) => getPilotInterviewObservedValueLabel(value)}
      />
      <CategoryGrid
        title="Next action"
        counts={interviews.byNextAction}
        labelFor={(value) => getPilotInterviewNextActionLabel(value)}
      />
    </section>
  );
}

function CategoryGrid({
  title,
  counts,
  labelFor,
}: {
  title: string;
  counts: Record<string, number>;
  labelFor: (value: string) => string;
}) {
  const entries = Object.entries(counts).sort((left, right) =>
    left[0].localeCompare(right[0]),
  );

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No records yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {entries.map(([value, count]) => (
            <div
              key={value}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{labelFor(value)}</span>
              <span className="font-semibold tabular-nums text-foreground">
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
}: {
  recommendation: PilotCohortDecisionReadout["decision"]["recommendation"];
}) {
  const label =
    recommendation === "continue"
      ? "Continue"
      : recommendation === "iterate"
        ? "Iterate"
        : recommendation === "stop"
          ? "Stop / re-segment"
          : "Insufficient data";

  return (
    <span className="rounded-full border border-border px-3 py-1 text-sm font-medium text-foreground">
      {label}
    </span>
  );
}

function PilotCohortDecisionHeader() {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <Link
        href="/garden"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        Back to journal
      </Link>
      <Link
        href="/garden/pilot-health"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        Pilot health
      </Link>
      <Link
        href="/garden/pilot-learning/interviews"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        Founder interviews
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Pilot cohort decision
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Operator decision readout for the closed pilot: aggregate invited-cohort
          behavior, follow-up value pulse, and structured interview categories in
          one continue / iterate / stop frame. No raw journal text, transcripts,
          emails, media keys, precise location, IP, user agent, referrer, or query
          strings.
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

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
