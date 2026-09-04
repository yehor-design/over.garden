import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";

import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
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
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {operatorCopy.common.accessDenied}
        </p>
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
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.requests}: {requests.length}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.gate}: {gateLabel}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {operatorCopy.common.role}: {roleLabel}
        </span>
      </div>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.empty}
        </p>
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
    <li className="grid gap-4 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-semibold text-foreground">{statusCopy.label}</h2>
        <time className="text-xs text-muted-foreground">
          {formatOperatorDate(locale, request.submittedAt)}
        </time>
      </div>
      <p className="text-sm text-muted-foreground">{statusCopy.description}</p>
      <dl className="grid gap-2 text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase">{copy.requestReference}</dt>
          <dd className="font-mono text-xs">
            {formatErasureRequestReference(request.id)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.requesterUserId}</dt>
          <dd className="font-mono text-xs">{request.requesterUserId}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.scope}</dt>
          <dd>{request.requestScope}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.intakeVersion}</dt>
          <dd>{request.intakeDisclosureVersion}</dd>
        </div>
        {request.dryRunReviewedAt ? (
          <div>
            <dt className="text-xs uppercase">{copy.dryRunReviewed}</dt>
            <dd>{formatOperatorDate(locale, request.dryRunReviewedAt)}</dd>
          </div>
        ) : null}
        {request.handledStatus ? (
          <div>
            <dt className="text-xs uppercase">{copy.handledStatus}</dt>
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
        <OwnerScopedActionForm action={markErasureRequestReviewingAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            {copy.startReview}
          </button>
        </OwnerScopedActionForm>
      ) : null}
      {canMutate &&
      (request.status === "submitted" || request.status === "reviewing") ? (
        <>
          {canExecuteErasure ? (
            <ApprovedErasureExecutionPanel request={request} copy={copy} />
          ) : (
            <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              {copy.executionRequiresOwner}
            </p>
          )}
          <NonDestructiveOutcomeForm
            request={request}
            locale={locale}
            copy={copy}
          />
        </>
      ) : null}
    </li>
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

  return (
    <section className="grid gap-3 border-t border-border pt-3">
      <div className="grid gap-1">
        <h3 className="text-base font-semibold text-foreground">
          {copy.executionTitle}
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.executionDescription}
        </p>
      </div>
      <OwnerScopedActionForm
        action={executeApprovedErasureRequestAction}
        className="grid gap-2 sm:max-w-xl"
      >
        <input type="hidden" name="requestId" value={request.id} />
        <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
          {copy.approvalPhrase}
          <input
            name="maintainerApprovalText"
            required
            disabled={!dryRunReviewed}
            placeholder={approvalText}
            className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <p className="font-mono text-xs text-muted-foreground">
          {approvalText}
        </p>
        <button
          type="submit"
          disabled={!dryRunReviewed}
          className={buttonVariants({
            variant: "destructive",
            className:
              "self-start disabled:pointer-events-none disabled:opacity-60",
          })}
        >
          {copy.execute}
        </button>
        {!dryRunReviewed ? (
          <p className="text-xs text-muted-foreground">
            {copy.reviewBeforeExecution}
          </p>
        ) : null}
      </OwnerScopedActionForm>
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
    <OwnerScopedActionForm
      action={markErasureRequestHandledAction}
      className="grid gap-2 border-t border-border pt-3 sm:max-w-md"
    >
      <input type="hidden" name="requestId" value={request.id} />
      <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
        {copy.operatorOutcome}
        <select
          name="handledStatus"
          required
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {nonDestructiveOutcomes.map((option) => (
            <option key={option.value} value={option.value}>
              {getLocalizedErasureStatusCopy(locale, "handled", option.value)
                .handled?.label ?? option.value}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className={buttonVariants({ className: "self-start" })}
      >
        {copy.markHandled}
      </button>
    </OwnerScopedActionForm>
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
    <section className="grid gap-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="grid gap-1">
        <h3 className="text-base font-semibold text-foreground">
          {copy.previewTitle}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.previewDescription}
        </p>
        <p className="text-xs text-muted-foreground">
          {getOperatorCopy(locale).common.generated}{" "}
          {formatOperatorDate(locale, preview.generatedAt)}
        </p>
      </div>

      <div className="grid gap-3">
        {preview.dataClasses.map((dataClass) => (
          <div
            key={dataClass.key}
            className="grid gap-2 rounded-md border border-border bg-background p-3"
          >
            <div className="grid gap-1">
              <h4 className="text-sm font-semibold text-foreground">
                {copy.dataClasses[dataClass.key].label}
              </h4>
              <p className="text-xs leading-5 text-muted-foreground">
                {copy.dataClasses[dataClass.key].description}
              </p>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              {Object.entries(dataClass.counts).map(([key, count]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <dt className="text-xs text-muted-foreground uppercase">
                    {operatorErasureCountLabel(locale, key)}
                  </dt>
                  <dd className="font-semibold text-foreground tabular-nums">
                    {count}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <ul className="grid gap-2 text-xs leading-5 text-muted-foreground">
        {copy.caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>

      {canMutate &&
      (request.status === "submitted" || request.status === "reviewing") ? (
        <OwnerScopedActionForm action={markErasureRequestDryRunReviewedAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            {request.dryRunReviewedAt
              ? copy.recordReviewAgain
              : copy.markReviewed}
          </button>
        </OwnerScopedActionForm>
      ) : null}
    </section>
  );
}
