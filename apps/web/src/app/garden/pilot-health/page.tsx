import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolvePilotHealthOperatorAccess } from "@/server/pilot-health-access";
import {
  getPilotHealthReadoutSafely,
  type PilotHealthMetrics,
} from "@/server/pilot-health-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../garden-auth-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pilot health | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PilotHealthPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const access = resolvePilotHealthOperatorAccess(scope);

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotHealthHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotHealthHeader />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Access denied.
        </p>
      </main>
    );
  }

  const readout = await getPilotHealthReadoutSafely();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <PilotHealthHeader />

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          Gate: {access.mode}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          Status: provisional pilot signals
        </span>
        {readout ? (
          <span className="rounded-md border border-border px-2 py-1">
            Generated: {formatDateTime(readout.generatedAt)}
          </span>
        ) : null}
      </div>

      {!readout ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Pilot health readout is temporarily unavailable. User-facing journal
          save flows do not depend on this operator read.
        </p>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            {readout.windows.map((window) => (
              <WindowPanel
                key={window.key}
                title={window.label}
                since={window.since}
                metrics={window.metrics}
              />
            ))}
          </section>

          <section className="grid gap-4 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                Public variety indexability
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                H6 trajectory only. This separates promoted/thin public variety
                pages from actual organic acquisition and signup conversion.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricTile
                label="Promoted/indexable"
                value={readout.publicVarietyIndexability.promotedIndexableCount}
              />
              <MetricTile
                label="Thin/noindex"
                value={readout.publicVarietyIndexability.thinNoindexCount}
              />
              <MetricTile
                label="De-promoted by archive/410"
                value={
                  readout.publicVarietyIndexability.demotedByArchiveOrGoneCount
                }
              />
              <MetricTile
                label="Current public varieties"
                value={
                  readout.publicVarietyIndexability.currentPublicVarietyCount
                }
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Current provisional threshold:{" "}
              {readout.publicVarietyIndexability.threshold.minPublicEntryCount}{" "}
              active public entries and{" "}
              {
                readout.publicVarietyIndexability.threshold
                  .minAggregateBodyLength
              }{" "}
              aggregate body characters.
            </p>
          </section>

          <section className="grid gap-3 rounded-lg border border-border p-4">
            <h2 className="text-lg font-semibold text-foreground">
              Interpretation guardrails
            </h2>
            <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
              {readout.notes.map((note) => (
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

function PilotHealthHeader() {
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
        href="/garden/pilot-smoke"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        Pilot smoke
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Pilot health
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Operator readout for H1 journal activation, H4 publication behavior,
          and H6 public-variety thinness trajectory. It uses aggregate counts
          and rates only, without journal text, precise location, media keys,
          request metadata, raw URLs, referrers, IP addresses, or user agents.
        </p>
      </div>
    </header>
  );
}

function WindowPanel({
  title,
  since,
  metrics,
}: {
  title: string;
  since: Date;
  metrics: PilotHealthMetrics;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">
          Since {formatDate(since)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          label="First-entry activations"
          value={metrics.firstEntryActivations}
        />
        <MetricTile label="Total entries" value={metrics.totalEntries} />
        <MetricTile label="Active gardeners" value={metrics.activeGardeners} />
        <MetricTile
          label="Same-object follow-ups"
          value={metrics.sameObjectFollowUpEntries}
        />
        <MetricTile
          label="Revisit -> follow-up"
          value={metrics.sameSessionRevisitFollowUps}
        />
        <MetricTile
          label="Photo usage"
          value={formatPercent(metrics.photoUsageRate)}
        />
        <MetricTile label="Offline queued" value={metrics.offlineQueued} />
        <MetricTile label="Offline synced" value={metrics.offlineSynced} />
        <MetricTile label="Offline failed" value="not server-observable" />
        <MetricTile
          label="Published entries"
          value={metrics.publishedEntries}
        />
        <MetricTile
          label="Publish rate"
          value={formatPercent(metrics.publishRate)}
        />
        <MetricTile
          label="Archive/410 count"
          value={metrics.publicGoneEntries}
        />
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">
          Acquisition intent
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Homepage starts -> saves"
            value={`${metrics.activationStarts.homepage} -> ${metrics.entrySavesByActivationSource.homepage}`}
          />
          <MetricTile
            label="Public-variety starts -> saves"
            value={`${metrics.activationStarts.publicVariety} -> ${metrics.entrySavesByActivationSource.publicVariety}`}
          />
          <MetricTile
            label="Direct garden starts -> saves"
            value={`${metrics.activationStarts.directGarden} -> ${metrics.entrySavesByActivationSource.directGarden}`}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Public-variety save rate:{" "}
          {formatPercent(metrics.publicVarietySaveRate)}. Starts are server-side
          `/garden` intent events, not raw URLs or referrers.
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
