import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES,
  ERASURE_REQUEST_INTAKE_VERSION,
  formatErasureRequestReference,
  getErasureRequestStatusCopy,
  MVP_LEGAL_COPY_STATUS_LABEL,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getLatestErasureRequestForUser } from "@/server/erasure-request-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../garden/garden-auth-panel";
import { submitErasureRequestAction } from "./actions";

export const metadata: Metadata = {
  title: "MVP erasure request | OverGarden",
  description:
    "OverGarden MVP account erasure and anonymization request status.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ErasureRequestPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const latestRequest = userId
    ? await getLatestErasureRequestForUser(
        scopedToUser(userId, getSessionId(session)),
      )
    : null;
  const latestStatus = latestRequest
    ? getErasureRequestStatusCopy(
        latestRequest.status,
        latestRequest.handledStatus,
      )
    : null;
  const hasOpenRequest = latestStatus?.isOpen ?? false;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          MVP erasure request
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Submit or review an operator request for account data erasure or
          anonymization. This form records the request and status path; it does
          not automatically delete anything.
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          Status: <strong>{MVP_LEGAL_COPY_STATUS_LABEL}</strong>. OverGarden
          archives public surfaces first, then a maintainer-approved operator
          can delete or anonymize current-schema account, garden, journal,
          media, analytics, catalog-provisional, and search-job references
          where OverGarden controls them. Search-engine, crawler, or AI copies
          outside OverGarden are removal best-effort only.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          {ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          For privacy or support questions, email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>

      {userId ? (
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Request status
            </h2>
            <p className="text-sm text-muted-foreground">
              Intake version: {ERASURE_REQUEST_INTAKE_VERSION}
            </p>
          </div>

          {latestRequest && latestStatus ? (
            <div className="grid gap-2 rounded-md border border-border p-3 text-sm">
              <p className="font-medium text-foreground">
                {latestStatus.label}
              </p>
              <p className="text-muted-foreground">
                {latestStatus.description}
              </p>
              <p className="text-muted-foreground">
                Submitted {formatDate(latestRequest.submittedAt)}. Reference:{" "}
                <span className="font-mono">
                  {formatErasureRequestReference(latestRequest.id)}
                </span>
              </p>
              {latestStatus.handled ? (
                <p className="text-muted-foreground">
                  Outcome: {latestStatus.handled.label}.{" "}
                  {latestStatus.handled.description}
                </p>
              ) : null}
            </div>
          ) : null}

          {hasOpenRequest ? (
            <p className="text-sm text-muted-foreground">
              You already have an open request. The operator must handle it
              before a new request can be submitted.
            </p>
          ) : (
            <form action={submitErasureRequestAction} className="grid gap-4">
              <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <input
                  type="checkbox"
                  name="erasureAcknowledgementAccepted"
                  required
                  className="mt-1 size-4 rounded border-border"
                />
                <span>
                  I understand this submits an operator-review request only and
                  does not automatically delete or anonymize data.
                </span>
              </label>
              <button
                type="submit"
                className={buttonVariants({ className: "self-start" })}
              >
                Submit erasure request
              </button>
            </form>
          )}
        </section>
      ) : (
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">
            Sign in to submit a request
          </h2>
          <GardenAuthPanel />
        </section>
      )}
    </main>
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
