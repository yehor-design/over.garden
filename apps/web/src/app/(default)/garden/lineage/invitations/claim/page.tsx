import type { Metadata } from "next";
import NextLink from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import {
  buildAuthIntentAnchor,
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { gardenObjectSectionPath } from "@/lib/garden/object-pages";
import { lineageInvitationClaimPath } from "@/lib/garden/public-paths";
import {
  LINEAGE_CLAIM_COOKIE_NAME,
  LINEAGE_INVITATION_CLAIM_PATH,
} from "@/lib/lineage/claim-handoff";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  formatOwnerLineageTemplate,
  getOwnerLineageCopy,
  type OwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { unsealLineageClaimToken } from "@/server/lineage-claim-cookie";
import { inspectLineageInviteToken } from "@/server/lineage-invite-token";
import {
  getLineageInvitationClaimState,
  type LineageInvitationClaimState,
} from "@/server/lineage-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { LineageShell } from "../../lineage-shell";
import { LineageGardener, lineageObjectMeta } from "../../lineage-parts";
import { LineageOutcomeNotice } from "../../outcome-notice";
import {
  confirmLineageInvitationClaimAction,
  declineLineageInvitationClaimAction,
} from "./actions";
import {
  LINEAGE_INVITATION_REGION_ATTRIBUTE,
  LineageClaimHandoff,
} from "./claim-handoff";
import { readInvitationOutcome, type InvitationOutcome } from "./outcome";
import { InvitationStatePanel } from "./state-panel";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOwnerLineageCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadata.invitationTitle,
    robots: { index: false, follow: false },
  };
}

type ClaimSearchParams = Record<string, string | string[] | undefined>;
const EMPTY_CLAIM_SEARCH_PARAMS: ClaimSearchParams = {};

interface LineageInvitationClaimPageProps {
  searchParams?: Promise<ClaimSearchParams>;
}

