import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession } from "@/server/auth-session";
import {
  getLineageInvitationClaimPreview,
  type LineageInvitationClaimPreview,
  type LineagePlantObjectOption,
} from "@/server/lineage-repository";
import { GardenAuthPanel } from "../../../garden-auth-panel";
import {
  confirmLineageInvitationClaimAction,
  declineLineageInvitationClaimAction,
} from "./actions";

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
  const token = normalizeFirstParam(params.token);
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!token) {
    return (
      <LineageInvitationClaimShell>
        <UnavailableInvite />
      </LineageInvitationClaimShell>
    );
  }

  if (!userId) {
    return (
      <LineageInvitationClaimShell>
        <GardenAuthPanel initialMessage="Sign in or create an account to review this lineage invitation. Details appear only after sign-in." />
      </LineageInvitationClaimShell>
    );
  }

  const preview = await getLineageInvitationClaimPreview(token);

  return (
    <LineageInvitationClaimShell>
      {preview ? (
        <LineageInvitationClaimCard token={token} preview={preview} />
      ) : (
        <UnavailableInvite />
      )}
    </LineageInvitationClaimShell>
  );
}

function LineageInvitationClaimShell({
  children,
}: {
  children: ReactNode;
}) {
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
  token,
  preview,
}: {
  token: string;
  preview: LineageInvitationClaimPreview;
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
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className={buttonVariants({ className: "self-start" })}
          >
            Claim and confirm
          </button>
        </form>
        <form action={declineLineageInvitationClaimAction}>
          <input type="hidden" name="token" value={token} />
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

function normalizeFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}
