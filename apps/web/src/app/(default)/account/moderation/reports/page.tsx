import type { Metadata } from "next";
import Link from "next/link";

import { decideContentReportAction } from "@/app/(default)/account/moderation/reports/actions";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { FlagIcon as Flag } from "@/components/icons/Flag";
import {
  ModerationAreas,
  ModerationFrame,
} from "@/components/moderation/moderation-frame";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { HiddenField } from "@/components/ui/hidden-field";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  OWNER_REPORTS_PATH,
  REPORT_DECISION_GROUNDS,
  REPORT_FACTS_MAX,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/moderation/report-contract";
import { getReportCopy, type ReportCopy } from "@/lib/moderation/report-copy";
import { getModerationCopy } from "@/lib/moderation-copy";
import { formatOperatorDate } from "@/lib/operator-copy";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  listContentReportsForOwner,
  type OwnerReportRow,
} from "@/server/moderation/content-reports";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getReportCopy(await getRequestInterfaceLocale());
  return {
    title: copy.owner.title,
    robots: { index: false, follow: false },
  };
}

type Outcome = keyof ReportCopy["owner"]["outcome"];
const OUTCOMES = new Set<Outcome>([
  "done",
  "stale",
  "failed",
  "denied",
  "invalid",
]);

/**
 * The reports (ADR-0038 D5, `OVE-526`): every open one with what was
 * reported, why, by whom and how to answer them, and the decision beside it —
 * keep, or take down with the ground and the facts that go into the letters.
 * Then the last fifty decided, as the record. Owner-only, as comment
 * moderation is.
 */
