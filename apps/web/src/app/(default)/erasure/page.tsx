import type { Metadata } from "next";
import Link from "next/link";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { ActionOutcomeNotice } from "@/components/ui/action-outcome-notice";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Link as TextLink } from "@/components/ui/link";
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
  type TrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  getLatestErasureRequestForUser,
  type ErasureRequestReadModel,
} from "@/server/erasure-request-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { submitErasureRequestAction } from "./actions";
import { readErasureOutcome } from "./outcome";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(await getRequestInterfaceLocale()).erasure;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

/**
 * The gardener's erasure screen (`OVE-456`, `OVE-505`).
 *
 * What it says is a privacy promise, not interface text (ADR-0021,
 * `docs/MVP_PRIVACY_RETENTION_POLICY.md`). So the sentences are the ones the
 * copy module already carries, and `page.test.tsx` fails if the promise set
 * changes. What `OVE-505` changed is the order a reader meets them in:
 *
 * - **Where a request stands comes first**, for a reader who has one — with
 *   what happens next in words.
 * - **Three different things are told apart** before anything is asked:
 *   deleting one entry (no request needed), erasing the account and all that
 *   hangs from it (this request), and copies outside OverGarden (best effort).
 * - **What is deleted, what survives and how long an address answers** come
 *   before the form, not after it.
 * - **The form lands back here** and says what happened: received, with its
 *   reference read back, or not sent.
 * - The version tag and the copy's legal status close the page instead of
 *   opening it.
 */
export default async function ErasureRequestPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const [params, session, locale] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
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
  const outcome = userId ? readErasureOutcome(params.result) : null;

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
      />

      {outcome === "received" && latestRequest ? (
        <ActionOutcomeNotice
          outcome="received"
          about={`${latestRequest.id}:${latestRequest.status}`}
          tone="success"
          title={copy.receivedTitle}
        >
          <p>
            {copy.receivedBody.replace(
              "{reference}",
              formatErasureRequestReference(latestRequest.id),
            )}
          </p>
        </ActionOutcomeNotice>
      ) : outcome === "acknowledgement-required" ? (
        <ActionOutcomeNotice
          outcome="acknowledgement-required"
          about="not-sent"
          tone="warning"
          title={copy.notSentTitle}
        >
          <p>{copy.acknowledgementRequired}</p>
        </ActionOutcomeNotice>
      ) : null}

      {latestRequest && latestStatus ? (
        <RequestStatusCard
          request={latestRequest}
          status={latestStatus}
          copy={copy}
          locale={locale}
        />
      ) : null}

      <Section id="erasure-choices" title={copy.choicesTitle} className="gap-3">
        <ul className="grid list-none gap-3 sm:grid-cols-3">
          <li className="min-w-0">
            <Card className="grid h-full content-start gap-2 p-4">
              <h3 className="text-h4 text-text-heading">
                {copy.choiceEntryTitle}
              </h3>
              <p className="text-body-sm text-text-secondary">
                {copy.choiceEntryBody}
              </p>
              <TextLink href="/garden" className="w-fit text-body-sm">
                {copy.choiceEntryLink}
              </TextLink>
            </Card>
          </li>
          <li className="min-w-0">
            <Card className="grid h-full content-start gap-2 p-4">
              <h3 className="text-h4 text-text-heading">
                {copy.choiceAccountTitle}
              </h3>
              <p className="text-body-sm text-text-secondary">
                {copy.choiceAccountBody}
              </p>
            </Card>
          </li>
          <li className="min-w-0">
            <Card className="grid h-full content-start gap-2 p-4">
              <h3 className="text-h4 text-text-heading">
                {copy.choiceExternalTitle}
              </h3>
              <p className="text-body-sm text-text-secondary">
                {copy.choiceExternalBody}
              </p>
            </Card>
          </li>
        </ul>
      </Section>

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

      {userId ? (
        <Card id="erasure-request" className="grid gap-4 p-5">
          <h2 className="text-h3 text-text-heading">{copy.formTitle}</h2>
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
        <Card id="erasure-request" className="grid gap-4 p-5">
          <h2 className="text-h3 text-text-heading">{copy.signInTitle}</h2>
          <SignInPrompt locale={locale} next={"/erasure"} />
        </Card>
      )}

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

      <Section id="erasure-about" title={copy.aboutTitle} className="gap-2">
        <p className="text-body-sm text-text-secondary">
          {`${copy.statusPrefix} ${copy.legalStatusLabel}`}
        </p>
        <p className="text-caption text-text-muted">
          {`${copy.intakeVersion} ${ERASURE_REQUEST_INTAKE_VERSION}`}
        </p>
      </Section>
    </main>
  );
}

/**
 * Where the reader's latest request stands, in words: what it is now, when it
 * was sent, its reference, the outcome if there is one — and what happens
 * next, which is what a reader opening this page again came to find out.
 */
function RequestStatusCard({
  request,
  status,
  copy,
  locale,
}: {
  request: ErasureRequestReadModel;
  status: ReturnType<typeof getLocalizedErasureStatusCopy>;
  copy: TrustSurfaceCopy["erasure"];
  locale: InterfaceLocale;
}) {
  return (
    <Card
      as="section"
      aria-labelledby="erasure-status-heading"
      data-erasure-request-status={request.status}
      className="grid gap-3 p-5 text-body-sm"
    >
      <div className="grid gap-1">
        <p className="text-caption text-text-muted">{copy.requestTitle}</p>
        <h2 id="erasure-status-heading" className="text-h3 text-text-heading">
          {status.label}
        </h2>
        <p className="text-text-secondary">{status.description}</p>
      </div>
      {status.handled ? (
        <p className="text-text">
          {`${copy.outcome} `}
          <strong>{status.handled.label}</strong>
          {`. ${status.handled.description}`}
        </p>
      ) : null}
      <div className="grid gap-1 rounded-md bg-surface-sunken p-3">
        <p className="font-medium text-text-heading">{copy.nextTitle}</p>
        <p className="text-text-secondary">{nextStep(request, copy)}</p>
      </div>
      <p className="text-caption text-text-muted">
        {`${copy.submitted} ${formatDate(locale, request.submittedAt)}. ${copy.reference} `}
        <span className="font-mono text-mono">
          {formatErasureRequestReference(request.id)}
        </span>
      </p>
    </Card>
  );
}

function nextStep(
  request: ErasureRequestReadModel,
  copy: TrustSurfaceCopy["erasure"],
) {
  if (request.status === "submitted") return copy.next.submitted;
  if (request.status === "reviewing") return copy.next.reviewing;
  if (request.status === "canceled") return copy.next.canceled;
  if (request.handledStatus === "needs_identity_verification") {
    return copy.next.needsIdentityVerification;
  }
  return copy.next.handled;
}

function formatDate(locale: InterfaceLocale, value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(interfaceLocaleDateTag(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
