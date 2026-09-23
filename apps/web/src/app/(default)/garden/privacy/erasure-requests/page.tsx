import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { ActionOutcomeNotice } from "@/components/ui/action-outcome-notice";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ERASURE_REQUEST_HANDLED_STATUS_OPTIONS,
  formatErasureRequestReference,
} from "@/lib/privacy/disclosures";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { OperatorErasureCopy } from "@/lib/operator-erasure-copy";
import {
  getOperatorErasureCopy,
  operatorErasureCountLabel,
} from "@/lib/operator-erasure-copy";
import {
  formatOperatorDate,
  getOperatorCopy,
  operatorAccessModeLabel,
  operatorRoleLabel,
} from "@/lib/operator-copy";
import { getLocalizedErasureStatusCopy } from "@/lib/trust-surface-copy";
import { getErasureDryRunPreviewForRequest } from "@/server/erasure-dry-run-repository";
import { expectedErasureMaintainerApprovalText } from "@/server/erasure-execution";
import {
  assertAdminCapabilityForScope,
  hasAdminCapability,
} from "@/server/admin-access";
import {
  listOperatorErasureRequests,
  type OperatorErasureRequestReadModel,
} from "@/server/erasure-request-repository";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { ErasureRequestsShell } from "./erasure-shell";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  executeApprovedErasureRequestAction,
  markErasureRequestDryRunReviewedAction,
  markErasureRequestHandledAction,
  markErasureRequestReviewingAction,
} from "./actions";
import { HiddenField } from "@/components/ui/hidden-field";
import { readOperatorErasureOutcome } from "./outcome";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorErasureCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export const ERASURE_REQUESTS_PATH = "/garden/privacy/erasure-requests";

export default async function ErasureRequestsOperatorPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const [params, locale, viewer] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const operatorCopy = getOperatorCopy(locale);

  if (viewer.status === "unavailable") {
    return (
      <ErasureRequestsShell locale={locale} accessState="unavailable">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          title={operatorCopy.common.accessDenied}
          retryHref={ERASURE_REQUESTS_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </ErasureRequestsShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <ErasureRequestsShell locale={locale} accessState="sign-in-required">
        <SignInPrompt
          locale={locale}
          next={"/garden/privacy/erasure-requests"}
        />
      </ErasureRequestsShell>
    );
  }

  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(viewer.scope, "operator:read"),
  );

  if (access.status === "unavailable") {
    return (
      <ErasureRequestsShell locale={locale} accessState="unavailable">
        <WorkspaceSectionError
          locale={locale}
          failure={access.failure}
          title={operatorCopy.common.accessDenied}
          retryHref={ERASURE_REQUESTS_PATH}
          technicalHint={workspaceSchemaMissingHint(locale, access.failure)}
        />
      </ErasureRequestsShell>
    );
  }

  if (access.status === "denied") {
    return (
      <ErasureRequestsShell locale={locale} accessState="denied">
        <Callout tone="warning" role="alert">
          <p>{operatorCopy.common.accessDenied}</p>
        </Callout>
      </ErasureRequestsShell>
    );
  }

  return (
    <ErasureRequestsShell locale={locale} accessState="allowed">
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}
      >
        <ErasureRequestsSection
          locale={locale}
          canMutate={hasAdminCapability(access.access, "operator:mutate")}
          canExecuteErasure={hasAdminCapability(
            access.access,
            "erasure:execute",
          )}
          gateLabel={operatorAccessModeLabel(locale, access.access.mode)}
          roleLabel={operatorRoleLabel(locale, access.access.role)}
          outcome={readOperatorErasureOutcome(params)}
        />
      </Suspense>
    </ErasureRequestsShell>
  );
}

/**
 * The request list, and a preview for each request still open (`OVE-505`).
 * Owner-only, so a `schema_missing` here names the relation and points at
 * the migration allocation: the owner is the person who can apply it.
 *
 * A request reads as a task: who it came from (their handle, the least that
 * identifies them), when, what state it is in in words, and the next step
 * the owner may take — with the ids, versions and data-class definitions a
 * disclosure away. A closed request gets no preview: there is nothing left
 * to decide from it.
 */
