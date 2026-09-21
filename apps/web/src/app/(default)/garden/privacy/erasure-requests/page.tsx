import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { Badge } from "@/components/ui/badge";
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
  type ErasureRequestReadModel,
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

export default async function ErasureRequestsOperatorPage() {
  const [locale, viewer] = await Promise.all([
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
        />
      </Suspense>
    </ErasureRequestsShell>
  );
}

/**
 * The request list and every request's dry-run preview. Owner-only, so a
 * `schema_missing` here names the relation and points at the migration
 * allocation: the owner is the person who can apply it.
 */
async function ErasureRequestsSection({
  locale,
  canMutate,
  canExecuteErasure,
  gateLabel,
  roleLabel,
}: {
  locale: InterfaceLocale;
  canMutate: boolean;
  canExecuteErasure: boolean;
  gateLabel: string;
  roleLabel: string;
}) {
  const operatorCopy = getOperatorCopy(locale);
  const copy = getOperatorErasureCopy(locale);

  const settled = await settleSection(
    async () => {
      const requests = await listOperatorErasureRequests();
      const previews = await Promise.all(
        requests.map(async (request) => ({
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

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Badge>
          {operatorCopy.common.requests}: {requests.length}
        </Badge>
        <Badge tone="info">
          {operatorCopy.common.gate}: {gateLabel}
        </Badge>
        <Badge tone="info">
          {operatorCopy.common.role}: {roleLabel}
        </Badge>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title={copy.empty}
        />
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

function ErasureRequestCard({
  request,
  dryRunPreview,
  canMutate,
  canExecuteErasure,
  locale,
  copy,
}: {
  request: ErasureRequestReadModel;
  dryRunPreview: Awaited<
    ReturnType<typeof getErasureDryRunPreviewForRequest>
  > | null;
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
  return (
    <Card as="li" className="grid gap-4 p-4 text-body-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-h4 text-text-heading">{statusCopy.label}</h2>
        <time className="text-caption text-text-muted">
          {formatOperatorDate(locale, request.submittedAt)}
        </time>
      </div>
      <p className="text-body-sm text-text-muted">{statusCopy.description}</p>
      <dl className="grid gap-2 text-text-muted sm:grid-cols-2">
        <div>
          <dt className="text-overline text-text-muted uppercase">
            {copy.requestReference}
          </dt>
          <dd className="font-mono text-mono">
            {formatErasureRequestReference(request.id)}
          </dd>
        </div>
        <div>
          <dt className="text-overline text-text-muted uppercase">
            {copy.requesterUserId}
          </dt>
          <dd className="font-mono text-mono">{request.requesterUserId}</dd>
        </div>
        <div>
          <dt className="text-overline text-text-muted uppercase">
            {copy.scope}
          </dt>
          <dd>{request.requestScope}</dd>
        </div>
        <div>
          <dt className="text-overline text-text-muted uppercase">
            {copy.intakeVersion}
          </dt>
          <dd>{request.intakeDisclosureVersion}</dd>
        </div>
        {request.dryRunReviewedAt ? (
          <div>
            <dt className="text-overline text-text-muted uppercase">
              {copy.dryRunReviewed}
            </dt>
            <dd>{formatOperatorDate(locale, request.dryRunReviewedAt)}</dd>
          </div>
        ) : null}
        {request.handledStatus ? (
          <div>
            <dt className="text-overline text-text-muted uppercase">
              {copy.handledStatus}
            </dt>
            <dd>{statusCopy.handled?.label ?? request.handledStatus}</dd>
          </div>
        ) : null}
      </dl>

      {dryRunPreview ? (
        <DryRunPreviewPanel
          preview={dryRunPreview}
          request={request}
          canMutate={canMutate}
          locale={locale}
          copy={copy}
        />
      ) : null}

      {canMutate && request.status === "submitted" ? (
        <OwnerScopedProgressiveForm action={markErasureRequestReviewingAction}>
          <HiddenField name="requestId" value={request.id} />
          <Button type="submit" variant="secondary" className="self-start">
            {copy.startReview}
          </Button>
        </OwnerScopedProgressiveForm>
      ) : null}
      {canMutate &&
      (request.status === "submitted" || request.status === "reviewing") ? (
        <>
          {canExecuteErasure ? (
            <ApprovedErasureExecutionPanel request={request} copy={copy} />
          ) : (
            <Callout tone="info">
              <p>{copy.executionRequiresOwner}</p>
            </Callout>
          )}
          <NonDestructiveOutcomeForm
            request={request}
            locale={locale}
            copy={copy}
          />
        </>
      ) : null}
    </Card>
  );
}

function ApprovedErasureExecutionPanel({
  request,
  copy,
}: {
  request: ErasureRequestReadModel;
  copy: OperatorErasureCopy;
}) {
  const approvalText = expectedErasureMaintainerApprovalText(request.id);
  const dryRunReviewed = Boolean(request.dryRunReviewedAt);
  const reference = formatErasureRequestReference(request.id);
  // The dialog's confirm lives in a portal, so it submits by id.
  const formId = `erasure-execute-${request.id}`;

  return (
    <section className="grid gap-3 border-t border-border pt-3">
      <div className="grid gap-1">
        <h3 className="text-h4 text-text-heading">{copy.executionTitle}</h3>
        <p className="max-w-prose text-body-sm leading-6 text-text-muted">
          {copy.executionDescription}
        </p>
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
          />
        </Field>
        {/* The one destructive control in the product, and the one place
            `danger` appears (DESIGN.md §4.4). It names the request it is about
            to erase before it does it, and it is still a real submit button
            before the bundle runs (`ConfirmSubmit`). */}
        <ConfirmSubmit
          className="self-start"
          formId={formId}
          disabled={!dryRunReviewed}
          label={copy.execute}
          title={`${copy.confirmTitle} ${reference}`}
          description={copy.confirmDescription}
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

function NonDestructiveOutcomeForm({
  request,
  locale,
  copy,
}: {
  request: ErasureRequestReadModel;
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
      <Button type="submit" className="self-start">
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
  preview: Awaited<ReturnType<typeof getErasureDryRunPreviewForRequest>>;
  request: ErasureRequestReadModel;
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

      <div className="grid gap-3">
        {preview.dataClasses.map((dataClass) => (
          <div
            key={dataClass.key}
            className="grid gap-2 rounded-md border border-border bg-surface p-3"
          >
            <div className="grid gap-1">
              <h4 className="text-h4 text-text-heading">
                {copy.dataClasses[dataClass.key].label}
              </h4>
              <p className="text-caption leading-5 text-text-muted">
                {copy.dataClasses[dataClass.key].description}
              </p>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              {Object.entries(dataClass.counts).map(([key, count]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <dt className="text-overline text-text-muted uppercase">
                    {operatorErasureCountLabel(locale, key)}
                  </dt>
                  <dd className="text-h4 text-text-heading tabular-nums">
                    {count}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <ul className="grid gap-2 text-caption leading-5 text-text-muted">
        {copy.caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>

      {canMutate &&
      (request.status === "submitted" || request.status === "reviewing") ? (
        <OwnerScopedProgressiveForm
          action={markErasureRequestDryRunReviewedAction}
        >
          <HiddenField name="requestId" value={request.id} />
          <Button type="submit" variant="secondary" className="self-start">
            {request.dryRunReviewedAt
              ? copy.recordReviewAgain
              : copy.markReviewed}
          </Button>
        </OwnerScopedProgressiveForm>
      ) : null}
    </section>
  );
}
