import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { resolveIllustration } from "@/lib/illustrations";
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
import { publicJournalEntryAddress } from "@/lib/garden/public-paths";
import { HiddenField } from "@/components/ui/hidden-field";

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
      <ModerationShell slug={slug} copy={copy} locale={locale}>
        <SignInPrompt locale={locale} next={`/account/communities/${slug}`} />
      </ModerationShell>
    );
  }

  const scope = scopedToUser(session.user.id, getSessionId(session));
  const access = await resolveAdminCapabilityAccessBounded(
    scope,
    "operator:mutate",
  );
  if (access.status !== "allowed") {
    return (
      <ModerationShell
        slug={slug}
        copy={copy}
        locale={locale}
        accessState="denied"
      >
        <Callout tone="warning" role="alert">
          <p>{copy.common.accessDenied}</p>
        </Callout>
      </ModerationShell>
    );
  }
  const moderation = await listCommunityModerationQueue(scope, slug).catch(
    () => null,
  );
  if (!moderation) {
    return (
      <ModerationShell slug={slug} copy={copy} locale={locale}>
        <Callout tone="warning" role="alert">
          <p>{copy.community.unavailable}</p>
        </Callout>
      </ModerationShell>
    );
  }

  const actionStatus = firstValue(query.moderationAction);
  const participationOpen = moderation.community.participationState === "open";

  return (
    <ModerationShell slug={slug} copy={copy} locale={locale}>
      {actionStatus ? (
        <Callout tone="info" role="status">
          <p>
            {copy.community.moderationResult}:{" "}
            {operatorCommunityStateLabel(locale, actionStatus)}
          </p>
        </Callout>
      ) : null}

      <Section
        id="participation-gate"
        title={copy.community.participationGate}
        description={
          <>
            {copy.community.currentState}:{" "}
            {operatorCommunityStateLabel(
              locale,
              moderation.community.participationState,
            )}
          </>
        }
        actions={
          <OwnerScopedProgressiveForm action={setCommunityParticipationAction}>
            <ModeratorFields slug={slug} reason="rule_violation" />
            <HiddenField
              name="participationState"
              value={participationOpen ? "closed" : "open"}
            />
            <Button
              type="submit"
              variant={participationOpen ? "secondary" : "primary"}
            >
              {participationOpen
                ? copy.community.closeParticipation
                : copy.community.openParticipation}
            </Button>
          </OwnerScopedProgressiveForm>
        }
      />

      <Section
        id="moderation-queue"
        data-private-moderation-queue="true"
        title={copy.community.openReports}
        actions={
          moderation.items.length > 0 ? (
            <Badge tone="warning">{moderation.items.length}</Badge>
          ) : undefined
        }
      >
        {moderation.items.length === 0 ? (
          <EmptyState
            illustration={resolveIllustration("empty-community")}
            illustrationSize="card"
            title={copy.community.noReports}
          />
        ) : (
          <ul className="grid">
            {moderation.items.map((item) => (
              <li
                key={item.reportId}
                className="grid gap-4 border-b border-border py-5 last:border-b-0"
              >
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="warning">{item.reportReason}</Badge>
                    <Badge>
                      {operatorCommunityStateLabel(locale, item.reportState)}
                    </Badge>
                  </div>
                  <h3 className="text-h4 text-text-heading">
                    {item.journalTitle ?? copy.community.journalUnavailable}
                  </h3>
                  <p className="text-caption text-text-muted">
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
                      href={publicJournalEntryAddress({
                        authorHandle: item.addressHandle,
                        entryNumber: item.entryNumber,
                        publicSlug: item.publicSlug,
                      })}
                      className="text-link hover:text-link-hover w-fit rounded-sm text-body-sm font-medium underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
      </Section>
    </ModerationShell>
  );
}

function ModerationShell({
  slug,
  copy,
  locale,
  accessState,
  children,
}: {
  slug: string;
  copy: OperatorCopy;
  locale: string;
  accessState?: "denied";
  children: React.ReactNode;
}) {
  return (
    <main
      lang={locale}
      data-operator-access-state={accessState}
      className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8"
    >
      <PageHeader
        breadcrumb={
          <Link
            href="/account/communities"
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: "w-fit",
            })}
          >
            {copy.community.backToCommunities}
          </Link>
        }
        eyebrow={slug}
        title={copy.community.title}
        description={copy.community.description}
      />
      {children}
    </main>
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
  action: (previousState: unknown, formData: FormData) => Promise<unknown>;
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
    <OwnerScopedProgressiveForm action={action}>
      <ModeratorFields slug={slug} reason={item.reportReason} />
      <HiddenField name="reportId" value={item.reportId} />
      <HiddenField name="contributionId" value={item.contributionId} />
      <HiddenField name="membershipId" value={item.membershipId} />
      <HiddenField name={stateName} value={stateValue} />
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
    </OwnerScopedProgressiveForm>
  );
}

function ModeratorFields({ slug, reason }: { slug: string; reason: string }) {
  return (
    <>
      <HiddenField name="slug" value={slug} />
      <HiddenField name="reason" value={reason} />
    </>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
