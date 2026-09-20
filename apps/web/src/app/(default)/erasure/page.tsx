import type { Metadata } from "next";
import Link from "next/link";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { submitErasureRequestAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(await getRequestInterfaceLocale()).erasure;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

/**
 * The gardener's erasure screen (`OVE-456`).
 *
 * What it says is a privacy promise, not interface text (ADR-0021,
 * `docs/MVP_PRIVACY_RETENTION_POLICY.md`). So the sentences are the ones the
 * copy module already carries, in the order it carries them, and
 * `src/lib/trust-surface-copy.erasure.test.ts` fails if that set changes.
 * What this task changed is where they sit: three named sections — what is
 * deleted, what survives, and how long the address keeps answering — instead of
 * one unbroken list of eight lines a reader was asked to hold in their head.
 */
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
      data-erasure-surface="request"
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10 sm:px-8"
    >
      <PageHeader
        breadcrumb={
          <Link
            href="/"
            className="text-link hover:text-link-hover w-fit rounded-sm text-body-sm underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            OverGarden
          </Link>
        }
        title={copy.title}
        description={copy.intro}
        actions={
          <Badge tone="warning">
            {copy.statusPrefix} {copy.legalStatusLabel}
          </Badge>
        }
      />

      <Section
        id="erasure-what-is-deleted"
        title={copy.whatIsDeletedTitle}
        className="gap-3"
      >
        <p className="max-w-prose text-body-sm leading-6 text-text-secondary">
          {copy.processDescription}
        </p>
      </Section>

      <Section
        id="erasure-what-survives"
        title={copy.whatSurvivesTitle}
        className="gap-3"
      >
        <p className="max-w-prose text-body-sm leading-6 text-text-secondary">
          {copy.whatSurvivesBody}
        </p>
      </Section>

      <Section
        id="erasure-address-window"
        title={copy.addressWindowTitle}
        className="gap-3"
      >
        <p className="max-w-prose text-body-sm leading-6 text-text-secondary">
          {copy.addressWindowBody}
        </p>
      </Section>

      <Section
        id="erasure-process"
        title={copy.processTitle}
        className="gap-3"
        description={
          <>
            {copy.contactBeforeEmail}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-link hover:text-link-hover font-medium underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>
            {copy.contactAfterEmail}
          </>
        }
      >
        <ul className="grid list-disc gap-2 pl-5 text-body-sm leading-6 text-text-secondary">
          {copy.acknowledgementLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      {userId ? (
        <Card className="grid gap-4 p-5">
          <div className="grid gap-1">
            <h2 className="text-h3 text-text-heading">{copy.requestTitle}</h2>
            <p className="text-body-sm text-text-muted">
              {copy.intakeVersion} {ERASURE_REQUEST_INTAKE_VERSION}
            </p>
          </div>

          {latestRequest && latestStatus ? (
            <div className="grid gap-2 rounded-md border border-border p-3 text-body-sm">
              <p className="font-medium text-text-heading">
                {latestStatus.label}
              </p>
              <p className="text-text-muted">{latestStatus.description}</p>
              <p className="text-text-muted">
                {copy.submitted} {formatDate(locale, latestRequest.submittedAt)}
                . {copy.reference}{" "}
                <span className="font-mono text-mono">
                  {formatErasureRequestReference(latestRequest.id)}
                </span>
              </p>
              {latestStatus.handled ? (
                <p className="text-text-muted">
                  {copy.outcome} {latestStatus.handled.label}.{" "}
                  {latestStatus.handled.description}
                </p>
              ) : null}
            </div>
          ) : null}

          {hasOpenRequest ? (
            <Callout tone="info">
              <p>{copy.openRequest}</p>
            </Callout>
          ) : (
            <OwnerScopedProgressiveForm
              action={submitErasureRequestAction}
              className="grid gap-4"
            >
              <Checkbox
                name="erasureAcknowledgementAccepted"
                required
                label={copy.acknowledgement}
              />
              <Button type="submit" className="self-start">
                {copy.submit}
              </Button>
            </OwnerScopedProgressiveForm>
          )}
        </Card>
      ) : (
        <Card className="grid gap-4 p-5">
          <h2 className="text-h3 text-text-heading">{copy.signInTitle}</h2>
          <SignInPrompt locale={locale} next={"/erasure"} />
        </Card>
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
