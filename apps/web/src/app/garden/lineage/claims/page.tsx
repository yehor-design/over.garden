import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  listLineageClaimInbox,
  type LineageClaimInboxItem,
  type LineagePlantObjectOption,
} from "@/server/lineage-repository";
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden-auth-panel";
import {
  confirmLineageClaimAction,
  declineLineageClaimAction,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lineage claims | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LineageClaimInboxPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        <LineageClaimInboxHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const [writeAccess, claims] = await Promise.all([
    resolvePilotWriteAccess(scope),
    listLineageClaimInbox(scope),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
      <LineageClaimInboxHeader claimCount={claims.length} />

      {claims.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No provenance claims are waiting for you.
        </p>
      ) : (
        <ol className="grid gap-4">
          {claims.map((claim) => (
            <LineageClaimCard
              key={claim.id}
              claim={claim}
              writeEnabled={writeAccess.invited}
            />
          ))}
        </ol>
      )}
    </main>
  );
}

function LineageClaimInboxHeader({
  claimCount,
}: {
  claimCount?: number;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          Back to journal
        </Link>
        <Link
          href="/garden/lineage/questions"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          Lineage updates
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Lineage claims
        </h1>
        {typeof claimCount === "number" ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              Waiting: {claimCount}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Public change: none before confirm
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function LineageClaimCard({
  claim,
  writeEnabled,
}: {
  claim: LineageClaimInboxItem;
  writeEnabled: boolean;
}) {
  return (
    <li className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">
          {lineageClaimTitle(claim)}
        </h2>
        <time className="text-xs text-muted-foreground">
          {formatDate(claim.createdAt)}
        </time>
      </div>

      <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase">Claimed object</dt>
          <dd className="text-foreground">
            {lineageObjectOptionLabel(claim.subjectObject)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Your source object</dt>
          <dd className="text-foreground">
            {lineageObjectOptionLabel(claim.sourceObject)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">State</dt>
          <dd>{lineageClaimStateLabel(claim)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Proposed by</dt>
          <dd>Another gardener</dd>
        </div>
      </dl>

      {writeEnabled ? (
        <div className="flex flex-wrap gap-3 border-t border-border pt-3">
          <form action={confirmLineageClaimAction}>
            <input type="hidden" name="edgeId" value={claim.id} />
            <button
              type="submit"
              className={buttonVariants({ className: "self-start" })}
            >
              Confirm lineage
            </button>
          </form>
          <form action={declineLineageClaimAction}>
            <input type="hidden" name="edgeId" value={claim.id} />
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
      ) : (
        <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          Open your invitation link to respond to lineage claims.
        </p>
      )}
    </li>
  );
}

function lineageClaimTitle(claim: LineageClaimInboxItem) {
  return `${claim.subjectObject.displayName} claims provenance from ${claim.sourceObject.displayName}`;
}

function lineageObjectOptionLabel(option: LineagePlantObjectOption) {
  const variety = option.varietyText ?? "Unknown";
  return `${option.displayName} · ${variety}`;
}

function lineageClaimStateLabel(claim: LineageClaimInboxItem) {
  if (claim.consentState === "proposed") {
    return "Proposed lineage · no public contribution yet";
  }

  return `${claim.consentState} lineage`;
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