async function ErasureRequestsSection({
  locale,
  canMutate,
  canExecuteErasure,
  gateLabel,
  roleLabel,
  outcome,
}: {
  locale: InterfaceLocale;
  canMutate: boolean;
  canExecuteErasure: boolean;
  gateLabel: string;
  roleLabel: string;
  outcome: ReturnType<typeof readOperatorErasureOutcome>;
}) {
  const copy = getOperatorErasureCopy(locale);

  const settled = await settleSection(
    async () => {
      const requests = await listOperatorErasureRequests();
      const previews = await Promise.all(
        requests.filter(isOpenRequest).map(async (request) => ({
          requestId: request.id,
          preview: await getErasureDryRunPreviewForRequest({
            requestId: request.id,
            requesterUserId: request.requesterUserId,
          }),
        })),
      );
      return {
        requests,
        dryRunByRequestId: new Map(
          previews.map((entry) => [entry.requestId, entry.preview]),
        ),
      };
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(8),
      surface: "erasure-requests",
      section: "requests",
    },
  );

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.title}
        retryHref={ERASURE_REQUESTS_PATH}
        technicalHint={workspaceSchemaMissingHint(locale, settled)}
      />
    );
  }

  const { requests, dryRunByRequestId } = settled.value;
  const answered = outcome
    ? requests.find((request) => request.id === outcome.requestId)
    : null;

  return (
    <section className="grid gap-4">
      {outcome && answered ? (
        <OperatorOutcome
          result={outcome.result}
          request={answered}
          locale={locale}
          copy={copy}
        />
      ) : null}

      <div className="grid gap-1">
        <p className="text-body-sm font-medium text-text">
          {copy.count.replace("{count}", String(requests.length))}
        </p>
        <p className="text-caption text-text-muted">
          {copy.accessLine
            .replace("{gate}", gateLabel)
            .replace("{role}", roleLabel)}
        </p>
      </div>

      {requests.length === 0 ? (
        <EmptyState title={copy.empty} />
      ) : (
        <ol className="grid gap-3">
          {requests.map((request) => (
            <ErasureRequestCard
              key={request.id}
              request={request}
              dryRunPreview={dryRunByRequestId.get(request.id) ?? null}
              canMutate={canMutate}
              canExecuteErasure={canExecuteErasure}
              locale={locale}
              copy={copy}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

type DryRunPreview = Awaited<
  ReturnType<typeof getErasureDryRunPreviewForRequest>
>;

function isOpenRequest(request: OperatorErasureRequestReadModel) {
  return request.status === "submitted" || request.status === "reviewing";
}

function isCleanupPending(request: OperatorErasureRequestReadModel) {
  return (
    request.status === "handled" && request.handledStatus === "cleanup_pending"
  );
}

function requestStateLabel(
  request: OperatorErasureRequestReadModel,
  locale: InterfaceLocale,
) {
  const status = getLocalizedErasureStatusCopy(
    locale,
    request.status,
    request.handledStatus,
  );
  return status.handled
    ? `${status.label} · ${status.handled.label}`
    : status.label;
}

/** The step the owner may take now, in words, from the stored state. */
function operatorNextStep(
  request: OperatorErasureRequestReadModel,
  copy: OperatorErasureCopy,
) {
  if (request.status === "submitted") return copy.next.startReview;
  if (request.status === "reviewing") {
    return request.dryRunReviewedAt
      ? copy.next.decide
      : copy.next.reviewPreview;
  }
  if (isCleanupPending(request)) return copy.next.resumeCleanup;
  if (request.handledStatus === "needs_identity_verification") {
    return copy.next.waitingIdentity;
  }
  return copy.next.nothing;
}

/**
 * What the owner's last action did, read back: the request's state now, or
 * why nothing changed.
 */
function OperatorOutcome({
  result,
  request,
  locale,
  copy,
}: {
  result: "done" | "stale" | "approval";
  request: OperatorErasureRequestReadModel;
  locale: InterfaceLocale;
  copy: OperatorErasureCopy;
}) {
  const reference = formatErasureRequestReference(request.id);
  const state = requestStateLabel(request, locale);
  // The request as it stands now: a second action on it is a second outcome.
  const about = [
    request.id,
    request.status,
    request.handledStatus ?? "",
    request.dryRunReviewedAt ? String(request.dryRunReviewedAt) : "",
  ].join(":");
  if (result === "done") {
    return (
      <ActionOutcomeNotice
        outcome="done"
        about={about}
        tone="success"
        title={copy.outcome.savedTitle}
      >
        <p>
          {copy.outcome.savedBody
            .replace("{reference}", reference)
            .replace("{state}", state)}
        </p>
        <p>{operatorNextStep(request, copy)}</p>
      </ActionOutcomeNotice>
    );
  }
  if (result === "approval") {
    return (
      <ActionOutcomeNotice
        outcome="approval"
        about={about}
        tone="warning"
        title={copy.outcome.approvalTitle}
      >
        <p>{copy.outcome.approvalBody}</p>
      </ActionOutcomeNotice>
    );
  }
  return (
    <ActionOutcomeNotice
      outcome="stale"
      about={about}
      tone="warning"
      title={copy.outcome.staleTitle}
    >
      <p>
        {copy.outcome.staleBody
          .replace("{reference}", reference)
          .replace("{state}", state)}
      </p>
    </ActionOutcomeNotice>
  );
}

function ErasureRequestCard({
  request,
  dryRunPreview,
  canMutate,
  canExecuteErasure,
  locale,
  copy,
}: {
  request: OperatorErasureRequestReadModel;
  dryRunPreview: DryRunPreview | null;
  canMutate: boolean;
  canExecuteErasure: boolean;
  locale: InterfaceLocale;
  copy: OperatorErasureCopy;
}) {
  const statusCopy = getLocalizedErasureStatusCopy(
    locale,
    request.status,
    request.handledStatus,
  );
  const reference = formatErasureRequestReference(request.id);
  const erased =
    request.handledStatus === "completed" || isCleanupPending(request);
  const headingId = `erasure-request-${request.id}`;

  return (
    <Card
      as="li"
      aria-labelledby={headingId}
      data-erasure-request={request.id}
      data-erasure-request-state={request.handledStatus ?? request.status}
      className="grid min-w-0 gap-4 p-4 text-body-sm"
    >
      <div className="grid gap-1">
        <h2 id={headingId} className="text-h4 break-words text-text-heading">
          {requestStateLabel(request, locale)}
        </h2>
        <p className="text-text">
          {copy.requester}:{" "}
          {erased ? (
            <span className="text-text-muted">{copy.requesterErased}</span>
          ) : request.requesterHandle ? (
            <span className="font-medium break-all">
              @{request.requesterHandle}
            </span>
          ) : (
            <span className="text-text-muted">{copy.requesterNoHandle}</span>
          )}
        </p>
        <p className="text-caption text-text-muted">
          {copy.received}{" "}
          <time dateTime={new Date(request.submittedAt).toISOString()}>
            {formatOperatorDate(locale, request.submittedAt)}
          </time>{" "}
          · {copy.requestReference}{" "}
          <span className="font-mono text-mono">{reference}</span>
        </p>
      </div>

      <p className="text-text-secondary">
        {statusCopy.handled?.description ?? statusCopy.description}
      </p>

      <div className="grid gap-1 rounded-md bg-surface-sunken p-3">
        <p className="font-medium text-text-heading">{copy.nextTitle}</p>
        <p className="text-text-secondary">
          {canMutate || !isOpenRequest(request)
            ? operatorNextStep(request, copy)
            : copy.executionRequiresOwner}
        </p>
      </div>

      {canMutate && request.status === "submitted" ? (
        <OwnerScopedProgressiveForm action={markErasureRequestReviewingAction}>
          <HiddenField name="requestId" value={request.id} />
          <Button type="submit" className="self-start">
            {copy.startReview}
          </Button>
        </OwnerScopedProgressiveForm>
      ) : null}

      {dryRunPreview ? (
        <DryRunPreviewPanel
          preview={dryRunPreview}
          request={request}
          canMutate={canMutate}
          locale={locale}
          copy={copy}
        />
      ) : null}

      {canMutate && request.status === "reviewing" ? (
        canExecuteErasure ? (
          <ApprovedErasureExecutionPanel
            request={request}
            preview={dryRunPreview}
            copy={copy}
          />
        ) : (
          <Callout tone="info">
            <p>{copy.executionRequiresOwner}</p>
          </Callout>
        )
      ) : null}

      {canMutate && isCleanupPending(request) ? (
        canExecuteErasure ? (
          <ResumeCleanupPanel request={request} copy={copy} />
        ) : (
          <Callout tone="info">
            <p>{copy.executionRequiresOwner}</p>
          </Callout>
        )
      ) : null}

      {canMutate && isOpenRequest(request) ? (
        <NonDestructiveOutcomeForm
          request={request}
          locale={locale}
          copy={copy}
        />
      ) : null}

      <details className="text-caption text-text-muted">
        <summary className="w-fit cursor-pointer rounded-sm text-text-secondary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          {copy.technicalTitle}
        </summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <dt>{copy.requesterUserId}</dt>
            <dd className="font-mono break-all text-text">
              {request.requesterUserId}
            </dd>
          </div>
          <div className="min-w-0">
            <dt>{copy.scope}</dt>
            <dd className="text-text">{request.requestScope}</dd>
          </div>
          <div className="min-w-0">
            <dt>{copy.intakeVersion}</dt>
            <dd className="text-text">{request.intakeDisclosureVersion}</dd>
          </div>
          {request.dryRunReviewedAt ? (
            <div className="min-w-0">
              <dt>{copy.dryRunReviewed}</dt>
              <dd className="text-text">
                {formatOperatorDate(locale, request.dryRunReviewedAt)}
              </dd>
            </div>
          ) : null}
        </dl>
      </details>
    </Card>
  );
}

/** What erasing actually covers, from the preview's own counts. */
function scopeFromPreview(
  preview: DryRunPreview | null,
  copy: OperatorErasureCopy,
) {
  if (!preview) return null;
  const count = (key: string, name: string) => {
    const value = preview.dataClasses.find((dataClass) => dataClass.key === key)
      ?.counts[name as keyof (typeof preview.dataClasses)[number]["counts"]];
    return typeof value === "number" ? value : 0;
  };
  return copy.scopeLine
    .replace("{spaces}", String(count("garden_workspace", "spaces")))
    .replace("{objects}", String(count("garden_workspace", "plant_objects")))
    .replace("{entries}", String(count("journal_entries", "total")))
    .replace("{photos}", String(count("media_assets", "total")));
}

function ApprovedErasureExecutionPanel({
  request,
  preview,
  copy,
}: {
  request: OperatorErasureRequestReadModel;
  preview: DryRunPreview | null;
  copy: OperatorErasureCopy;
}) {
  const approvalText = expectedErasureMaintainerApprovalText(request.id);
  const dryRunReviewed = Boolean(request.dryRunReviewedAt);
  const reference = formatErasureRequestReference(request.id);
  // The dialog's confirm lives in a portal, so it submits by id.
  const formId = `erasure-execute-${request.id}`;
  const scope = scopeFromPreview(preview, copy);

  return (
    <section className="grid gap-3 border-t border-border pt-3">
      <div className="grid gap-1">
        <h3 className="text-h4 text-text-heading">{copy.executionTitle}</h3>
        <p className="max-w-prose text-body-sm leading-6 text-text-muted">
          {copy.executionDescription}
        </p>
        {/* The scope is said here too: before the bundle runs there is no
            dialog, and the button posts straight away. */}
        {scope ? (
          <p
            data-erasure-scope="true"
            className="max-w-prose text-body-sm leading-6 font-medium text-text"
          >
            {copy.confirmDescription.replace("{scope}", scope)}
          </p>
        ) : null}
      </div>
      <OwnerScopedProgressiveForm
        id={formId}
        action={executeApprovedErasureRequestAction}
        className="grid gap-2 sm:max-w-xl"
      >
        <HiddenField name="requestId" value={request.id} />
        <Field label={copy.approvalPhrase} description={approvalText} required>
          <Input
            name="maintainerApprovalText"
            disabled={!dryRunReviewed}
            placeholder={approvalText}
            className="font-mono"
            autoComplete="off"
          />
        </Field>
        {/* The one destructive control in the product, and the one place
            `danger` appears (DESIGN.md §4.4). It names the request and what
            erasing it covers before it does it (`OVE-505`, criterion 9), and
            it is still a real submit button before the bundle runs
            (`ConfirmSubmit`). */}
        <ConfirmSubmit
          className="self-start"
          formId={formId}
          disabled={!dryRunReviewed}
          label={copy.execute}
          title={`${copy.confirmTitle} ${reference}`}
          description={copy.confirmDescription.replace(
            "{scope}",
            scope ?? reference,
          )}
          confirmLabel={copy.confirmAction}
          cancelLabel={copy.confirmCancel}
        />
        {!dryRunReviewed ? (
          <p className="text-caption text-text-muted">
            {copy.reviewBeforeExecution}
          </p>
        ) : null}
      </OwnerScopedProgressiveForm>
    </section>
  );
}

/**
 * A request whose data is erased and whose cleanup is not yet proved
 * (`cleanup_pending`). The same idempotent execution resumes the cleanup and
 * marks the request completed only once it is verified; it never erases
 * twice and never claims what it has not proved (`OVE-505`, criterion 10).
 * It was not offered at all: a stalled cleanup had no way to go on.
 */
function ResumeCleanupPanel({
  request,
  copy,
}: {
  request: OperatorErasureRequestReadModel;
  copy: OperatorErasureCopy;
}) {
  const approvalText = expectedErasureMaintainerApprovalText(request.id);

  return (
    <section className="grid gap-3 border-t border-border pt-3">
      <div className="grid gap-1">
        <h3 className="text-h4 text-text-heading">{copy.retryCleanup}</h3>
        <p className="max-w-prose text-body-sm leading-6 text-text-muted">
          {copy.retryCleanupDescription}
        </p>
      </div>
      <OwnerScopedProgressiveForm
        action={executeApprovedErasureRequestAction}
        className="grid gap-2 sm:max-w-xl"
      >
        <HiddenField name="requestId" value={request.id} />
        <Field label={copy.approvalPhrase} description={approvalText} required>
          <Input
            name="maintainerApprovalText"
            placeholder={approvalText}
            className="font-mono"
            autoComplete="off"
          />
        </Field>
        <Button type="submit" variant="secondary" className="self-start">
          {copy.retryCleanup}
        </Button>
      </OwnerScopedProgressiveForm>
    </section>
  );
}

function NonDestructiveOutcomeForm({
  request,
  locale,
  copy,
}: {
  request: OperatorErasureRequestReadModel;
  locale: InterfaceLocale;
  copy: OperatorErasureCopy;
}) {
  const nonDestructiveOutcomes = ERASURE_REQUEST_HANDLED_STATUS_OPTIONS.filter(
    (option) =>
      option.value !== "completed" && option.value !== "cleanup_pending",
  );

  return (
    <OwnerScopedProgressiveForm
      action={markErasureRequestHandledAction}
      className="grid gap-2 border-t border-border pt-3 sm:max-w-md"
    >
      <HiddenField name="requestId" value={request.id} />
      <Field label={copy.operatorOutcome} required>
        <Select name="handledStatus">
          {nonDestructiveOutcomes.map((option) => (
            <option key={option.value} value={option.value}>
              {getLocalizedErasureStatusCopy(locale, "handled", option.value)
                .handled?.label ?? option.value}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="secondary" className="self-start">
        {copy.markHandled}
      </Button>
    </OwnerScopedProgressiveForm>
  );
}

function DryRunPreviewPanel({
  preview,
  request,
  canMutate,
  locale,
  copy,
}: {
  preview: DryRunPreview;
  request: OperatorErasureRequestReadModel;
  canMutate: boolean;
  locale: InterfaceLocale;
  copy: OperatorErasureCopy;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-warning-border bg-warning-surface p-4">
      <div className="grid gap-1">
        <h3 className="text-h4 text-text-heading">{copy.previewTitle}</h3>
        <p className="text-body-sm leading-6 text-text-muted">
          {copy.previewDescription}
        </p>
        <p className="text-caption text-text-muted">
          {getOperatorCopy(locale).common.generated}{" "}
          {formatOperatorDate(locale, preview.generatedAt)}
        </p>
      </div>

      <ul className="grid gap-2">
        {preview.dataClasses.map((dataClass) => (
          <li
            key={dataClass.key}
            className="grid gap-2 rounded-md border border-border bg-surface p-3"
          >
            <h4 className="text-body-sm font-medium text-text-heading">
              {copy.dataClasses[dataClass.key].label}
            </h4>
            <dl className="grid gap-1">
              {Object.entries(dataClass.counts).map(([key, count]) => (
                <div
                  key={key}
                  className="flex min-w-0 items-baseline justify-between gap-3"
                >
                  <dt className="min-w-0 text-caption break-words text-text-muted">
                    {operatorErasureCountLabel(locale, key)}
                  </dt>
                  <dd className="text-body-sm font-medium text-text-heading tabular-nums">
                    {count}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <details className="text-caption text-text-muted">
        <summary className="w-fit cursor-pointer rounded-sm text-text-secondary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          {copy.technicalTitle}
        </summary>
        <ul className="mt-2 grid gap-2">
          {preview.dataClasses.map((dataClass) => (
            <li key={dataClass.key}>
              <strong className="text-text">
                {copy.dataClasses[dataClass.key].label}
              </strong>
              : {copy.dataClasses[dataClass.key].description}
            </li>
          ))}
          {copy.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </details>

      {canMutate && isOpenRequest(request) ? (
        <OwnerScopedProgressiveForm
          action={markErasureRequestDryRunReviewedAction}
        >
          <HiddenField name="requestId" value={request.id} />
          <Button
            type="submit"
            variant={request.dryRunReviewedAt ? "secondary" : "primary"}
            className="self-start"
          >
            {request.dryRunReviewedAt
              ? copy.recordReviewAgain
              : copy.markReviewed}
          </Button>
        </OwnerScopedProgressiveForm>
      ) : null}
    </section>
  );
}
