import Link from "next/link";
import { notFound } from "next/navigation";

import { GardenAuthPanel } from "@/app/garden/garden-auth-panel";
import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import type { OperatorCopy } from "@/lib/operator-copy";
import {
  formatOperatorDate,
  getOperatorCopy,
  operatorCommunityStateLabel,
} from "@/lib/operator-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveAdminCapabilityAccessBounded } from "@/server/admin-access";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { listCommunityModerationQueue } from "@/server/community-repository";
import { scopedToUser } from "@/server/request-scope";
import {
  moderateCommunityContributionAction,
  moderateCommunityDiscussionAction,
  moderateCommunityMembershipAction,
  resolveCommunityReportAction,
  setCommunityParticipationAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface CommunityModerationPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

export default async function CommunityModerationPage({
  params,
  searchParams,
}: CommunityModerationPageProps) {
  const [{ slug }, query, locale] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const copy = getOperatorCopy(locale);
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) return notFound();
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return (
      <main className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-8">
        <ModerationHeader slug={slug} copy={copy} />
        <GardenAuthPanel
          locale={locale}
          postAuthPath={`/account/communities/${slug}`}
        />
      </main>
    );
  }

  const scope = scopedToUser(session.user.id, getSessionId(session));
  const access = await resolveAdminCapabilityAccessBounded(
    scope,
    "operator:mutate",
  );
  if (access.status !== "allowed") {
    return (
      <main
        data-operator-access-state="denied"
        className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-8"
      >
        <ModerationHeader slug={slug} copy={copy} />
        <p className="rounded-md border border-border p-4 text-sm" role="alert">
          {copy.common.accessDenied}
        </p>
      </main>
    );
  }
  const moderation = await listCommunityModerationQueue(scope, slug).catch(
    () => null,
  );
  if (!moderation) {
    return (
      <main className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-8">
        <ModerationHeader slug={slug} copy={copy} />
        <p className="rounded-md border border-border p-4 text-sm" role="alert">
          {copy.community.unavailable}
        </p>
      </main>
    );
  }

  const actionStatus = firstValue(query.moderationAction);
  const participationOpen = moderation.community.participationState === "open";

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-8">
      <ModerationHeader slug={slug} copy={copy} />
      {actionStatus ? (
        <p
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          role="status"
        >
          {copy.community.moderationResult}:{" "}
          {operatorCommunityStateLabel(locale, actionStatus)}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">
            {copy.community.participationGate}
          </h2>
          <p className="text-sm text-muted-foreground">
            {copy.community.currentState}:{" "}
            {operatorCommunityStateLabel(
              locale,
              moderation.community.participationState,
            )}
          </p>
        </div>
        <OwnerScopedActionForm action={setCommunityParticipationAction}>
          <ModeratorFields slug={slug} reason="rule_violation" />
          <input
            type="hidden"
            name="participationState"
            value={participationOpen ? "closed" : "open"}
          />
          <button
            className={buttonVariants({
              variant: participationOpen ? "outline" : "default",
            })}
          >
            {participationOpen
              ? copy.community.closeParticipation
              : copy.community.openParticipation}
          </button>
        </OwnerScopedActionForm>
      </section>

      <section
        id="moderation-queue"
        data-private-moderation-queue="true"
        className="grid gap-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {copy.community.openReports}
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {moderation.items.length}
          </span>
        </div>
        {moderation.items.length === 0 ? (
          <p className="border-y border-border py-8 text-sm text-muted-foreground">
            {copy.community.noReports}
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {moderation.items.map((item) => (
              <li key={item.reportId} className="grid gap-4 py-5">
                <div className="grid gap-1">
                  <span className="text-xs font-semibold text-primary uppercase">
                    {item.reportReason} ·{" "}
                    {operatorCommunityStateLabel(locale, item.reportState)}
                  </span>
                  <h3 className="text-lg font-semibold">
                    {item.journalTitle ?? copy.community.journalUnavailable}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {copy.community.reported}{" "}
                    {formatOperatorDate(locale, item.reportedAt, {
                      dateStyle: "medium",
                    })}{" "}
                    · {copy.community.contribution}{" "}
                    {operatorCommunityStateLabel(
                      locale,
                      item.contributionState,
                    )}{" "}
                    · {copy.community.discussion}{" "}
                    {operatorCommunityStateLabel(locale, item.discussionState)}
                  </p>
                  {item.publicSlug ? (
                    <Link
                      href={`/journal/${item.publicSlug}`}
                      className="w-fit text-sm font-medium text-primary hover:underline"
                    >
                      {copy.community.openJournal}
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ModerationForm
                    action={moderateCommunityContributionAction}
                    slug={slug}
                    item={item}
                    stateName="contributionState"
                    stateValue={
                      item.contributionState === "active" ? "removed" : "active"
                    }
                    label={
                      item.contributionState === "active"
                        ? copy.community.removeContribution
                        : copy.community.restoreContribution
                    }
                  />
                  <ModerationForm
                    action={moderateCommunityDiscussionAction}
                    slug={slug}
                    item={item}
                    stateName="discussionState"
                    stateValue={
                      item.discussionState === "open" ? "closed" : "open"
                    }
                    label={
                      item.discussionState === "open"
                        ? copy.community.closeDiscussion
                        : copy.community.openDiscussion
                    }
                  />
                  <ModerationForm
                    action={moderateCommunityMembershipAction}
                    slug={slug}
                    item={item}
                    stateName="membershipState"
                    stateValue="banned"
                    label={copy.community.banParticipant}
                  />
                  <ModerationForm
                    action={resolveCommunityReportAction}
                    slug={slug}
                    item={item}
                    stateName="reportState"
                    stateValue="actioned"
                    label={copy.community.resolveActioned}
                  />
                  <ModerationForm
                    action={resolveCommunityReportAction}
                    slug={slug}
                    item={item}
                    stateName="reportState"
                    stateValue="dismissed"
                    label={copy.community.dismissReport}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ModerationHeader({
  slug,
  copy,
}: {
  slug: string;
  copy: OperatorCopy;
}) {
  const backPath = "/account/communities";
  return (
    <header className="grid gap-4 border-b border-border pb-5">
      <Link
        href={backPath}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "w-fit",
        })}
      >
        {copy.community.backToCommunities}
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold">{copy.community.title}</h1>
        <p className="text-sm text-muted-foreground">{slug}</p>
      </div>
    </header>
  );
}

function ModerationForm({
  action,
  slug,
  item,
  stateName,
  stateValue,
  label,
}: {
  action: (formData: FormData) => Promise<unknown>;
  slug: string;
  item: {
    reportId: string;
    contributionId: string;
    membershipId: string;
    reportReason: string;
  };
  stateName: string;
  stateValue: string;
  label: string;
}) {
  return (
    <OwnerScopedActionForm action={action}>
      <ModeratorFields slug={slug} reason={item.reportReason} />
      <input type="hidden" name="reportId" value={item.reportId} />
      <input type="hidden" name="contributionId" value={item.contributionId} />
      <input type="hidden" name="membershipId" value={item.membershipId} />
      <input type="hidden" name={stateName} value={stateValue} />
      <button className={buttonVariants({ variant: "outline", size: "sm" })}>
        {label}
      </button>
    </OwnerScopedActionForm>
  );
}

function ModeratorFields({ slug, reason }: { slug: string; reason: string }) {
  return (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reason" value={reason} />
    </>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
