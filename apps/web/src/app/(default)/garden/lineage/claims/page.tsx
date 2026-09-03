import type { Metadata } from "next";
import { Suspense } from "react";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";

import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOwnerLineageDate,
  formatOwnerLineageTemplate,
  getOwnerLineageCopy,
  type OwnerLineageCopy,
} from "@/lib/owner-lineage-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  listLineageClaimInbox,
  type LineageClaimInboxItem,
  type LineagePlantObjectOption,
} from "@/server/lineage-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { LineageClaimsShell, LINEAGE_CLAIMS_PATH } from "./claims-shell";
import { GardenAuthPanel } from "../../garden-auth-panel";
import {
  confirmLineageClaimAction,
  declineLineageClaimAction,
} from "./actions";

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
  const copy = getOwnerLineageCopy(locale);
  const invitationStatus = normalizeInvitationStatus(params.invitation);

  if (viewer.status === "unavailable") {
    return (
      <LineageClaimsShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={LINEAGE_CLAIMS_PATH}
        />
      </LineageClaimsShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <LineageClaimsShell locale={locale}>
        <GardenAuthPanel locale={locale} />
      </LineageClaimsShell>
    );
  }

  return (
    <LineageClaimsShell locale={locale}>
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
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}
      >
        <LineageClaimsSection locale={locale} scope={viewer.scope} />
      </Suspense>
    </LineageClaimsShell>
  );
}

async function LineageClaimsSection({
  locale,
  scope,
}: {
  locale: InterfaceLocale;
  scope: RequestScope;
}) {
  const copy = getOwnerLineageCopy(locale);
  const claims = await settleSection(() => listLineageClaimInbox(scope), {
    deadlineMs: workspaceSectionDeadlineMs(2),
    surface: "lineage-claims",
    section: "inbox",
  });

  if (claims.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={claims}
        title={copy.claims.title}
        retryHref={LINEAGE_CLAIMS_PATH}
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md border border-border px-2 py-1">
          {formatOwnerLineageTemplate(copy.claims.waiting, {
            count: claims.value.length,
          })}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          {copy.claims.publicChange}
        </span>
      </div>
      {claims.value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {copy.claims.empty}
        </p>
      ) : (
        <ol className="grid gap-4">
          {claims.value.map((claim) => (
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
    </>
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
          <OwnerScopedActionForm action={confirmLineageClaimAction}>
            <input type="hidden" name="edgeId" value={claim.id} />
            <button
              type="submit"
              className={buttonVariants({ className: "self-start" })}
            >
              {copy.claims.confirm}
            </button>
          </OwnerScopedActionForm>
          <OwnerScopedActionForm action={declineLineageClaimAction}>
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
          </OwnerScopedActionForm>
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
