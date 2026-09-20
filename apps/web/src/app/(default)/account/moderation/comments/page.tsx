import type { Metadata } from "next";

import { moderateCommentReportAction } from "@/app/(default)/account/moderation/comments/actions";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { HiddenField } from "@/components/ui/hidden-field";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOperatorDate,
  getOperatorCopy,
  type OperatorCopy,
} from "@/lib/operator-copy";
import { resolveAdminCapabilityAccessBounded } from "@/server/admin-access";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import {
  listEngagementCommentModerationQueue,
  type EngagementCommentModerationQueueItem,
} from "@/server/engagement-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCopy(await getRequestInterfaceLocale());
  return {
    title: copy.moderation.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function CommentModerationPage() {
  const [session, locale] = await Promise.all([
    getCurrentSession(),
    getRequestInterfaceLocale(),
  ]);
  const copy = getOperatorCopy(locale);
  const scope = session?.user?.id
    ? scopedToUser(session.user.id, getSessionId(session))
    : null;
  const access = await resolveAdminCapabilityAccessBounded(
    scope,
    "operator:mutate",
  );
  if (access.status !== "allowed" || !scope) {
    return (
      <main
        data-operator-access-state="denied"
        className="mx-auto max-w-4xl p-6 text-body-sm text-text-muted"
      >
        {copy.common.accessDenied}
      </main>
    );
  }
  const queue = await listEngagementCommentModerationQueue(scope);
  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <header className="grid gap-1">
        <h1 className="text-h1 text-text-heading">{copy.moderation.title}</h1>
        <p className="text-body-sm text-text-muted">
          {copy.moderation.description}
        </p>
      </header>
      {queue.length ? (
        <ul data-private-moderation-queue="true" className="grid gap-3">
          {queue.map((item) => (
            <ReportRow
              key={item.reportId}
              locale={locale}
              copy={copy}
              item={item}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-body-sm text-text-muted">
          {copy.moderation.empty}
        </p>
      )}
    </main>
  );
}

/**
 * One report, in the owner's own language (`OVE-459`).
 *
 * The three controls used to render the enum — `review`, `dismiss`, `remove` —
 * as their own labels, in English, on a page the product otherwise keeps in
 * three languages. The row's facts were the same: `journal_entry · spam ·
 * submitted`. The queue carries no comment text by decision (the description
 * says so: a report without the private garden content around it), so what it
 * *can* say has to be said properly.
 *
 * `remove` takes something off a public page, so it is `danger` behind a
 * confirmation that names the consequence (DESIGN.md §4.4). `ConfirmSubmit`
 * keeps it working before hydration: the press posts, and hydration adds the
 * question rather than taking the action away (ADR-0024 D3).
 */
function ReportRow({
  locale,
  copy,
  item,
}: {
  locale: InterfaceLocale;
  copy: OperatorCopy;
  item: EngagementCommentModerationQueueItem;
}) {
  const removeFormId = `moderation-remove-${item.reportId}`;
  return (
    <li
      data-moderation-report={item.reportId}
      className="grid gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="action">{copy.moderation.targets[item.targetKind]}</Badge>
        <Badge tone="neutral" data-moderation-reason={item.reason}>
          {copy.moderation.reasons[item.reason]}
        </Badge>
        <Badge tone="neutral" data-moderation-state={item.reportState}>
          {copy.moderation.states[item.reportState]}
        </Badge>
        <span className="text-caption text-text-muted">
          {copy.moderation.reportedAt}:{" "}
          {formatOperatorDate(locale, item.createdAt)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["review", "dismiss"] as const).map((action) => (
          <OwnerScopedProgressiveForm
            key={action}
            action={moderateCommentReportAction}
          >
            <HiddenField name="reportId" value={item.reportId} />
            <HiddenField name="action" value={action} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              data-moderation-action={action}
            >
              {copy.moderation.actions[action]}
            </Button>
          </OwnerScopedProgressiveForm>
        ))}
        <OwnerScopedProgressiveForm
          id={removeFormId}
          action={moderateCommentReportAction}
        >
          <HiddenField name="reportId" value={item.reportId} />
          <HiddenField name="action" value="remove" />
          <ConfirmSubmit
            formId={removeFormId}
            size="sm"
            data-moderation-action="remove"
            label={copy.moderation.actions.remove}
            title={copy.moderation.removeTitle}
            description={copy.moderation.removeBody}
            confirmLabel={copy.moderation.removeConfirm}
            cancelLabel={copy.moderation.removeCancel}
          />
        </OwnerScopedProgressiveForm>
      </div>
    </li>
  );
}
