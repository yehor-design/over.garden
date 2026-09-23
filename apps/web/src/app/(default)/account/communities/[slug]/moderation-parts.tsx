import Link from "next/link";

import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { FlagIcon as Flag } from "@/components/icons/Flag";
import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";
import {
  ModerationFrame,
  ModerationOutcome,
  ModerationTabs,
  type ModerationResult,
  type ModerationView,
} from "@/components/moderation/moderation-frame";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { HiddenField } from "@/components/ui/hidden-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCommunityContentCopy } from "@/lib/community-copy";
import {
  publicCommunityPath,
  publicJournalEntryAddress,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  fillModerationTemplate,
  getModerationCopy,
  type ModerationCopy,
} from "@/lib/moderation-copy";
import { formatOperatorDate } from "@/lib/operator-copy";
import { localizedPath } from "@/lib/public-localization";
import type { CommunityModerationQueueItem } from "@/server/community-repository";

import {
  moderateCommunityContributionAction,
  moderateCommunityDiscussionAction,
  moderateCommunityMembershipAction,
  resolveCommunityReportAction,
} from "./actions";

export function communityModerationPath(slug: string) {
  return `/account/communities/${encodeURIComponent(slug)}`;
}

export function communityModerationViewHref(
  slug: string,
  view: ModerationView,
) {
  return view === "open"
    ? communityModerationPath(slug)
    : `${communityModerationPath(slug)}?view=resolved`;
}

/**
 * One community's moderation page frame: the way back to every community, the
 * community's name, and its two sections — reports and the acceptance of new
 * entries (`OVE-500`, criterion 8).
 */
export function CommunityModerationFrame({
  locale,
  slug,
  contentKey,
  current,
  accessState,
  state,
  children,
}: {
  locale: InterfaceLocale;
  slug: string;
  contentKey: string | null;
  current: "reports" | "settings";
  accessState: "sign-in-required" | "denied" | "unavailable" | "allowed";
  state?: "loading";
  children: React.ReactNode;
}) {
  const copy = getModerationCopy(locale);
  const name = contentKey
    ? getCommunityContentCopy(locale, contentKey).name
    : copy.community.eyebrow;
  return (
    <ModerationFrame
      locale={locale}
      surface={
        current === "settings"
          ? "community-moderation-settings"
          : "community-moderation"
      }
      state={state}
      accessState={accessState}
      eyebrow={contentKey ? copy.community.eyebrow : undefined}
      title={name}
      description={copy.community.description}
      navigation={
        <>
          <Link
            href="/account/communities"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft aria-hidden="true" />
            {copy.community.back}
          </Link>
          {contentKey ? (
            <Link
              href={localizedPath(locale, publicCommunityPath(slug))}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {copy.community.publicPage}
            </Link>
          ) : null}
        </>
      }
      tabs={
        // The two sections stay reachable while a read has failed: the other
        // one may well be readable.
        (accessState === "allowed" || accessState === "unavailable") &&
        state !== "loading" ? (
          <ModerationTabs
            label={copy.community.tabs.label}
            current={current}
            tabs={[
              {
                key: "reports",
                href: communityModerationPath(slug),
                label: copy.community.tabs.reports,
              },
              {
                key: "settings",
                href: `${communityModerationPath(slug)}/settings`,
                label: copy.community.tabs.settings,
              },
            ]}
          />
        ) : null
      }
    >
      {children}
    </ModerationFrame>
  );
}

/** The report's record as it stands, in one sentence of state. */
export function describeReportState(
  locale: InterfaceLocale,
  copy: ModerationCopy,
  item: CommunityModerationQueueItem,
) {
  return [
    copy.community.contributionStates[item.contributionState],
    copy.community.discussionStates[item.discussionState],
    copy.community.memberStates[item.membershipState],
    fillModerationTemplate(copy.community.reportNow, {
      state: copy.reportStates[item.reportState].toLocaleLowerCase(locale),
    }),
  ].join("; ");
}

/**
 * One report, as a task (`OVE-500`, criterion 7): what was reported — the
 * entry's title and opening, who wrote it and what it is about — the reason
 * and how the report stands, the record's state now, and the actions that
 * change it, each named for what it does. The two that take something away
 * from people ask first and name what they take (DESIGN.md §4.4).
 */