export default async function LineageInvitationClaimPage({
  searchParams,
}: LineageInvitationClaimPageProps) {
  const [params, locale] = await Promise.all([
    searchParams ?? Promise.resolve(EMPTY_CLAIM_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const copy = getOwnerLineageCopy(locale);
  // An old `?token=` link moves its token into the fragment, which no server
  // log sees. An expired one goes too: the handoff then says it expired,
  // rather than that there is no link at all.
  const legacyToken = firstSearchParam(params.token)?.trim();
  if (legacyToken) {
    redirect(
      inspectLineageInviteToken(legacyToken).state === "invalid"
        ? LINEAGE_INVITATION_CLAIM_PATH
        : lineageInvitationClaimPath(legacyToken),
    );
  }

  const [cookieStore, viewer] = await Promise.all([
    cookies(),
    resolveWorkspaceViewer(),
  ]);
  const token = unsealLineageClaimToken(
    cookieStore.get(LINEAGE_CLAIM_COOKIE_NAME)?.value,
  );
  const resumeAction = normalizeAuthIntentResumeAction(params.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(params.authControl);
  const outcome = readInvitationOutcome(params.result);

  if (viewer.status === "unavailable") {
    return (
      <LineageShell locale={locale} section="invitation">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={LINEAGE_INVITATION_CLAIM_PATH}
        />
      </LineageShell>
    );
  }

  if (!token) {
    return (
      <LineageShell locale={locale} section="invitation">
        {outcome === "stale" ? (
          <LineageOutcomeNotice
            outcome="stale"
            tone="warning"
            title={copy.invitation.states.notSaved}
          />
        ) : null}
        <LineageClaimHandoff locale={locale} />
      </LineageShell>
    );
  }

  // The device holds an invitation. A newer link in the address replaces it
  // before anything of the stored one can be pressed (`LineageClaimHandoff`).
  const invitationRegion = { [LINEAGE_INVITATION_REGION_ATTRIBUTE]: "true" };

  if (viewer.status === "sign-in-required") {
    return (
      <LineageShell locale={locale} section="invitation">
        <LineageClaimHandoff locale={locale} replacing />
        <div {...invitationRegion}>
          <GuestClaimPrompt copy={copy} />
        </div>
      </LineageShell>
    );
  }

  return (
    <LineageShell locale={locale} section="invitation">
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
      <LineageClaimHandoff locale={locale} replacing />
      <div {...invitationRegion}>
        <Suspense
          fallback={<WorkspaceSectionSkeleton locale={locale} rows={1} />}
        >
          <LineageInvitationClaimSection
            locale={locale}
            token={token}
            viewerUserId={viewer.scope.userId}
            resumed={resumeAction === "claim"}
            outcome={outcome}
          />
        </Suspense>
      </div>
    </LineageShell>
  );
}

async function LineageInvitationClaimSection({
  locale,
  token,
  viewerUserId,
  resumed,
  outcome,
}: {
  locale: InterfaceLocale;
  token: string;
  viewerUserId: string;
  resumed: boolean;
  outcome: InvitationOutcome | null;
}) {
  const copy = getOwnerLineageCopy(locale);
  const settled = await settleSection(
    () => getLineageInvitationClaimState(token, viewerUserId),
    {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "lineage-invitation-claim",
      section: "invitation",
    },
  );

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.invitation.title}
        retryHref={LINEAGE_INVITATION_CLAIM_PATH}
      />
    );
  }

  const invitation = settled.value;
  if (invitation.state === "ready") {
    return (
      <LineageInvitationClaimCard
        copy={copy}
        locale={locale}
        invitation={invitation}
        resumed={resumed}
        notSaved={outcome === "stale"}
      />
    );
  }

  const message = invitationStateMessage(invitation, copy);
  // Arriving from an answer, the state is the news: it is announced and
  // focused. Opened any other way, it is simply what the page says.
  if (outcome) {
    return (
      <LineageOutcomeNotice
        outcome={outcome === "done" ? message.state : "stale"}
        tone={outcome === "done" ? message.tone : "warning"}
        title={
          outcome === "done"
            ? message.title
            : `${copy.invitation.states.notSaved} ${message.title}`
        }
      >
        <p>{message.body}</p>
        {message.action}
      </LineageOutcomeNotice>
    );
  }
  return (
    <InvitationStatePanel
      state={message.state}
      tone={message.tone}
      title={message.title}
      body={message.body}
      action={message.action}
    />
  );
}

function invitationStateMessage(
  invitation: Exclude<LineageInvitationClaimState, { state: "ready" }>,
  copy: OwnerLineageCopy,
) {
  const states = copy.invitation.states;
  switch (invitation.state) {
    case "expired":
      return {
        state: "expired",
        tone: "warning" as const,
        title: states.expiredTitle,
        body: states.expiredBody,
        action: null,
      };
    case "invalid":
      return {
        state: "invalid",
        tone: "warning" as const,
        title: states.invalidTitle,
        body: states.invalidBody,
        action: null,
      };
    case "withdrawn":
      return {
        state: "withdrawn",
        tone: "info" as const,
        title: states.withdrawnTitle,
        body: states.withdrawnBody,
        action: null,
      };
    case "own":
      return {
        state: "own",
        tone: "info" as const,
        title: states.ownTitle,
        body: states.ownBody,
        action: (
          <NextLink
            href={gardenObjectSectionPath(
              invitation.preview.subjectObject.id,
              "provenance",
            )}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            {formatOwnerLineageTemplate(states.ownLink, {
              subject: invitation.preview.subjectObject.displayName,
            })}
          </NextLink>
        ),
      };
    case "answered":
      if (invitation.byViewer && invitation.decision === "confirmed") {
        return {
          state: "confirmed",
          tone: "success" as const,
          title: states.confirmedByYouTitle,
          body: states.confirmedByYouBody,
          action: null,
        };
      }
      if (invitation.byViewer && invitation.decision === "declined") {
        return {
          state: "declined",
          tone: "success" as const,
          title: states.declinedByYouTitle,
          body: states.declinedByYouBody,
          action: null,
        };
      }
      return {
        state: "answered-by-other",
        tone: "warning" as const,
        title: states.answeredByOtherTitle,
        body: states.answeredByOtherBody,
        action: null,
      };
  }
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function LineageInvitationClaimCard({
  copy,
  locale,
  invitation,
  resumed,
  notSaved,
}: {
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
  invitation: Extract<LineageInvitationClaimState, { state: "ready" }>;
  resumed: boolean;
  notSaved: boolean;
}) {
  const ready = copy.invitation.ready;
  const { preview, inviter } = invitation;
  const subject = preview.subjectObject.displayName;
  const confirmFormId = "lineage-invitation-confirm";
  const declineFormId = "lineage-invitation-decline";

  return (
    <section
      aria-labelledby="lineage-invitation-heading"
      data-invitation-state="ready"
      className="grid gap-4 rounded-lg border border-border p-4"
    >
      {notSaved ? (
        <LineageOutcomeNotice
          outcome="stale"
          tone="warning"
          title={copy.invitation.states.notSaved}
        />
      ) : null}
      <h2
        id="lineage-invitation-heading"
        className="text-h3 break-words text-text-heading"
      >
        {formatOwnerLineageTemplate(ready.title, { subject })}
      </h2>

      <dl className="grid gap-3 text-body-sm">
        <div className="grid min-w-0 gap-0.5">
          <dt className="text-caption text-text-muted">{ready.inviter}</dt>
          <dd>
            <LineageGardener identity={inviter} locale={locale} />
          </dd>
        </div>
        <div className="grid min-w-0 gap-0.5">
          <dt className="text-caption text-text-muted">{ready.recordedAs}</dt>
          <dd className="font-medium break-words text-text">
            {preview.pendingIdentity.displayLabel}
          </dd>
        </div>
        <div className="grid min-w-0 gap-0.5">
          <dt className="text-caption text-text-muted">{ready.object}</dt>
          <dd className="font-medium break-words text-text">{subject}</dd>
          <dd className="text-caption break-words text-text-muted">
            {lineageObjectMeta(preview.subjectObject, locale)} ·{" "}
            <time dateTime={new Date(preview.createdAt).toISOString()}>
              {formatOwnerLineageDate(locale, preview.createdAt)}
            </time>
          </dd>
        </div>
      </dl>

      <section
        aria-labelledby="lineage-invitation-consequences"
        className="grid gap-2 rounded-md bg-surface-sunken p-3 text-body-sm text-text"
      >
        <h3
          id="lineage-invitation-consequences"
          className="font-medium text-text-heading"
        >
          {ready.consequencesTitle}
        </h3>
        <ul className="grid list-disc gap-1 pl-5">
          <li>{ready.ifConfirm}</li>
          <li>{ready.ifDecline}</li>
        </ul>
        <p className="text-text-muted">{ready.unchanged}</p>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-border pt-3">
        <OwnerScopedProgressiveForm
          id={confirmFormId}
          action={confirmLineageInvitationClaimAction}
        >
          <ConfirmSubmit
            formId={confirmFormId}
            variant="primary"
            id={resumed ? buildAuthIntentAnchor("claim") : undefined}
            data-auth-intent-control="claim"
            label={ready.confirm}
            title={formatOwnerLineageTemplate(ready.confirmDialogTitle, {
              subject,
            })}
            description={ready.confirmDialogBody}
            confirmLabel={ready.confirmDialogAction}
            cancelLabel={copy.common.cancel}
          />
        </OwnerScopedProgressiveForm>
        <OwnerScopedProgressiveForm
          id={declineFormId}
          action={declineLineageInvitationClaimAction}
        >
          <ConfirmSubmit
            formId={declineFormId}
            variant="secondary"
            label={ready.decline}
            title={ready.declineDialogTitle}
            description={ready.declineDialogBody}
            confirmLabel={ready.declineDialogAction}
            cancelLabel={copy.common.cancel}
          />
        </OwnerScopedProgressiveForm>
      </div>
    </section>
  );
}

function GuestClaimPrompt({ copy }: { copy: OwnerLineageCopy }) {
  const guest = copy.invitation.guest;
  return (
    <section
      aria-labelledby="lineage-invitation-guest"
      data-invitation-state="guest"
      className="grid gap-4 rounded-lg border border-border p-4"
    >
      <div className="grid gap-1">
        <h2 id="lineage-invitation-guest" className="text-h4 text-text-heading">
          {guest.title}
        </h2>
        <p className="text-body-sm leading-6 text-text-muted">
          {guest.description}
        </p>
      </div>
      <AuthIntentTrigger
        id={buildAuthIntentAnchor("claim")}
        action="claim"
        returnTo={LINEAGE_INVITATION_CLAIM_PATH}
        label={guest.signIn}
        className="w-fit"
      />
    </section>
  );
}
