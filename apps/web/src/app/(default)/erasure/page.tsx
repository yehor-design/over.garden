import type { Metadata } from "next";
import Link from "next/link";

import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import {
  ERASURE_REQUEST_INTAKE_VERSION,
  formatErasureRequestReference,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import {
  getLocalizedErasureStatusCopy,
  getTrustSurfaceCopy,
  interfaceLocaleDateTag,
} from "@/lib/trust-surface-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getLatestErasureRequestForUser } from "@/server/erasure-request-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../garden/garden-auth-panel";
import { submitErasureRequestAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(await getRequestInterfaceLocale()).erasure;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

export default async function ErasureRequestPage() {
  const [session, locale] = await Promise.all([
    getCurrentSession(),
    getRequestInterfaceLocale(),
  ]);
  const copy = getTrustSurfaceCopy(locale).erasure;
  const userId = session?.user?.id;
  const latestRequest = userId
    ? await getLatestErasureRequestForUser(
        scopedToUser(userId, getSessionId(session)),
      )
    : null;
  const latestStatus = latestRequest
    ? getLocalizedErasureStatusCopy(
        locale,
        latestRequest.status,
        latestRequest.handledStatus,
      )
    : null;
  const hasOpenRequest = latestStatus?.isOpen ?? false;

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8"
    >
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.intro}
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          {copy.statusPrefix} <strong>{copy.legalStatusLabel}</strong>.{" "}
          {copy.processDescription}
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          {copy.acknowledgementLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          {copy.contactBeforeEmail}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          {copy.contactAfterEmail}
        </p>
      </div>

      {userId ? (
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.requestTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {copy.intakeVersion} {ERASURE_REQUEST_INTAKE_VERSION}
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
                {copy.submitted} {formatDate(locale, latestRequest.submittedAt)}
                . {copy.reference}{" "}
                <span className="font-mono">
                  {formatErasureRequestReference(latestRequest.id)}
                </span>
              </p>
              {latestStatus.handled ? (
                <p className="text-muted-foreground">
                  {copy.outcome} {latestStatus.handled.label}.{" "}
                  {latestStatus.handled.description}
                </p>
              ) : null}
            </div>
          ) : null}

          {hasOpenRequest ? (
            <p className="text-sm text-muted-foreground">{copy.openRequest}</p>
          ) : (
            <OwnerScopedActionForm
              action={submitErasureRequestAction}
              className="grid gap-4"
            >
              <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <input
                  type="checkbox"
                  name="erasureAcknowledgementAccepted"
                  required
                  className="mt-1 size-4 rounded border-border"
                />
                <span>{copy.acknowledgement}</span>
              </label>
              <button
                type="submit"
                className={buttonVariants({ className: "self-start" })}
              >
                {copy.submit}
              </button>
            </OwnerScopedActionForm>
          )}
        </section>
      ) : (
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.signInTitle}
          </h2>
          <GardenAuthPanel locale={locale} />
        </section>
      )}
    </main>
  );
}

function formatDate(
  locale: Parameters<typeof interfaceLocaleDateTag>[0],
  value: Date | string,
) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(interfaceLocaleDateTag(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
