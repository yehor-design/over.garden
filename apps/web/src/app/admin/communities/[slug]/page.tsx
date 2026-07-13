import Link from "next/link";
import { notFound } from "next/navigation";

import { GardenAuthPanel } from "@/app/garden/garden-auth-panel";
import { buttonVariants } from "@/components/ui/button";
import { resolveVisualCommunityScenario } from "@/lib/visual-fixtures/community-scenarios";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
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
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
  ]);
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) return notFound();
  const visualScenario = resolveVisualCommunityScenario(query.visualCommunity);
  const visualModerator =
    visualScenario?.communitySlug === slug &&
    visualScenario.actorRole === "moderator" &&
    visualScenario.actorId
      ? visualScenario
      : null;
  const visualModeratorActorId = visualModerator?.actorId ?? null;
  const session = visualModeratorActorId ? null : await getCurrentSession();
  if (!visualModeratorActorId && !session?.user?.id) {
    return (
      <main className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-8">
        <ModerationHeader slug={slug} />
        <GardenAuthPanel postAuthPath={`/admin/communities/${slug}`} />
      </main>
    );
  }

  const scope = visualModeratorActorId
    ? scopedToUser(visualModeratorActorId)
    : scopedToUser(session!.user.id, getSessionId(session));
  const moderation = await listCommunityModerationQueue(scope, slug).catch(
    () => null,
  );
  if (!moderation) {
    return (
      <main className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-8">
        <ModerationHeader slug={slug} />
        <p className="rounded-md border border-border p-4 text-sm" role="alert">
          Community moderator access is not available.
        </p>
      </main>
    );
  }

  const actionStatus = firstValue(query.moderationAction);
  const participationOpen = moderation.community.participationState === "open";

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-8">
      <ModerationHeader slug={slug} visualScenarioId={visualModerator?.id} />
      {actionStatus ? (
        <p
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          role="status"
        >
          Moderation result: {actionStatus}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Participation gate</h2>
          <p className="text-sm text-muted-foreground">
            Current state: {moderation.community.participationState}
          </p>
        </div>
        <form action={setCommunityParticipationAction}>
          <ModeratorFields
            slug={slug}
            reason="rule_violation"
            visualScenarioId={visualModerator?.id}
          />
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
            {participationOpen ? "Close participation" : "Open participation"}
          </button>
        </form>
      </section>

      <section id="moderation-queue" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Open reports</h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {moderation.items.length}
          </span>
        </div>
        {moderation.items.length === 0 ? (
          <p className="border-y border-border py-8 text-sm text-muted-foreground">
            No submitted reports.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {moderation.items.map((item) => (
              <li key={item.reportId} className="grid gap-4 py-5">
                <div className="grid gap-1">
                  <span className="text-xs font-semibold text-primary uppercase">
                    {item.reportReason} · {item.reportState}
                  </span>
                  <h3 className="text-lg font-semibold">
                    {item.journalTitle ?? "Journal is no longer public"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Reported {formatDate(item.reportedAt)} · contribution{" "}
                    {item.contributionState} · discussion {item.discussionState}
                  </p>
                  {item.publicSlug ? (
                    <Link
                      href={`/journal/${item.publicSlug}`}
                      className="w-fit text-sm font-medium text-primary hover:underline"
                    >
                      Open canonical journal
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ModerationForm
                    action={moderateCommunityContributionAction}
                    slug={slug}
                    item={item}
                    visualScenarioId={visualModerator?.id}
                    stateName="contributionState"
                    stateValue={
                      item.contributionState === "active" ? "removed" : "active"
                    }
                    label={
                      item.contributionState === "active"
                        ? "Remove from community"
                        : "Restore contribution"
                    }
                  />
                  <ModerationForm
                    action={moderateCommunityDiscussionAction}
                    slug={slug}
                    item={item}
                    visualScenarioId={visualModerator?.id}
                    stateName="discussionState"
                    stateValue={
                      item.discussionState === "open" ? "closed" : "open"
                    }
                    label={
                      item.discussionState === "open"
                        ? "Close discussion"
                        : "Open discussion"
                    }
                  />
                  <ModerationForm
                    action={moderateCommunityMembershipAction}
                    slug={slug}
                    item={item}
                    visualScenarioId={visualModerator?.id}
                    stateName="membershipState"
                    stateValue="banned"
                    label="Ban participant"
                  />
                  <ModerationForm
                    action={resolveCommunityReportAction}
                    slug={slug}
                    item={item}
                    visualScenarioId={visualModerator?.id}
                    stateName="reportState"
                    stateValue="actioned"
                    label="Resolve as actioned"
                  />
                  <ModerationForm
                    action={resolveCommunityReportAction}
                    slug={slug}
                    item={item}
                    visualScenarioId={visualModerator?.id}
                    stateName="reportState"
                    stateValue="dismissed"
                    label="Dismiss report"
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
  visualScenarioId,
}: {
  slug: string;
  visualScenarioId?: string;
}) {
  const backPath = visualScenarioId
    ? `/communities/${slug}?visualCommunity=${encodeURIComponent(visualScenarioId)}`
    : "/admin/communities";
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
        Back to {visualScenarioId ? "community" : "communities"}
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold">Community moderation</h1>
        <p className="text-sm text-muted-foreground">{slug}</p>
      </div>
    </header>
  );
}

function ModerationForm({
  action,
  slug,
  item,
  visualScenarioId,
  stateName,
  stateValue,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  slug: string;
  item: {
    reportId: string;
    contributionId: string;
    membershipId: string;
    reportReason: string;
  };
  visualScenarioId?: string;
  stateName: string;
  stateValue: string;
  label: string;
}) {
  return (
    <form action={action}>
      <ModeratorFields
        slug={slug}
        reason={item.reportReason}
        visualScenarioId={visualScenarioId}
      />
      <input type="hidden" name="reportId" value={item.reportId} />
      <input type="hidden" name="contributionId" value={item.contributionId} />
      <input type="hidden" name="membershipId" value={item.membershipId} />
      <input type="hidden" name={stateName} value={stateValue} />
      <button className={buttonVariants({ variant: "outline", size: "sm" })}>
        {label}
      </button>
    </form>
  );
}

function ModeratorFields({
  slug,
  reason,
  visualScenarioId,
}: {
  slug: string;
  reason: string;
  visualScenarioId?: string;
}) {
  return (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reason" value={reason} />
      {visualScenarioId ? (
        <input type="hidden" name="visualCommunity" value={visualScenarioId} />
      ) : null}
    </>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}
