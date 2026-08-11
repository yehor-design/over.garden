import type { Metadata } from "next";

import { moderateCommentReportAction } from "@/app/admin/moderation/comments/actions";
import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { buttonVariants } from "@/components/ui/button";
import { getOperatorCopy } from "@/lib/operator-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveAdminCapabilityAccess } from "@/server/admin-access";
import { listEngagementCommentModerationQueue } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export const dynamic = "force-dynamic";

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
  const access = await resolveAdminCapabilityAccess(scope, "operator:mutate");
  if (access.status !== "allowed" || !scope) {
    return (
      <main
        data-operator-access-state="denied"
        className="mx-auto max-w-4xl p-6"
      >
        {copy.common.accessDenied}
      </main>
    );
  }
  const queue = await listEngagementCommentModerationQueue(scope);
  return (
    <main className="mx-auto grid max-w-4xl gap-5 p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{copy.moderation.title}</h1>
        <p className="text-sm text-muted-foreground">
          {copy.moderation.description}
        </p>
      </header>
      {queue.length ? (
        <ul className="grid gap-3">
          {queue.map((item) => (
            <li
              key={item.reportId}
              className="grid gap-3 rounded-md border p-4"
            >
              <p className="text-sm text-muted-foreground">
                {item.targetKind} · {item.reason} · {item.reportState}
              </p>
              <div className="flex flex-wrap gap-2">
                {(["review", "dismiss", "remove"] as const).map((action) => (
                  <DocumentMutationActionForm
                    key={action}
                    action={moderateCommentReportAction}
                  >
                    <input
                      type="hidden"
                      name="reportId"
                      value={item.reportId}
                    />
                    <input type="hidden" name="action" value={action} />
                    <button
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      {action}
                    </button>
                  </DocumentMutationActionForm>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.moderation.empty}</p>
      )}
    </main>
  );
}
