import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { HiddenField } from "@/components/ui/hidden-field";
import { Link } from "@/components/ui/link";
import { gardenObjectSectionPath } from "@/lib/garden/object-pages";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  formatOwnerLineageTemplate,
  getOwnerLineageCopy,
  type OwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  getLineageClaimRecord,
  listLineageClaimInbox,
  type LineageClaimInboxItem,
} from "@/server/lineage-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { LineageShell, LINEAGE_CLAIMS_PATH } from "../lineage-shell";
import { LineageGardener, lineageObjectMeta } from "../lineage-parts";
import { ActionOutcomeNotice } from "@/components/ui/action-outcome-notice";
import {
  confirmLineageClaimAction,
  declineLineageClaimAction,
} from "./actions";
import { readLineageClaimOutcome } from "./outcome";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOwnerLineageCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadata.claimsTitle,
    robots: { index: false, follow: false },
  };
}

export default async function LineageClaimInboxPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const [params, viewer, locale] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);

  if (viewer.status === "unavailable") {
    return (
      <LineageShell locale={locale} section="claims">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={LINEAGE_CLAIMS_PATH}
        />
      </LineageShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <LineageShell locale={locale} section="claims">
        <SignInPrompt locale={locale} next={LINEAGE_CLAIMS_PATH} />
      </LineageShell>
    );
  }

  return (
    <LineageShell locale={locale} section="claims">
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}
      >
        <LineageClaimsSection
          locale={locale}
          scope={viewer.scope}
          outcome={readLineageClaimOutcome(params)}
        />
      </Suspense>
    </LineageShell>
  );
}

