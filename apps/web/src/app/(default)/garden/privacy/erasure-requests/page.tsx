import type { Metadata } from "next";
import Link from "next/link";

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
import type { OperatorCopy } from "@/lib/operator-copy";
import {
  formatOperatorDate,
  getOperatorCopy,
  operatorAccessModeLabel,
  operatorRoleLabel,
} from "@/lib/operator-copy";
import { getLocalizedErasureStatusCopy } from "@/lib/trust-surface-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getErasureDryRunPreviewForRequest } from "@/server/erasure-dry-run-repository";
import { expectedErasureMaintainerApprovalText } from "@/server/erasure-execution";
import { hasAdminCapability } from "@/server/admin-access";
import { resolveErasureRequestOperatorAccess } from "@/server/erasure-request-access";
import {
  listOperatorErasureRequests,
  type ErasureRequestReadModel,
} from "@/server/erasure-request-repository";
import { scopedToUser } from "@/server/request-scope";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { GardenAuthPanel } from "../../garden-auth-panel";
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

export default async function ErasureRequestsOperatorPage() {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const operatorCopy = getOperatorCopy(locale);
  const copy = getOperatorErasureCopy(locale);
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const access = await resolveErasureRequestOperatorAccess(scope);

  if (access.status === "sign_in_required") {
    return (
      <main
        data-operator-surface="erasure-requests"
        data-operator-access-state="sign-in-required"
        className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
      >
        <OperatorHeader operatorCopy={operatorCopy} copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main
        data-operator-surface="erasure-requests"
        data-operator-access-state="denied"
        className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
      >
        <OperatorHeader operatorCopy={operatorCopy} copy={copy} />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {operatorCopy.common.accessDenied}
        </p>
      </main>
    );
  }

  const requests = await listOperatorErasureRequests();
  const dryRunPreviews = await Promise.all(
    requests.map(async (request) => ({
      requestId: request.id,
      preview: await getErasureDryRunPreviewForRequest({
        requestId: request.id,
        requesterUserId: request.requesterUserId,
      }),
    })),
  );
  const dryRunByRequestId = new Map(
    dryRunPreviews.map((entry) => [entry.requestId, entry.preview]),
  );
  const canMutate = hasAdminCapability(access, "operator:mutate");
  const canExecuteErasure = hasAdminCapability(access, "erasure:execute");

  return (
    <main
      data-operator-surface="erasure-requests"
      data-operator-access-state="allowed"
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <OperatorHeader operatorCopy={operatorCopy} copy={copy} />

      <section className="grid gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {operatorCopy.common.requests}: {requests.length}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {operatorCopy.common.gate}:{" "}
            {operatorAccessModeLabel(locale, access.mode)}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {operatorCopy.common.role}: {operatorRoleLabel(locale, access.role)}
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
    </main>
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

function OperatorHeader({
  operatorCopy,
  copy,
}: {
  operatorCopy: OperatorCopy;
  copy: OperatorErasureCopy;
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
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>
    </header>
  );
}
