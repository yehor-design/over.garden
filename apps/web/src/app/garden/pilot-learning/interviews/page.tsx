import type { Metadata } from "next";
import Link from "next/link";

import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
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
  MAX_REDACTED_NOTE_LENGTH,
} from "@/lib/pilot/interview-learning";
import type { OperatorPilotCopy } from "@/lib/operator-pilot-copy";
import {
  getOperatorPilotCopy,
  operatorPilotLabel,
  operatorPilotOptions,
} from "@/lib/operator-pilot-copy";
import type { OperatorCopy } from "@/lib/operator-copy";
import {
  formatOperatorCount,
  formatOperatorDate,
  formatOperatorTemplate,
  getOperatorCopy,
  operatorAccessModeLabel,
  operatorRoleLabel,
} from "@/lib/operator-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { hasAdminCapability } from "@/server/admin-access";
import { resolveFounderInterviewOperatorAccess } from "@/server/founder-interview-access";
import {
  groupFounderInterviewLearningsBySegment,
  listFounderInterviewLearnings,
} from "@/server/founder-interview-repository";
import { scopedToUser } from "@/server/request-scope";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { GardenAuthPanel } from "../../garden-auth-panel";
import { createFounderInterviewLearningAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorPilotCopy(
    await getRequestInterfaceLocale(),
  ).interviews;
  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function FounderInterviewCapturePage({
  searchParams,
}: {
  searchParams: Promise<{
    segment?: string;
    activationResult?: string;
  }>;
}) {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const operatorCopy = getOperatorCopy(locale);
  const copy = getOperatorPilotCopy(locale);
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const access = await resolveFounderInterviewOperatorAccess(scope);
  const filters = await searchParams;

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <FounderInterviewHeader operatorCopy={operatorCopy} copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <FounderInterviewHeader operatorCopy={operatorCopy} copy={copy} />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {operatorCopy.common.accessDenied}
        </p>
      </main>
    );
  }

  const records = await listFounderInterviewLearnings({
    segment: filters.segment ?? null,
    activationResult: filters.activationResult ?? null,
  });
  const groupedRecords = groupFounderInterviewLearningsBySegment(records);
  const canCaptureLearning = hasAdminCapability(access, "operator:mutate");
  const segmentOptions = operatorPilotOptions(
    locale,
    "segments",
    PILOT_INTERVIEW_SEGMENT_OPTIONS.map((option) => option.value),
  );
  const activationOptions = operatorPilotOptions(
    locale,
    "activationResults",
    PILOT_INTERVIEW_ACTIVATION_RESULT_OPTIONS.map((option) => option.value),
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <FounderInterviewHeader operatorCopy={operatorCopy} copy={copy} />

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.gate}:{" "}
          {operatorAccessModeLabel(locale, access.mode)}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.role}: {operatorRoleLabel(locale, access.role)}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.records}: {records.length}
        </span>
      </div>

      {canCaptureLearning ? (
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.interviews.captureTitle}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.interviews.captureDescription}
            </p>
          </div>

          <DocumentMutationActionForm
            action={createFounderInterviewLearningAction}
            className="grid gap-4 border-t border-border pt-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label={copy.interviews.segment}
                name="segment"
                required
                options={segmentOptions}
              />
              <SelectField
                label={copy.interviews.activationResult}
                name="activationResult"
                required
                options={activationOptions}
              />
              <SelectField
                label={copy.interviews.returnReason}
                name="returnReason"
                required
                options={operatorPilotOptions(
                  locale,
                  "returnReasons",
                  PILOT_INTERVIEW_RETURN_REASON_OPTIONS.map(
                    (option) => option.value,
                  ),
                )}
              />
              <SelectField
                label={copy.interviews.mainObjection}
                name="mainObjection"
                required
                options={operatorPilotOptions(
                  locale,
                  "objections",
                  PILOT_INTERVIEW_MAIN_OBJECTION_OPTIONS.map(
                    (option) => option.value,
                  ),
                )}
              />
              <SelectField
                label={copy.interviews.observedValue}
                name="observedValue"
                required
                options={operatorPilotOptions(
                  locale,
                  "observedValues",
                  PILOT_INTERVIEW_OBSERVED_VALUE_OPTIONS.map(
                    (option) => option.value,
                  ),
                )}
              />
              <SelectField
                label={copy.interviews.nextAction}
                name="nextAction"
                required
                options={operatorPilotOptions(
                  locale,
                  "nextActions",
                  PILOT_INTERVIEW_NEXT_ACTION_OPTIONS.map(
                    (option) => option.value,
                  ),
                )}
              />
            </div>

            <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
              {copy.interviews.subjectUserId}
              <input
                name="subjectUserId"
                type="text"
                placeholder="00000000-0000-4000-8000-000000000001"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>

            <SelectField
              label={copy.interviews.pilotCohort}
              name="pilotCohort"
              value={DEFAULT_PILOT_INTERVIEW_COHORT}
              options={operatorPilotOptions(
                locale,
                "cohorts",
                PILOT_INTERVIEW_COHORT_OPTIONS.map((option) => option.value),
              )}
            />

            <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
              {formatOperatorTemplate(copy.interviews.redactedNote, {
                count: MAX_REDACTED_NOTE_LENGTH,
              })}
              <textarea
                name="redactedNote"
                rows={3}
                maxLength={MAX_REDACTED_NOTE_LENGTH}
                placeholder={copy.interviews.redactedPlaceholder}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>

            <button
              type="submit"
              className={buttonVariants({ className: "self-start" })}
            >
              {copy.interviews.save}
            </button>
          </DocumentMutationActionForm>
        </section>
      ) : (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {copy.interviews.captureRequiresOwner}
        </p>
      )}

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.interviews.readbackTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.interviews.readbackDescription}
          </p>
        </div>

        <form
          method="get"
          className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3"
        >
          <SelectField
            label={copy.interviews.filterSegment}
            name="segment"
            value={filters.segment ?? ""}
            options={[
              { value: "", label: copy.interviews.allSegments },
              ...segmentOptions,
            ]}
          />
          <SelectField
            label={copy.interviews.filterActivation}
            name="activationResult"
            value={filters.activationResult ?? ""}
            options={[
              { value: "", label: copy.interviews.allActivationResults },
              ...activationOptions,
            ]}
          />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-end",
            })}
          >
            {copy.interviews.applyFilters}
          </button>
        </form>

        {groupedRecords.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.interviews.empty}
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
                    {operatorPilotLabel(locale, "segments", group.segment)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {formatOperatorCount(
                      locale,
                      group.records.length,
                      copy.interviews.recordForms,
                    )}
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
                          {operatorPilotLabel(
                            locale,
                            "activationResults",
                            record.activationResult,
                          )}
                        </p>
                        <time className="text-xs text-muted-foreground">
                          {formatOperatorDate(locale, record.recordedAt)}
                        </time>
                      </div>

                      <dl className="grid gap-2 text-muted-foreground sm:grid-cols-2">
                        <Field
                          label={copy.interviews.returnReason}
                          value={operatorPilotLabel(
                            locale,
                            "returnReasons",
                            record.returnReason,
                          )}
                        />
                        <Field
                          label={copy.interviews.mainObjection}
                          value={operatorPilotLabel(
                            locale,
                            "objections",
                            record.mainObjection,
                          )}
                        />
                        <Field
                          label={copy.interviews.observedValue}
                          value={operatorPilotLabel(
                            locale,
                            "observedValues",
                            record.observedValue,
                          )}
                        />
                        <Field
                          label={copy.interviews.nextAction}
                          value={operatorPilotLabel(
                            locale,
                            "nextActions",
                            record.nextAction,
                          )}
                        />
                        {record.subjectUserId ? (
                          <div>
                            <dt className="text-xs uppercase">
                              {copy.interviews.subjectUserId}
                            </dt>
                            <dd className="font-mono text-xs">
                              {record.subjectUserId}
                            </dd>
                          </div>
                        ) : null}
                        {record.pilotCohort ? (
                          <Field
                            label={copy.interviews.pilotCohort}
                            value={operatorPilotLabel(
                              locale,
                              "cohorts",
                              record.pilotCohort,
                            )}
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

function FounderInterviewHeader({
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
          {copy.interviews.title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy.interviews.description}
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
