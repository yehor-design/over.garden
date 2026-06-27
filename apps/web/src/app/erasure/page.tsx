import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES,
  ERASURE_REQUEST_INTAKE_VERSION,
  PILOT_LEGAL_COPY_STATUS,
} from "@/lib/privacy/disclosures";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getOpenErasureRequestForUser } from "@/server/erasure-request-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../garden/garden-auth-panel";
import { submitErasureRequestAction } from "./actions";

export const metadata: Metadata = {
  title: "Pilot erasure request intake | OverGarden",
  description:
    "Pilot placeholder for non-destructive OverGarden data erasure request intake.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ErasureRequestPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const openRequest = userId
    ? await getOpenErasureRequestForUser(
        scopedToUser(userId, getSessionId(session)),
      )
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Pilot erasure request intake
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          This page is a pilot placeholder, not final reviewed legal copy. It
          creates a non-destructive request for operator review.
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          Status: <strong>{PILOT_LEGAL_COPY_STATUS}</strong>. Reviewed legal
          wording, verified contact instructions, response timelines, and
          erasure scope must be approved before this becomes launch-ready.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          {ERASURE_REQUEST_ACKNOWLEDGEMENT_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
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

          {openRequest ? (
            <div className="grid gap-2 rounded-md border border-border p-3 text-sm">
              <p className="font-medium text-foreground">
                Request received for operator review.
              </p>
              <p className="text-muted-foreground">
                Status: {openRequest.status}. Submitted{" "}
                {formatDate(openRequest.submittedAt)}.
              </p>
              <p className="text-muted-foreground">
                Request id: <span className="font-mono">{openRequest.id}</span>
              </p>
            </div>
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
