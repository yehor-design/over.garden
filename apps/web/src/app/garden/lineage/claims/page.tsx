import type { Metadata } from "next";
import Link from "next/link";

import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  formatOwnerLineageTemplate,
  getOwnerLineageCopy,
  type OwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  listLineageClaimInbox,
  type LineageClaimInboxItem,
  type LineagePlantObjectOption,
} from "@/server/lineage-repository";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden-auth-panel";
import {
  confirmLineageClaimAction,
  declineLineageClaimAction,
} from "./actions";

export const dynamic = "force-dynamic";

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
  const params = await (searchParams ??
    Promise.resolve<Record<string, string | string[] | undefined>>({}));
  const invitationStatus = normalizeInvitationStatus(params.invitation);
  const [session, locale] = await Promise.all([
    getCurrentSession(),
    getRequestInterfaceLocale(),
  ]);
  const copy = getOwnerLineageCopy(locale);
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main
        lang={locale}
        className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
      >
        <LineageClaimInboxHeader copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  const claims = await listLineageClaimInbox(scope);

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <LineageClaimInboxHeader copy={copy} claimCount={claims.length} />

      {invitationStatus ? (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
        >
          {invitationStatus === "confirmed"
            ? copy.claims.confirmedNotice
            : copy.claims.declinedNotice}
        </p>
      ) : null}

      {claims.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.claims.empty}
        </p>
      ) : (
        <ol className="grid gap-4">
          {claims.map((claim) => (
            <LineageClaimCard
              key={claim.id}
              claim={claim}
              copy={copy}
              locale={locale}
              writeEnabled
            />
          ))}
        </ol>
      )}
    </main>
  );
}

function normalizeInvitationStatus(
  value: string | string[] | undefined,
): "confirmed" | "declined" | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "confirmed" || candidate === "declined"
    ? candidate
    : null;
}

function LineageClaimInboxHeader({
  copy,
  claimCount,
}: {
  copy: OwnerLineageCopy;
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
          {copy.common.backToJournal}
        </Link>
        <Link
          href="/garden/lineage/questions"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {copy.common.updates}
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.claims.title}
        </h1>
        {typeof claimCount === "number" ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {formatOwnerLineageTemplate(copy.claims.waiting, {
                count: claimCount,
              })}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.claims.publicChange}
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function LineageClaimCard({
  claim,
  copy,
  locale,
  writeEnabled,
}: {
  claim: LineageClaimInboxItem;
  copy: OwnerLineageCopy;
  locale: InterfaceLocale;
  writeEnabled: boolean;
}) {
  return (
    <li className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">
          {lineageClaimTitle(claim, copy)}
        </h2>
        <time className="text-xs text-muted-foreground">
          {formatOwnerLineageDate(locale, claim.createdAt)}
        </time>
      </div>

      <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase">{copy.common.claimedObject}</dt>
          <dd className="text-foreground">
            {lineageObjectOptionLabel(claim.subjectObject, copy)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.claims.yourSourceObject}</dt>
          <dd className="text-foreground">
            {lineageObjectOptionLabel(claim.sourceObject, copy)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.common.state}</dt>
          <dd>{lineageClaimStateLabel(claim, copy)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">{copy.common.proposedBy}</dt>
          <dd>{copy.common.anotherGardener}</dd>
        </div>
      </dl>

      {writeEnabled ? (
        <div className="flex flex-wrap gap-3 border-t border-border pt-3">
          <DocumentMutationActionForm action={confirmLineageClaimAction}>
            <input type="hidden" name="edgeId" value={claim.id} />
            <button
              type="submit"
              className={buttonVariants({ className: "self-start" })}
            >
              {copy.claims.confirm}
            </button>
          </DocumentMutationActionForm>
          <DocumentMutationActionForm action={declineLineageClaimAction}>
            <input type="hidden" name="edgeId" value={claim.id} />
            <button
              type="submit"
              className={buttonVariants({
                variant: "outline",
                className: "self-start",
              })}
            >
              {copy.claims.decline}
            </button>
          </DocumentMutationActionForm>
        </div>
      ) : (
        <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          {copy.claims.writeGate}
        </p>
      )}
    </li>
  );
}

function lineageClaimTitle(
  claim: LineageClaimInboxItem,
  copy: OwnerLineageCopy,
) {
  return formatOwnerLineageTemplate(copy.claims.claimTitle, {
    subject: claim.subjectObject.displayName,
    source: claim.sourceObject.displayName,
  });
}

function lineageObjectOptionLabel(
  option: LineagePlantObjectOption,
  copy: OwnerLineageCopy,
) {
  const variety = option.varietyText ?? copy.common.unknownVariety;
  return `${option.displayName} · ${variety}`;
}

function lineageClaimStateLabel(
  claim: LineageClaimInboxItem,
  copy: OwnerLineageCopy,
) {
  if (claim.consentState === "proposed") {
    return copy.states.proposed;
  }

  return claim.consentState === "confirmed"
    ? copy.states.confirmed
    : copy.states.declined;
}
