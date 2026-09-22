import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import {
  ProfileActions,
  profileActionMessage,
} from "@/components/public/public-profile";
import { Callout } from "@/components/ui/callout";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { publicProfilePath } from "@/lib/garden/public-paths";
import type { PublicLocale } from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getProfileViewerState } from "@/server/profile-interaction-repository";
import type { PublicProfileEvidencePage } from "@/server/public-profile-repository";
import { scopedToUser } from "@/server/request-scope";

type Query = Promise<Record<string, string | string[] | undefined>> | undefined;

/** Only the controls learn who is reading; the public facts never wait. */
export async function ProfileViewerActions({
  profile,
  locale,
  searchParams,
}: {
  profile: PublicProfileEvidencePage;
  locale: PublicLocale;
  searchParams: Query;
}) {
  const session = await getCurrentSession();
  const query = (await searchParams) ?? {};
  const viewer = session?.user?.id
    ? await getProfileViewerState(
        scopedToUser(session.user.id, getSessionId(session)),
        profile.handle,
      )
    : { kind: "guest" as const };
  const action = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeAction =
    action === "follow" || action === "report" || action === "block"
      ? action
      : null;
  return (
    <>
      <AuthIntentFocus
        action={resumeAction}
        control={normalizeAuthIntentResumeControl(query.authControl)}
      />
      <ProfileActions
        profile={profile}
        locale={locale}
        viewer={viewer}
        returnTo={publicProfilePath(locale, profile.handle)}
        resumeAction={resumeAction}
      />
    </>
  );
}

/** A mutation result is request data, below the stable public content. */
export async function ProfileActionStatus({
  searchParams,
  locale,
}: {
  searchParams: Query;
  locale: PublicLocale;
}) {
  const query = (await searchParams) ?? {};
  const value = query.profileAction;
  const message = profileActionMessage(
    Array.isArray(value) ? value[0] : value,
    locale,
  );
  return message ? (
    <Callout tone="info" live="polite">
      <p>{message}</p>
    </Callout>
  ) : null;
}