export function CommunityReportCard({
  locale,
  slug,
  view,
  item,
  outcome,
}: {
  locale: InterfaceLocale;
  slug: string;
  view: ModerationView;
  item: CommunityModerationQueueItem;
  outcome: { result: ModerationResult; now: string | null } | null;
}) {
  const copy = getModerationCopy(locale);
  const headingId = `report-${item.reportId}-title`;
  const entryHref =
    item.publicSlug && item.addressHandle
      ? publicJournalEntryAddress({
          authorHandle: item.addressHandle,
          entryNumber: item.entryNumber,
          publicSlug: item.publicSlug,
        })
      : null;
  const authorLabel = item.authorHandle
    ? item.authorDisplayName?.trim() || `@${item.authorHandle}`
    : copy.noPublicAuthor;
  const open =
    item.reportState === "submitted" || item.reportState === "reviewed";
  const title = item.journalTitle ?? copy.community.entryUnavailable;

  return (
    <Card
      as="li"
      id={`report-${item.reportId}`}
      aria-labelledby={headingId}
      data-moderation-report={item.reportId}
      data-moderation-report-state={item.reportState}
      className="grid min-w-0 scroll-mt-20 gap-4 p-4 text-body-sm"
    >
      {outcome ? (
        <ModerationOutcome
          locale={locale}
          result={outcome.result}
          about={`${item.reportId}:${outcome.now ?? ""}`}
          now={outcome.now}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning" data-moderation-reason={item.reportReason}>
          <Flag aria-hidden="true" />
          {copy.reasons[item.reportReason]}
        </Badge>
        <Badge tone="neutral" data-moderation-state={item.reportState}>
          {copy.reportStates[item.reportState]}
        </Badge>
        <span className="text-caption text-text-muted">
          {copy.reportedOn}{" "}
          <time dateTime={new Date(item.reportedAt).toISOString()}>
            {formatOperatorDate(locale, item.reportedAt, {
              dateStyle: "medium",
            })}
          </time>
          {item.resolvedAt ? (
            <>
              {" · "}
              {copy.resolvedOn}{" "}
              <time dateTime={new Date(item.resolvedAt).toISOString()}>
                {formatOperatorDate(locale, item.resolvedAt, {
                  dateStyle: "medium",
                })}
              </time>
            </>
          ) : null}
        </span>
      </div>

      <div className="grid gap-2">
        <h3 id={headingId} className="text-h4 break-words text-text-heading">
          {item.journalTitle && entryHref ? (
            <Link
              href={entryHref}
              className="rounded-sm outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        <p className="text-caption text-text-muted">
          {item.authorHandle ? (
            <Link
              href={publicProfilePath(locale, item.authorHandle)}
              className="underline underline-offset-4"
            >
              {authorLabel}
            </Link>
          ) : (
            authorLabel
          )}
          {item.objectDisplayName ? (
            <>
              {" · "}
              {item.objectDisplayName}
              {item.objectKind
                ? ` (${copy.community.kinds[item.objectKind]})`
                : ""}
            </>
          ) : null}
        </p>
        {item.journalExcerpt ? (
          <blockquote
            data-moderation-excerpt="true"
            className="border-l-2 border-border pl-3 break-words text-text-secondary"
          >
            {item.journalExcerpt}
          </blockquote>
        ) : null}
      </div>

      <div className="grid gap-1">
        <h4 className="text-caption font-medium text-text-muted">
          {copy.community.stateTitle}
        </h4>
        <ul className="grid list-none gap-0.5 text-text">
          <li data-moderation-contribution-state={item.contributionState}>
            {copy.community.contributionStates[item.contributionState]}
          </li>
          <li data-moderation-discussion-state={item.discussionState}>
            {copy.community.discussionStates[item.discussionState]}
          </li>
          <li data-moderation-member-state={item.membershipState}>
            {copy.community.memberStates[item.membershipState]}
          </li>
        </ul>
      </div>

      <div
        role="group"
        aria-label={`${copy.community.decideTitle}: ${title}`}
        className="flex flex-wrap gap-2 border-t border-border pt-3"
      >
        {item.contributionState === "active" ? (
          <ModerationActionForm
            locale={locale}
            action={moderateCommunityContributionAction}
            slug={slug}
            view={view}
            item={item}
            name="contributionState"
            value="removed"
            label={copy.community.actions.removeContribution}
            dataAction="remove-contribution"
            confirm={{
              title: fillModerationTemplate(copy.community.confirmRemoveTitle, {
                title,
              }),
              body: copy.community.confirmRemoveBody,
              confirmLabel: copy.community.confirmRemove,
            }}
          />
        ) : (
          <ModerationActionForm
            locale={locale}
            action={moderateCommunityContributionAction}
            slug={slug}
            view={view}
            item={item}
            name="contributionState"
            value="active"
            label={copy.community.actions.restoreContribution}
            dataAction="restore-contribution"
          />
        )}
        <ModerationActionForm
          locale={locale}
          action={moderateCommunityDiscussionAction}
          slug={slug}
          view={view}
          item={item}
          name="discussionState"
          value={item.discussionState === "open" ? "closed" : "open"}
          label={
            item.discussionState === "open"
              ? copy.community.actions.closeDiscussion
              : copy.community.actions.openDiscussion
          }
          dataAction={
            item.discussionState === "open"
              ? "close-discussion"
              : "open-discussion"
          }
        />
        {item.membershipState === "banned" ? (
          <ModerationActionForm
            locale={locale}
            action={moderateCommunityMembershipAction}
            slug={slug}
            view={view}
            item={item}
            name="membershipState"
            value="active"
            label={copy.community.actions.restoreMember}
            dataAction="restore-member"
          />
        ) : (
          <ModerationActionForm
            locale={locale}
            action={moderateCommunityMembershipAction}
            slug={slug}
            view={view}
            item={item}
            name="membershipState"
            value="banned"
            label={copy.community.actions.banMember}
            dataAction="ban-member"
            confirm={{
              title: fillModerationTemplate(copy.community.confirmBanTitle, {
                author: authorLabel,
              }),
              body: copy.community.confirmBanBody,
              confirmLabel: copy.community.confirmBan,
            }}
          />
        )}
        {open ? (
          <>
            <ModerationActionForm
              locale={locale}
              action={resolveCommunityReportAction}
              slug={slug}
              view={view}
              item={item}
              name="reportState"
              value="actioned"
              label={copy.community.actions.resolveActioned}
              dataAction="resolve-actioned"
            />
            <ModerationActionForm
              locale={locale}
              action={resolveCommunityReportAction}
              slug={slug}
              view={view}
              item={item}
              name="reportState"
              value="dismissed"
              label={copy.community.actions.dismissReport}
              dataAction="dismiss-report"
            />
          </>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * One moderation control: a real form with the exact report, contribution
 * and membership it acts on, and the view to come back to. Every one refuses
 * a second press while the first is on its way; the two that take something
 * away confirm first. A form posted twice anyway — a double press with no
 * script — finds the record already changed, and the page says so.
 */
function ModerationActionForm({
  locale,
  action,
  slug,
  view,
  item,
  name,
  value,
  label,
  dataAction,
  confirm,
}: {
  locale: InterfaceLocale;
  action: (previousState: unknown, formData: FormData) => Promise<unknown>;
  slug: string;
  view: ModerationView;
  item: CommunityModerationQueueItem;
  name: string;
  value: string;
  label: string;
  dataAction: string;
  confirm?: { title: string; body: string; confirmLabel: string };
}) {
  const copy = getModerationCopy(locale);
  const formId = `moderation-${dataAction}-${item.reportId}`;
  return (
    <OwnerScopedProgressiveForm id={formId} action={action}>
      <HiddenField name="slug" value={slug} />
      <HiddenField name="view" value={view} />
      <HiddenField name="reportId" value={item.reportId} />
      <HiddenField name="contributionId" value={item.contributionId} />
      <HiddenField name="membershipId" value={item.membershipId} />
      <HiddenField name="reason" value={item.reportReason} />
      <HiddenField name={name} value={value} />
      {confirm ? (
        <ConfirmSubmit
          formId={formId}
          size="sm"
          data-moderation-action={dataAction}
          label={label}
          pendingLabel={copy.pending}
          title={confirm.title}
          description={confirm.body}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={copy.cancel}
        />
      ) : (
        <SubmitButton
          variant="secondary"
          size="sm"
          data-moderation-action={dataAction}
          pendingLabel={copy.pending}
        >
          {label}
        </SubmitButton>
      )}
    </OwnerScopedProgressiveForm>
  );
}
