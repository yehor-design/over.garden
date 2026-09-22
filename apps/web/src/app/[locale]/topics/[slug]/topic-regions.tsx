import { unstable_rethrow } from "next/navigation";

import { EngagementFollowControl } from "@/app/engagement/public-engagement-panel";
import { normalizeAuthIntentResumeAction } from "@/lib/auth/auth-intent-contract";
import type { PublicLocale } from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getEngagementFollowState } from "@/server/engagement-repository";
import { scopedToUser } from "@/server/request-scope";

/**
 * Whether this reader already follows the topic — the one thing on the page
 * that is not the same for everyone (ADR-0032 D2). Its fallback is the guest's
 * control, which reaches the same endpoint; the server decides at the moment
 * of the mutation (ADR-0024).
 */
export async function TopicViewerFollow({
  locale,
  target,
  returnTo,
  searchParams,
}: {
  locale: PublicLocale;
  target: { kind: "topic"; ref: string };
  returnTo: string;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, query] = await Promise.all([
    getCurrentSession().catch((error: unknown) => {
      unstable_rethrow(error);
      return null;
    }),
    (searchParams ?? Promise.resolve({})) as Promise<
      Record<string, string | string[] | undefined>
    >,
  ]);
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const following = scope
    ? await getEngagementFollowState(scope, target).catch((error: unknown) => {
        unstable_rethrow(error);
        return false;
      })
    : false;
  const resume = query.authIntent;
  return (
    <EngagementFollowControl
      isAuthenticated={Boolean(userId)}
      locale={locale}
      target={target}
      returnTo={returnTo}
      following={following}
      resumeAction={normalizeAuthIntentResumeAction(
        Array.isArray(resume) ? resume[0] : resume,
      )}
    />
  );
}