export default async function ContentReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const [query, locale, viewer] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const copy = getReportCopy(locale);
  const moderation = getModerationCopy(locale);
  const frame = {
    locale,
    surface: "content-reports" as const,
    title: copy.owner.title,
    description: copy.owner.description,
    tabs: <ModerationAreas locale={locale} current="reports" />,
  };

  if (viewer.status === "unavailable") {
    return (
      <ModerationFrame {...frame} accessState="unavailable">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          title={copy.owner.title}
          retryHref={OWNER_REPORTS_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </ModerationFrame>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <ModerationFrame {...frame} accessState="sign-in-required" tabs={null}>
        <SignInPrompt locale={locale} next={OWNER_REPORTS_PATH} />
      </ModerationFrame>
    );
  }
  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(viewer.scope, "operator:mutate"),
  );
  if (access.status === "unavailable") {
    return (
      <ModerationFrame {...frame} accessState="unavailable">
        <WorkspaceSectionError
          locale={locale}
          failure={access.failure}
          title={copy.owner.title}
          retryHref={OWNER_REPORTS_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, access.failure)}
        />
      </ModerationFrame>
    );
  }
  if (access.status === "denied") {
    return (
      <ModerationFrame {...frame} accessState="denied" tabs={null}>
        <Callout tone="warning" role="alert">
          <p>{copy.owner.outcome.denied}</p>
        </Callout>
      </ModerationFrame>
    );
  }

  const settled = await settleSection(() => listContentReportsForOwner(), {
    deadlineMs: workspaceSectionDeadlineMs(6),
    surface: "content-reports",
    section: "reports",
  });
  if (settled.status === "error") {
    return (
      <ModerationFrame {...frame} accessState="allowed">
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          title={moderation.unavailable}
          retryHref={OWNER_REPORTS_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </ModerationFrame>
    );
  }
  const { received, decided } = settled.value;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const result = first(query.result) as Outcome | undefined;
  const outcome = result && OUTCOMES.has(result) ? result : null;
  const outcomeReport = first(query.report) ?? null;

  return (
    <ModerationFrame {...frame} accessState="allowed">
      <section
        id="content-reports"
        aria-labelledby="content-reports-open"
        data-private-moderation-queue="true"
        className="grid gap-4"
      >
        {outcome ? (
          <Callout
            tone={
              outcome === "done"
                ? "success"
                : outcome === "stale"
                  ? "info"
                  : "danger"
            }
            live="polite"
            data-report-outcome={outcome}
            data-report-outcome-for={outcomeReport ?? undefined}
          >
            {copy.owner.outcome[outcome]}
          </Callout>
        ) : null}
        <h2 id="content-reports-open" className="text-h3 text-text-heading">
          {`${copy.owner.receivedHeading} · ${received.length}`}
        </h2>
        {received.length === 0 ? (
          <EmptyState title={copy.owner.empty} />
        ) : (
          <ul className="grid list-none gap-3">
            {received.map((report) => (
              <OpenReport
                key={report.id}
                locale={locale}
                copy={copy}
                report={report}
              />
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 ? (
        <section
          aria-labelledby="content-reports-decided"
          className="grid gap-3"
        >
          <h2
            id="content-reports-decided"
            className="text-h3 text-text-heading"
          >
            {copy.owner.decidedHeading}
          </h2>
          <ul className="grid list-none gap-3">
            {decided.map((report) => (
              <DecidedReport
                key={report.id}
                locale={locale}
                copy={copy}
                report={report}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </ModerationFrame>
  );
}

function ReportFacts({
  locale,
  copy,
  report,
  headingId,
}: {
  locale: InterfaceLocale;
  copy: ReportCopy;
  report: OwnerReportRow;
  headingId: string;
}) {
  const reason = (REPORT_REASONS as readonly string[]).includes(report.reason)
    ? copy.form.reasons[report.reason as ReportReason]
    : report.reason;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning" data-report-reason={report.reason}>
          <Flag aria-hidden="true" />
          {reason}
        </Badge>
        <Badge tone="neutral" data-report-kind={report.kind}>
          {copy.owner.kinds[report.kind]}
        </Badge>
        <span className="text-caption text-text-muted">
          {`${copy.owner.reported} `}
          <time dateTime={report.createdAt.toISOString()}>
            {formatOperatorDate(locale, report.createdAt, {
              dateStyle: "medium",
            })}
          </time>
        </span>
      </div>
      <h3 id={headingId} className="text-h4 break-all text-text-heading">
        <Link
          href={report.address}
          className="underline underline-offset-4"
          prefetch={false}
        >
          {report.address}
        </Link>
      </h3>
      <blockquote className="border-l-2 border-border pl-3 break-words whitespace-pre-line text-text-secondary">
        {report.explanation}
      </blockquote>
      <p className="text-caption break-all text-text-muted">
        {`${copy.owner.reporter}: ${report.reporterName} · ${report.reporterEmail}`}
      </p>
    </>
  );
}

function OpenReport({
  locale,
  copy,
  report,
}: {
  locale: InterfaceLocale;
  copy: ReportCopy;
  report: OwnerReportRow;
}) {
  const headingId = `report-${report.id}-title`;
  return (
    <Card
      as="li"
      id={`report-${report.id}`}
      aria-labelledby={headingId}
      data-content-report={report.id}
      data-content-report-state={report.state}
      className="grid min-w-0 scroll-mt-20 gap-3 p-4 text-body-sm"
    >
      <ReportFacts
        locale={locale}
        copy={copy}
        report={report}
        headingId={headingId}
      />
      <OwnerScopedProgressiveForm
        action={decideContentReportAction}
        data-content-report-decision={report.id}
        className="grid gap-4 border-t border-border pt-3"
      >
        <HiddenField name="reportId" value={report.id} />
        <RadioGroup legend={copy.owner.decisionLabel}>
          <Radio
            name="decision"
            value="kept"
            required
            label={copy.owner.keep}
          />
          <Radio
            name="decision"
            value="removed"
            required
            label={copy.owner.remove[report.kind]}
          />
        </RadioGroup>
        <Field label={copy.owner.ground}>
          <Select name="ground" defaultValue="terms-content">
            {REPORT_DECISION_GROUNDS.map((ground) => (
              <option key={ground} value={ground}>
                {copy.owner.grounds[ground]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={copy.owner.facts}
          description={copy.owner.factsHint}
          required
        >
          <Textarea
            name="facts"
            required
            maxLength={REPORT_FACTS_MAX}
            rows={3}
          />
        </Field>
        <SubmitButton
          className="justify-self-start"
          data-content-report-decide={report.id}
          pendingLabel={getModerationCopy(locale).pending}
        >
          {copy.owner.decide}
        </SubmitButton>
      </OwnerScopedProgressiveForm>
    </Card>
  );
}

function DecidedReport({
  locale,
  copy,
  report,
}: {
  locale: InterfaceLocale;
  copy: ReportCopy;
  report: OwnerReportRow;
}) {
  const headingId = `report-${report.id}-title`;
  const decision = report.state === "removed" ? "removed" : "kept";
  const ground = (REPORT_DECISION_GROUNDS as readonly string[]).includes(
    report.decisionGround ?? "",
  )
    ? copy.owner.grounds[
        report.decisionGround as (typeof REPORT_DECISION_GROUNDS)[number]
      ]
    : null;
  return (
    <Card
      as="li"
      id={`report-${report.id}`}
      aria-labelledby={headingId}
      data-content-report={report.id}
      data-content-report-state={report.state}
      className="grid min-w-0 scroll-mt-20 gap-3 p-4 text-body-sm"
    >
      <ReportFacts
        locale={locale}
        copy={copy}
        report={report}
        headingId={headingId}
      />
      <p className="border-t border-border pt-3 text-text">
        <Badge tone={decision === "removed" ? "danger" : "neutral"}>
          {copy.owner.decided[decision]}
        </Badge>
        {report.decidedAt ? (
          <time
            className="ml-2 text-caption text-text-muted"
            dateTime={report.decidedAt.toISOString()}
          >
            {formatOperatorDate(locale, report.decidedAt, {
              dateStyle: "medium",
            })}
          </time>
        ) : null}
      </p>
      {ground ? <p className="text-caption text-text-muted">{ground}</p> : null}
      {report.decisionFacts ? (
        <p className="break-words whitespace-pre-line text-text-secondary">
          {report.decisionFacts}
        </p>
      ) : null}
    </Card>
  );
}
