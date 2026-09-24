import type { Metadata } from "next";
import Link from "next/link";

import { moderateCommentReportAction } from "@/app/(default)/account/moderation/comments/actions";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import {
  WorkspaceSectionError,
  workspaceSchemaMissingHint,
} from "@/components/garden/workspace-state";
import { FlagIcon as Flag } from "@/components/icons/Flag";
import {
  ModerationAreas,
  ModerationFrame,
  ModerationOutcome,
  ModerationViews,
  readModerationOutcome,
  readModerationView,
  type ModerationResult,
  type ModerationView,
} from "@/components/moderation/moderation-frame";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { HiddenField } from "@/components/ui/hidden-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { publicProfilePath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  fillModerationTemplate,
  getModerationCopy,
  type ModerationCopy,
} from "@/lib/moderation-copy";
import { formatOperatorDate } from "@/lib/operator-copy";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import {
  listEngagementCommentModerationQueue,
  readEngagementCommentModerationReport,
  type EngagementCommentModerationQueueItem,
} from "@/server/engagement-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

const COMMENT_MODERATION_PATH = "/account/moderation/comments";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getModerationCopy(await getRequestInterfaceLocale());
  return {
    title: copy.comments.metadataTitle,
    robots: { index: false, follow: false },
  };
}

function viewHref(view: ModerationView) {
  return view === "open"
    ? COMMENT_MODERATION_PATH
    : `${COMMENT_MODERATION_PATH}?view=resolved`;
}

/**
 * The comment reports (`OVE-500`, criteria 7–11): the reported comment's
 * text while it is still shown, who wrote it, the page it is on, the reason
 * and how the report stands — and then the three decisions, each named for
 * what it does. It used to be three badges and three buttons: an owner asked
 * to remove a comment could not see the comment.
 *
 * Owner-only, as the repository has always been: a guest gets the sign-in
 * prompt, anybody else "no access" and none of the queue.
 */
export default async function CommentModerationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const [query, locale, viewer] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    getRequestInterfaceLocale(),
    resolveWorkspaceViewer(),
  ]);
  const copy = getModerationCopy(locale);
  const view = readModerationView(query.view);
  const outcome = readModerationOutcome(query);
  const frame = {
    locale,
    surface: "comment-moderation" as const,
    title: copy.comments.title,
    description: copy.comments.description,
    tabs: <ModerationAreas locale={locale} current="comments" />,
  };

  if (viewer.status === "unavailable") {
    return (
      <ModerationFrame {...frame} accessState="unavailable">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          title={copy.comments.title}
          retryHref={viewHref(view)}
          technicalHint={workspaceSchemaMissingHint(locale, viewer.failure)}
        />
      </ModerationFrame>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <ModerationFrame {...frame} accessState="sign-in-required" tabs={null}>
        <SignInPrompt locale={locale} next={viewHref(view)} />
      </ModerationFrame>
    );
  }

  const access = await resolveWorkspaceAdminAccess(() =>
    assertAdminCapabilityForScope(viewer.scope, "operator:mutate"),
  );
  if (access.status === "unavailable") {
    return (
      <ModerationFrame {...frame} accessState="unavailable">
        <WorkspaceSectionError
          locale={locale}
          failure={access.failure}
          title={copy.comments.title}
          retryHref={viewHref(view)}
          technicalHint={workspaceSchemaMissingHint(locale, access.failure)}
        />
      </ModerationFrame>
    );
  }
  if (access.status === "denied") {
    return (
      <ModerationFrame {...frame} accessState="denied" tabs={null}>
        <Callout tone="warning" role="alert">
          <p>{copy.comments.accessDenied}</p>
        </Callout>
      </ModerationFrame>
    );
  }

  const settled = await settleSection(
    async () => {
      const [queue, answered] = await Promise.all([
        listEngagementCommentModerationQueue(viewer.scope, { view }),
        outcome?.reportId
          ? readEngagementCommentModerationReport(
              viewer.scope,
              outcome.reportId,
            )
          : Promise.resolve(null),
      ]);
      return { queue, answered };
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(6),
      surface: "comment-moderation",
      section: "reports",
    },
  );

  if (settled.status === "error") {
    return (
      <ModerationFrame {...frame} accessState="allowed">
        <WorkspaceSectionError
          locale={locale}
          failure={settled}
          title={copy.unavailable}
          retryHref={viewHref(view)}
          technicalHint={workspaceSchemaMissingHint(locale, settled)}
        />
      </ModerationFrame>
    );
  }

  const { queue, answered } = settled.value;
  const inView = Boolean(
    outcome?.reportId &&
    queue.items.some((item) => item.reportId === outcome.reportId),
  );
  const now = answered ? describeCommentReport(locale, copy, answered) : null;

  return (
    <ModerationFrame {...frame} accessState="allowed">
      <section
        id="moderation-queue"
        aria-labelledby="moderation-queue-title"
        data-private-moderation-queue="true"
        className="grid gap-4"
      >
        <h2 id="moderation-queue-title" className="sr-only">
          {copy.comments.title}
        </h2>
        <ModerationViews
          locale={locale}
          current={view}
          counts={queue.counts}
          hrefFor={viewHref}
        />
        {outcome && !inView ? (
          <div id="moderation-outcome" className="scroll-mt-20">
            <ModerationOutcome
              locale={locale}
              result={outcome.result}
              about={`${outcome.reportId ?? "none"}:${now ?? ""}`}
              now={now}
              deniedBody={copy.comments.deniedBody}
            />
          </div>
        ) : null}
        {queue.items.length === 0 ? (
          <EmptyState
            title={
              view === "open"
                ? copy.comments.emptyOpen
                : copy.comments.emptyResolved
            }
          />
        ) : (
          <ul className="grid list-none gap-3">
            {queue.items.map((item) => (
              <CommentReportCard
                key={item.reportId}
                locale={locale}
                copy={copy}
                view={view}
                item={item}
                outcome={
                  outcome && inView && outcome.reportId === item.reportId
                    ? { result: outcome.result, now }
                    : null
                }
              />
            ))}
          </ul>
        )}
      </section>
    </ModerationFrame>
  );
}

