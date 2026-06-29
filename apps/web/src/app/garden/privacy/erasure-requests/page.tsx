import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  ERASURE_REQUEST_HANDLED_STATUS_OPTIONS,
  formatErasureRequestReference,
  getErasureRequestStatusCopy,
} from "@/lib/privacy/disclosures";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getErasureDryRunPreviewForRequest } from "@/server/erasure-dry-run-repository";
import { resolveErasureRequestOperatorAccess } from "@/server/erasure-request-access";
import {
  listOperatorErasureRequests,
  type ErasureRequestReadModel,
} from "@/server/erasure-request-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden-auth-panel";
import {
  markErasureRequestDryRunReviewedAction,
  markErasureRequestHandledAction,
  markErasureRequestReviewingAction,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Erasure requests | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ErasureRequestsOperatorPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const access = resolveErasureRequestOperatorAccess(scope);

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        <OperatorHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        <OperatorHeader />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Access denied.
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
      <OperatorHeader />

      <section className="grid gap-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            Requests: {requests.length}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            Gate: {access.mode}
          </span>
        </div>

        {requests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No erasure requests have been submitted.
          </p>
        ) : (
          <ol className="grid gap-3">
            {requests.map((request) => (
              <ErasureRequestCard
                key={request.id}
                request={request}
                dryRunPreview={dryRunByRequestId.get(request.id) ?? null}
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
}: {
  request: ErasureRequestReadModel;
  dryRunPreview: Awaited<
    ReturnType<typeof getErasureDryRunPreviewForRequest>
  > | null;
}) {
  return (
    <li className="grid gap-4 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-semibold text-foreground">{request.status}</h2>
        <time className="text-xs text-muted-foreground">
          {formatDate(request.submittedAt)}
        </time>
      </div>
      <p className="text-sm text-muted-foreground">
        {
          getErasureRequestStatusCopy(
            request.status,
            request.handledStatus,
          ).description
        }
      </p>
      <dl className="grid gap-2 text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase">Request reference</dt>
          <dd className="font-mono text-xs">
            {formatErasureRequestReference(request.id)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">
            Requester user id (operator only)
          </dt>
          <dd className="font-mono text-xs">{request.requesterUserId}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Scope</dt>
          <dd>{request.requestScope}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Intake version</dt>
          <dd>{request.intakeDisclosureVersion}</dd>
        </div>
        {request.dryRunReviewedAt ? (
          <div>
            <dt className="text-xs uppercase">Dry-run reviewed</dt>
            <dd>{formatDate(request.dryRunReviewedAt)}</dd>
          </div>
        ) : null}
        {request.handledStatus ? (
          <div>
            <dt className="text-xs uppercase">Handled status</dt>
            <dd>{request.handledStatus}</dd>
          </div>
        ) : null}
      </dl>

      {dryRunPreview ? (
        <DryRunPreviewPanel
          preview={dryRunPreview}
          request={request}
        />
      ) : null}

      {request.status === "submitted" ? (
        <form action={markErasureRequestReviewingAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Start review
          </button>
        </form>
      ) : null}
      {request.status === "submitted" || request.status === "reviewing" ? (
        <form
          action={markErasureRequestHandledAction}
          className="grid gap-2 border-t border-border pt-3 sm:max-w-md"
        >
          <input type="hidden" name="requestId" value={request.id} />
          <label className="grid gap-1 text-xs font-medium uppercase text-muted-foreground">
            Operator outcome
            <select
              name="handledStatus"
              required
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {ERASURE_REQUEST_HANDLED_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className={buttonVariants({ className: "self-start" })}
          >
            Mark handled
          </button>
        </form>
      ) : null}
    </li>
  );
}

function DryRunPreviewPanel({
  preview,
  request,
}: {
  preview: Awaited<ReturnType<typeof getErasureDryRunPreviewForRequest>>;
  request: ErasureRequestReadModel;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="grid gap-1">
        <h3 className="text-base font-semibold text-foreground">
          Non-destructive dry-run preview
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Affected data classes and counts only. This preview does not delete,
          anonymize, or expose raw journal text, media keys, emails, tokens, IP
          addresses, user agents, referrers, or precise location.
        </p>
        <p className="text-xs text-muted-foreground">
          Generated {formatDate(preview.generatedAt)}
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
                {dataClass.label}
              </h4>
              <p className="text-xs leading-5 text-muted-foreground">
                {dataClass.description}
              </p>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              {Object.entries(dataClass.counts).map(([key, count]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <dt className="text-xs text-muted-foreground uppercase">
                    {key.replaceAll("_", " ")}
                  </dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {count}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <ul className="grid gap-2 text-xs leading-5 text-muted-foreground">
        {preview.caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>

      {request.status === "submitted" || request.status === "reviewing" ? (
        <form action={markErasureRequestDryRunReviewedAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            {request.dryRunReviewedAt
              ? "Record dry-run review again"
              : "Mark dry-run reviewed"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function OperatorHeader() {
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
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Erasure requests
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Operator readback for non-destructive pilot erasure intake. Each
          request includes a repeatable dry-run preview of affected data
          classes before any maintainer-approved destructive workflow. This list
          intentionally excludes journal text, media keys, precise location,
          request headers, referrers, IP addresses, and user agents.
        </p>
      </div>
    </header>
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
