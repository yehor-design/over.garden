import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  DEFAULT_PILOT_INTERVIEW_COHORT,
  PILOT_INTERVIEW_ACTIVATION_RESULT_OPTIONS,
  PILOT_INTERVIEW_COHORT_OPTIONS,
  PILOT_INTERVIEW_MAIN_OBJECTION_OPTIONS,
  PILOT_INTERVIEW_NEXT_ACTION_OPTIONS,
  PILOT_INTERVIEW_OBSERVED_VALUE_OPTIONS,
  PILOT_INTERVIEW_RETURN_REASON_OPTIONS,
  PILOT_INTERVIEW_SEGMENT_OPTIONS,
  getPilotInterviewActivationResultLabel,
  getPilotInterviewSegmentLabel,
  MAX_REDACTED_NOTE_LENGTH,
} from "@/lib/pilot/interview-learning";
import type {
  PilotInterviewActivationResult,
  PilotInterviewSegment,
} from "@/db/schema";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveFounderInterviewOperatorAccess } from "@/server/founder-interview-access";
import {
  groupFounderInterviewLearningsBySegment,
  listFounderInterviewLearnings,
} from "@/server/founder-interview-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden-auth-panel";
import { createFounderInterviewLearningAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founder interview capture | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function FounderInterviewCapturePage({
  searchParams,
}: {
  searchParams: Promise<{
    segment?: string;
    activationResult?: string;
  }>;
}) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const access = resolveFounderInterviewOperatorAccess(scope);
  const filters = await searchParams;

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <FounderInterviewHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <FounderInterviewHeader />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Access denied.
        </p>
      </main>
    );
  }

  const records = await listFounderInterviewLearnings({
    segment: filters.segment ?? null,
    activationResult: filters.activationResult ?? null,
  });
  const groupedRecords = groupFounderInterviewLearningsBySegment(records);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <FounderInterviewHeader />

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          Gate: {access.mode}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          Records: {records.length}
        </span>
      </div>

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Capture structured learning
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Record bounded pilot interview signals only. Do not paste journal
            text, media keys, contact details, signed URLs, or raw transcripts.
          </p>
        </div>

        <form
          action={createFounderInterviewLearningAction}
          className="grid gap-4 border-t border-border pt-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Segment"
              name="segment"
              required
              options={PILOT_INTERVIEW_SEGMENT_OPTIONS}
            />
            <SelectField
              label="Activation result"
              name="activationResult"
              required
              options={PILOT_INTERVIEW_ACTIVATION_RESULT_OPTIONS}
            />
            <SelectField
              label="Return reason"
              name="returnReason"
              required
              options={PILOT_INTERVIEW_RETURN_REASON_OPTIONS}
            />
            <SelectField
              label="Main objection"
              name="mainObjection"
              required
              options={PILOT_INTERVIEW_MAIN_OBJECTION_OPTIONS}
            />
            <SelectField
              label="Observed value"
              name="observedValue"
              required
              options={PILOT_INTERVIEW_OBSERVED_VALUE_OPTIONS}
            />
            <SelectField
              label="Next action"
              name="nextAction"
              required
              options={PILOT_INTERVIEW_NEXT_ACTION_OPTIONS}
            />
          </div>

          <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
            Optional subject user id (operator only)
            <input
              name="subjectUserId"
              type="text"
              placeholder="00000000-0000-4000-8000-000000000001"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>

          <SelectField
            label="Pilot cohort"
            name="pilotCohort"
            value={DEFAULT_PILOT_INTERVIEW_COHORT}
            options={PILOT_INTERVIEW_COHORT_OPTIONS}
          />

          <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
            Optional redacted note ({MAX_REDACTED_NOTE_LENGTH} chars max)
            <textarea
              name="redactedNote"
              rows={3}
              maxLength={MAX_REDACTED_NOTE_LENGTH}
              placeholder="Short operator note without names, addresses, or quoted journal text."
              className="rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>

          <button
            type="submit"
            className={buttonVariants({ className: "self-start" })}
          >
            Save interview record
          </button>
        </form>
      </section>

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Readback grouped by segment
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Filter by segment or activation result. Lists enum fields only plus
            optional short notes and internal user ids.
          </p>
        </div>

        <form
          method="get"
          className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3"
        >
          <SelectField
            label="Filter segment"
            name="segment"
            value={filters.segment ?? ""}
            options={[
              { value: "", label: "All segments" },
              ...PILOT_INTERVIEW_SEGMENT_OPTIONS,
            ]}
          />
          <SelectField
            label="Filter activation result"
            name="activationResult"
            value={filters.activationResult ?? ""}
            options={[
              { value: "", label: "All activation results" },
              ...PILOT_INTERVIEW_ACTIVATION_RESULT_OPTIONS,
            ]}
          />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-end",
            })}
          >
            Apply filters
          </button>
        </form>

        {groupedRecords.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No interview records match the current filters.
          </p>
        ) : (
          <div className="grid gap-4">
            {groupedRecords.map((group) => (
              <section
                key={group.segment}
                className="grid gap-3 rounded-lg border border-border p-4"
              >
                <header className="grid gap-1">
                  <h3 className="text-base font-semibold text-foreground">
                    {getPilotInterviewSegmentLabel(
                      group.segment as PilotInterviewSegment,
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {group.records.length} record
                    {group.records.length === 1 ? "" : "s"}
                  </p>
                </header>

                <ol className="grid gap-3">
                  {group.records.map((record) => (
                    <li
                      key={record.id}
                      className="grid gap-2 rounded-lg border border-border p-4 text-sm"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                        <p className="font-semibold text-foreground">
                          {getPilotInterviewActivationResultLabel(
                            record.activationResult as PilotInterviewActivationResult,
                          )}
                        </p>
                        <time className="text-xs text-muted-foreground">
                          {formatDate(record.recordedAt)}
                        </time>
                      </div>

                      <dl className="grid gap-2 text-muted-foreground sm:grid-cols-2">
                        <Field
                          label="Return reason"
                          value={record.returnReason}
                        />
                        <Field
                          label="Main objection"
                          value={record.mainObjection}
                        />
                        <Field
                          label="Observed value"
                          value={record.observedValue}
                        />
                        <Field label="Next action" value={record.nextAction} />
                        {record.subjectUserId ? (
                          <div>
                            <dt className="text-xs uppercase">
                              Subject user id (operator only)
                            </dt>
                            <dd className="font-mono text-xs">
                              {record.subjectUserId}
                            </dd>
                          </div>
                        ) : null}
                        {record.pilotCohort ? (
                          <Field
                            label="Pilot cohort"
                            value={record.pilotCohort}
                          />
                        ) : null}
                      </dl>

                      {record.redactedNote ? (
                        <p className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6 text-foreground">
                          {record.redactedNote}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function FounderInterviewHeader() {
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
        href="/garden/pilot-learning/decision"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        Cohort decision
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Founder interview capture
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Operator-only research ops for closed-pilot interviews. Structured
          fields tie learnings to segment and activation outcome without copying
          private journal text, media keys, contact details, or raw transcripts.
        </p>
      </div>
    </header>
  );
}

function SelectField({
  label,
  name,
  required,
  value,
  options,
}: {
  label: string;
  name: string;
  required?: boolean;
  value?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
      {label}
      <select
        name={name}
        required={required}
        value={value}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
