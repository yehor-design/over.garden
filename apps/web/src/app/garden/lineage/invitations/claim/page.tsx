import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { buttonVariants } from "@/components/ui/button";
import {
  buildAuthIntentAnchor,
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { lineageInvitationClaimPath } from "@/lib/garden/public-paths";
import {
  LINEAGE_CLAIM_COOKIE_NAME,
  LINEAGE_INVITATION_CLAIM_PATH,
} from "@/lib/lineage/claim-handoff";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  getOwnerLineageCopy,
  type OwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import { getCurrentSession } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { unsealLineageClaimToken } from "@/server/lineage-claim-cookie";
import { verifyLineageInviteToken } from "@/server/lineage-invite-token";
import {
  getLineageInvitationClaimPreview,
  type LineageInvitationClaimPreview,
  type LineagePlantObjectOption,
} from "@/server/lineage-repository";
import {
  confirmLineageInvitationClaimAction,
  declineLineageInvitationClaimAction,
} from "./actions";
import { LineageClaimHandoff } from "./claim-handoff";

export const dynamic = "force-dynamic";

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
  const legacyToken = firstSearchParam(params.token)?.trim();
  if (legacyToken) {
    redirect(
      verifyLineageInviteToken(legacyToken)
        ? lineageInvitationClaimPath(legacyToken)
        : LINEAGE_INVITATION_CLAIM_PATH,
    );
  }

  const [cookieStore, session] = await Promise.all([
    cookies(),
    getCurrentSession(),
  ]);
  const token = unsealLineageClaimToken(
    cookieStore.get(LINEAGE_CLAIM_COOKIE_NAME)?.value,
  );
  const userId = session?.user?.id;
  const resumeAction = normalizeAuthIntentResumeAction(params.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(params.authControl);

  if (!token) {
    return (
      <LineageInvitationClaimShell locale={locale} copy={copy}>
        <LineageClaimHandoff locale={locale} />
      </LineageInvitationClaimShell>
    );
  }

  if (!userId) {
    return (
      <LineageInvitationClaimShell locale={locale} copy={copy}>
        <GuestClaimPrompt copy={copy} />
      </LineageInvitationClaimShell>
    );
  }

  const preview = await getLineageInvitationClaimPreview(token);

  return (
    <LineageInvitationClaimShell locale={locale} copy={copy}>
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
      {preview ? (
        <LineageInvitationClaimCard
          copy={copy}
          locale={locale}
          preview={preview}
          resumed={resumeAction === "claim"}
        />
      ) : (
        <UnavailableInvite copy={copy} />
      )}
    </LineageInvitationClaimShell>
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function LineageInvitationClaimShell({
  children,
  copy,
  locale,
}: {
  children: ReactNode;
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
}) {
  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {copy.common.backToJournal}
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {copy.invitation.title}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.invitation.description}
          </p>
        </div>
      </header>
      {children}
    </main>
  );
}

function LineageInvitationClaimCard({
  copy,
  locale,
  preview,
  resumed,
}: {
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
  preview: LineageInvitationClaimPreview;
  resumed: boolean;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">
          {copy.invitation.cardTitle}
        </h2>
        <time className="text-xs text-muted-foreground">
          {formatOwnerLineageDate(locale, preview.createdAt)}
        </time>
      </div>

      <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase">{copy.common.invitedSource}</dt>
          <dd className="text-foreground">
            {preview.pendingIdentity.displayLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.common.claimedObject}</dt>
          <dd className="text-foreground">
            {lineageObjectOptionLabel(preview.subjectObject, copy)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.common.state}</dt>
          <dd>{copy.states.pending}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.common.proposedBy}</dt>
          <dd>{copy.common.anotherGardener}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3 border-t border-border pt-3">
        <DocumentMutationActionForm
          action={confirmLineageInvitationClaimAction}
        >
          <button
            id={resumed ? buildAuthIntentAnchor("claim") : undefined}
            data-auth-intent-control="claim"
            autoFocus={resumed}
            type="submit"
            className={buttonVariants({ className: "self-start" })}
          >
            {copy.invitation.confirm}
          </button>
        </DocumentMutationActionForm>
        <DocumentMutationActionForm
          action={declineLineageInvitationClaimAction}
        >
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            {copy.invitation.decline}
          </button>
        </DocumentMutationActionForm>
      </div>
    </section>
  );
}

function GuestClaimPrompt({ copy }: { copy: OwnerLineageCopy }) {
  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-foreground">
          {copy.invitation.guestTitle}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.invitation.guestDescription}
        </p>
      </div>
      <AuthIntentTrigger
        id={buildAuthIntentAnchor("claim")}
        action="claim"
        returnTo={LINEAGE_INVITATION_CLAIM_PATH}
        label={copy.invitation.signIn}
        className="w-fit"
      />
    </section>
  );
}

function UnavailableInvite({ copy }: { copy: OwnerLineageCopy }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {copy.invitation.unavailable}
    </p>
  );
}

function lineageObjectOptionLabel(
  option: LineagePlantObjectOption,
  copy: OwnerLineageCopy,
) {
  const variety = option.varietyText ?? copy.common.unknownVariety;
  return `${option.displayName} · ${variety}`;
}