/** A comment report as it stands, in words. */
function describeCommentReport(
  locale: InterfaceLocale,
  copy: ModerationCopy,
  item: EngagementCommentModerationQueueItem,
) {
  return [
    item.commentState === "active"
      ? copy.comments.nowShown
      : copy.comments.nowRemoved,
    fillModerationTemplate(copy.community.reportNow, {
      state: copy.reportStates[item.reportState].toLocaleLowerCase(locale),
    }),
  ].join("; ");
}

/**
 * One comment report, as a task: the comment itself (while it is shown), its
 * author and its page, the reason and state, and the decisions available now.
 * Removing takes a comment off a public page for good, so it asks first and
 * says so; the other two only move the report.
 */
function CommentReportCard({
  locale,
  copy,
  view,
  item,
  outcome,
}: {
  locale: InterfaceLocale;
  copy: ModerationCopy;
  view: ModerationView;
  item: EngagementCommentModerationQueueItem;
  outcome: { result: ModerationResult; now: string | null } | null;
}) {
  const headingId = `report-${item.reportId}-title`;
  const open =
    item.reportState === "submitted" || item.reportState === "reviewed";
  const author = item.authorHandle
    ? item.authorDisplayName?.trim() || `@${item.authorHandle}`
    : copy.noPublicAuthor;
  const removeFormId = `moderation-remove-${item.reportId}`;

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
          deniedBody={copy.comments.deniedBody}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning" data-moderation-reason={item.reason}>
          <Flag aria-hidden="true" />
          {copy.reasons[item.reason]}
        </Badge>
        <Badge tone="neutral" data-moderation-state={item.reportState}>
          {copy.reportStates[item.reportState]}
        </Badge>
        <span className="text-caption text-text-muted">
          {`${copy.reportedOn} `}
          <time dateTime={new Date(item.createdAt).toISOString()}>
            {formatOperatorDate(locale, item.createdAt, {
              dateStyle: "medium",
            })}
          </time>
        </span>
      </div>

      <div className="grid gap-2">
        <h3 id={headingId} className="text-h4 break-words text-text-heading">
          {copy.comments.targets[item.targetKind]}
          {item.place ? (
            <>
              {": "}
              <Link
                href={item.place.href}
                className="rounded-sm underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                {item.place.label}
              </Link>
            </>
          ) : null}
        </h3>
        {item.place ? null : (
          <p className="text-caption text-text-muted">
            {copy.comments.placeUnavailable}
          </p>
        )}
        <p className="text-caption text-text-muted">
          {item.authorHandle ? (
            <Link
              href={publicProfilePath(locale, item.authorHandle)}
              className="underline underline-offset-4"
            >
              {author}
            </Link>
          ) : (
            author
          )}
        </p>
        {item.commentExcerpt ? (
          <blockquote
            data-moderation-excerpt="true"
            className="border-l-2 border-border pl-3 break-words text-text-secondary"
          >
            {item.commentExcerpt}
          </blockquote>
        ) : (
          <p className="text-text-muted">{copy.comments.removedText}</p>
        )}
      </div>

      {open && item.commentState === "active" ? (
        <div
          role="group"
          aria-label={`${copy.community.decideTitle}: ${copy.comments.targets[item.targetKind]}`}
          className="flex flex-wrap gap-2 border-t border-border pt-3"
        >
          {item.reportState === "submitted" ? (
            <CommentActionForm view={view} item={item} action="review">
              <SubmitButton
                variant="secondary"
                size="sm"
                data-moderation-action="review"
                pendingLabel={copy.pending}
              >
                {copy.comments.actions.review}
              </SubmitButton>
            </CommentActionForm>
          ) : null}
          <CommentActionForm view={view} item={item} action="dismiss">
            <SubmitButton
              variant="secondary"
              size="sm"
              data-moderation-action="dismiss"
              pendingLabel={copy.pending}
            >
              {copy.comments.actions.dismiss}
            </SubmitButton>
          </CommentActionForm>
          <CommentActionForm
            view={view}
            item={item}
            action="remove"
            id={removeFormId}
          >
            <ConfirmSubmit
              formId={removeFormId}
              size="sm"
              data-moderation-action="remove"
              label={copy.comments.actions.remove}
              pendingLabel={copy.pending}
              title={copy.comments.removeTitle}
              description={copy.comments.removeBody}
              confirmLabel={copy.comments.removeConfirm}
              cancelLabel={copy.cancel}
            />
          </CommentActionForm>
        </div>
      ) : null}
    </Card>
  );
}

function CommentActionForm({
  view,
  item,
  action,
  id,
  children,
}: {
  view: ModerationView;
  item: EngagementCommentModerationQueueItem;
  action: "review" | "dismiss" | "remove";
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <OwnerScopedProgressiveForm id={id} action={moderateCommentReportAction}>
      <HiddenField name="reportId" value={item.reportId} />
      <HiddenField name="action" value={action} />
      <HiddenField name="view" value={view} />
      {children}
    </OwnerScopedProgressiveForm>
  );
}
