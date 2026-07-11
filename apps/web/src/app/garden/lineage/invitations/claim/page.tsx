import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
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
import { getCurrentSession } from "@/server/auth-session";
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

export const metadata: Metadata = {
  title: "Lineage invitation | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

type ClaimSearchParams = Record<string, string | string[] | undefined>;
const EMPTY_CLAIM_SEARCH_PARAMS: ClaimSearchParams = {};

interface LineageInvitationClaimPageProps {
  searchParams?: Promise<ClaimSearchParams>;
}

export default async function LineageInvitationClaimPage({
  searchParams,
}: LineageInvitationClaimPageProps) {
  const params = await (searchParams ??
    Promise.resolve(EMPTY_CLAIM_SEARCH_PARAMS));
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
      <LineageInvitationClaimShell>
        <LineageClaimHandoff />
      </LineageInvitationClaimShell>
    );
  }

  if (!userId) {
    return (
      <LineageInvitationClaimShell>
        <GuestClaimPrompt />
      </LineageInvitationClaimShell>
    );
  }

  const preview = await getLineageInvitationClaimPreview(token);

  return (
    <LineageInvitationClaimShell>
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
      {preview ? (
        <LineageInvitationClaimCard
          preview={preview}
          resumed={resumeAction === "claim"}
        />
      ) : (
        <UnavailableInvite />
      )}
    </LineageInvitationClaimShell>
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function LineageInvitationClaimShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 sm:px-8">
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
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Lineage invitation
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Review a private provenance invitation. Nothing contributes to
            public lineage readback unless you confirm it.
          </p>
        </div>
      </header>
      {children}
    </main>
  );
}

function LineageInvitationClaimCard({
  preview,
  resumed,
}: {
  preview: LineageInvitationClaimPreview;
  resumed: boolean;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Confirm a provenance source
        </h2>
        <time className="text-xs text-muted-foreground">
          {formatDate(preview.createdAt)}
        </time>
      </div>

      <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase">Invited source</dt>
          <dd className="text-foreground">
            {preview.pendingIdentity.displayLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Claimed object</dt>
          <dd className="text-foreground">
            {lineageObjectOptionLabel(preview.subjectObject)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">State</dt>
          <dd>Pending · no public contribution yet</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Proposed by</dt>
          <dd>Another gardener</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3 border-t border-border pt-3">
        <form action={confirmLineageInvitationClaimAction}>
          <button
            id={resumed ? buildAuthIntentAnchor("claim") : undefined}
            data-auth-intent-control="claim"
            autoFocus={resumed}
            type="submit"
            className={buttonVariants({ className: "self-start" })}
          >
            Claim and confirm
          </button>
        </form>
        <form action={declineLineageInvitationClaimAction}>
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Decline
          </button>
        </form>
      </div>
    </section>
  );
}

function GuestClaimPrompt() {
  return (
    <section className="grid gap-4 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-foreground">
          Sign in to review this private invitation
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Invitation details stay hidden until you sign in. Nothing joins the
          public lineage graph unless you explicitly confirm it.
        </p>
      </div>
      <AuthIntentTrigger
        id={buildAuthIntentAnchor("claim")}
        action="claim"
        returnTo={LINEAGE_INVITATION_CLAIM_PATH}
        label="Sign in to review invitation"
        className="w-fit"
      />
    </section>
  );
}

function UnavailableInvite() {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      This lineage invitation is unavailable, expired, or already handled.
    </p>
  );
}

function lineageObjectOptionLabel(option: LineagePlantObjectOption) {
  const variety = option.varietyText ?? "Unknown";
  return `${option.displayName} · ${variety}`;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