async function LineageClaimsSection({
  locale,
  scope,
  outcome,
}: {
  locale: InterfaceLocale;
  scope: RequestScope;
  outcome: ReturnType<typeof readLineageClaimOutcome>;
}) {
  const copy = getOwnerLineageCopy(locale);
  const [claims, answered] = await Promise.all([
    settleSection(() => listLineageClaimInbox(scope), {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "lineage-claims",
      section: "inbox",
    }),
    outcome
      ? settleSection(() => getLineageClaimRecord(scope, outcome.edgeId), {
          deadlineMs: workspaceSectionDeadlineMs(1),
          surface: "lineage-claims",
          section: "outcome",
        })
      : null,
  ]);

  return (
    <>
      {outcome && answered?.status === "ready" ? (
        <ClaimOutcome
          copy={copy}
          result={outcome.result}
          claim={answered.value}
        />
      ) : null}

      {claims.status === "error" ? (
        <WorkspaceSectionError
          locale={locale}
          failure={claims}
          title={copy.claims.title}
          retryHref={LINEAGE_CLAIMS_PATH}
        />
      ) : claims.value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted">
          {copy.claims.empty}
        </p>
      ) : (
        <section
          aria-labelledby="lineage-claims-waiting"
          className="grid gap-4"
        >
          <h2
            id="lineage-claims-waiting"
            className="text-body-sm font-medium text-text-muted"
          >
            {formatOwnerLineageTemplate(copy.claims.waiting, {
              count: claims.value.length,
            })}
          </h2>
          <ol className="grid gap-4">
            {claims.value.map((claim) => (
              <LineageClaimCard
                key={claim.id}
                claim={claim}
                copy={copy}
                locale={locale}
              />
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

/**
 * The answer as stored, not as pressed. `done` with the claim read back
 * confirmed or declined says so with both names; `stale` says nothing was
 * written and why — answered before, or gone.
 */
function ClaimOutcome({
  copy,
  result,
  claim,
}: {
  copy: OwnerLineageCopy;
  result: "done" | "stale";
  claim: LineageClaimInboxItem | null;
}) {
  // The claim as it stands now: an answer to a second claim is a second
  // outcome, and takes focus again.
  const about = claim ? `${claim.id}:${claim.consentState}` : "gone";
  const names = claim
    ? {
        subject: claim.subjectObject.displayName,
        source: claim.sourceObject.displayName,
      }
    : null;

  if (result === "done" && claim && names) {
    if (claim.consentState === "confirmed") {
      return (
        <ActionOutcomeNotice
          outcome="confirmed"
          about={about}
          tone="success"
          title={copy.claims.outcome.confirmedTitle}
        >
          {formatOwnerLineageTemplate(copy.claims.outcome.confirmedBody, names)}
        </ActionOutcomeNotice>
      );
    }
    if (claim.consentState === "declined") {
      return (
        <ActionOutcomeNotice
          outcome="declined"
          about={about}
          tone="success"
          title={copy.claims.outcome.declinedTitle}
        >
          {formatOwnerLineageTemplate(copy.claims.outcome.declinedBody, names)}
        </ActionOutcomeNotice>
      );
    }
  }

  if (result === "done") return null;

  return (
    <ActionOutcomeNotice
      outcome="stale"
      about={about}
      tone="warning"
      title={copy.claims.outcome.staleTitle}
    >
      {claim?.consentState === "confirmed"
        ? copy.claims.outcome.staleConfirmed
        : claim?.consentState === "declined"
          ? copy.claims.outcome.staleDeclined
          : copy.claims.outcome.staleGone}
    </ActionOutcomeNotice>
  );
}

function LineageClaimCard({
  claim,
  copy,
  locale,
}: {
  claim: LineageClaimInboxItem;
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
}) {
  const names = {
    subject: claim.subjectObject.displayName,
    source: claim.sourceObject.displayName,
  };
  const confirmFormId = `lineage-claim-confirm-${claim.id}`;
  const declineFormId = `lineage-claim-decline-${claim.id}`;
  const headingId = `lineage-claim-${claim.id}`;

  return (
    <li className="min-w-0">
      <article
        aria-labelledby={headingId}
        data-lineage-claim={claim.id}
        className="grid gap-4 rounded-lg border border-border p-4"
      >
        <header className="grid gap-1">
          {/* A sentence with both names: every tomato is "Томат", so the
              relationship is said, not drawn with an arrow. */}
          <h3 id={headingId} className="text-h4 break-words text-text-heading">
            {formatOwnerLineageTemplate(copy.claims.cardTitle, names)}
          </h3>
          <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm text-text">
            <span className="text-text-muted">{copy.claims.claimant}:</span>
            <LineageGardener identity={claim.proposer} locale={locale} />
            <span aria-hidden="true" className="text-text-muted">
              ·
            </span>
            <time
              dateTime={new Date(claim.createdAt).toISOString()}
              className="text-caption text-text-muted"
            >
              {formatOwnerLineageDate(locale, claim.createdAt)}
            </time>
          </p>
        </header>

        <dl className="grid gap-3 text-body-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-caption text-text-muted">
              {copy.common.claimedObject}
            </dt>
            <dd className="font-medium break-words text-text">
              {claim.subjectObject.displayName}
            </dd>
            <dd className="text-caption break-words text-text-muted">
              {lineageObjectMeta(claim.subjectObject, locale)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-text-muted">
              {copy.common.yourObject}
            </dt>
            <dd className="font-medium break-words">
              <Link
                href={gardenObjectSectionPath(claim.sourceObject.id)}
                variant="quiet"
              >
                {claim.sourceObject.displayName}
              </Link>
            </dd>
            <dd className="text-caption break-words text-text-muted">
              {lineageObjectMeta(claim.sourceObject, locale)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-text-muted">
              {copy.common.status}
            </dt>
            <dd className="text-text">{copy.claims.pending}</dd>
          </div>
        </dl>

        {/* What each answer does, before either can be given (criterion 8).
            Before the bundle runs the buttons post straight away, so this is
            the only place a reader without scripts is told. */}
        <section
          aria-labelledby={`${headingId}-consequences`}
          className="grid gap-2 rounded-md bg-surface-sunken p-3 text-body-sm text-text"
        >
          <h4
            id={`${headingId}-consequences`}
            className="font-medium text-text-heading"
          >
            {copy.claims.consequencesTitle}
          </h4>
          <ul className="grid list-disc gap-1 pl-5">
            <li>{copy.claims.ifConfirm}</li>
            <li>{copy.claims.ifDecline}</li>
          </ul>
          <p className="text-text-muted">{copy.claims.unchanged}</p>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border pt-3">
          <OwnerScopedProgressiveForm
            id={confirmFormId}
            action={confirmLineageClaimAction}
          >
            <HiddenField name="edgeId" value={claim.id} />
            <ConfirmSubmit
              formId={confirmFormId}
              variant="primary"
              label={copy.claims.confirm}
              title={formatOwnerLineageTemplate(
                copy.claims.confirmDialogTitle,
                names,
              )}
              description={copy.claims.confirmDialogBody}
              confirmLabel={copy.claims.confirmDialogAction}
              cancelLabel={copy.common.cancel}
            />
          </OwnerScopedProgressiveForm>
          <OwnerScopedProgressiveForm
            id={declineFormId}
            action={declineLineageClaimAction}
          >
            <HiddenField name="edgeId" value={claim.id} />
            <ConfirmSubmit
              formId={declineFormId}
              variant="secondary"
              label={copy.claims.decline}
              title={formatOwnerLineageTemplate(
                copy.claims.declineDialogTitle,
                names,
              )}
              description={copy.claims.declineDialogBody}
              confirmLabel={copy.claims.declineDialogAction}
              cancelLabel={copy.common.cancel}
            />
          </OwnerScopedProgressiveForm>
        </div>
      </article>
    </li>
  );
}
