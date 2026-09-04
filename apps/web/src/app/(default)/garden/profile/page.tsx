import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import { SignOutControl } from "@/components/auth/sign-out-control";
import { OwnerScopedActionForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import { publicProfilePath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getLocalizedOAuthErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { getOwnerProfileWorkspace } from "@/server/owner-profile-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { getCurrentAccountMethodProjection } from "@/server/auth/account-methods";
import { AccountMethodsPanel } from "../account-methods-panel";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { unblockProfileAction } from "./actions";
import { OwnerProfileEditor } from "./owner-profile-editor";
import { COPY, GARDEN_PROFILE_PATH, ProfileShell } from "./profile-shell";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();

  return {
    title: `${COPY[locale].title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

interface GardenPublicProfilePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

export default async function GardenPublicProfilePage({
  searchParams,
}: GardenPublicProfilePageProps) {
  const [viewer, params, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);

  if (viewer.status === "unavailable") {
    return (
      <ProfileShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={GARDEN_PROFILE_PATH}
        />
      </ProfileShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <ProfileShell locale={locale} authShell="guest">
        <SignInPrompt
  locale={locale}
  next={"/garden/profile"}
/>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell locale={locale}>
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={3} />}
      >
        <ProfileSections locale={locale} params={params} scope={viewer.scope} />
      </Suspense>
    </ProfileShell>
  );
}

/** The owner workspace read and the account-method projection, both settled. */
async function ProfileSections({
  locale,
  params,
  scope,
}: {
  locale: InterfaceLocale;
  params: Record<string, string | string[] | undefined>;
  scope: RequestScope;
}) {
  const copy = COPY[locale];
  const signOutCopy = getTrustSurfaceCopy(locale).signOut;
  const [workspace, accountMethods] = await Promise.all([
    settleSection(() => getOwnerProfileWorkspace(scope, locale), {
      deadlineMs: workspaceSectionDeadlineMs(3),
      surface: "profile",
      section: "owner-workspace",
    }),
    settleSection(() => getCurrentAccountMethodProjection(), {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "profile",
      section: "account-methods",
    }),
  ]);

  if (workspace.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={workspace}
        retryHref={GARDEN_PROFILE_PATH}
      />
    );
  }

  const publicPath = publicProfilePath(locale, workspace.value.editor.handle);
  const relationshipStatus = firstParam(params.relationshipStatus);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={publicPath}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {copy.open}
          <ExternalLink aria-hidden="true" />
        </Link>
      </div>

      <OwnerProfileEditor
        workspace={workspace.value}
        locale={locale}
        status={firstParam(params.status) ?? null}
      />

      <section className="border-t border-border pt-7">
        {accountMethods.status === "ready" ? (
          <AccountMethodsPanel
            initialMessage={getLocalizedOAuthErrorMessage(locale, params.error)}
            locale={locale}
            {...accountMethods.value}
          />
        ) : (
          <WorkspaceSectionError
            locale={locale}
            failure={accountMethods}
            retryHref={GARDEN_PROFILE_PATH}
          />
        )}
      </section>

      <section
        id="account-security"
        className="grid gap-4 border-t border-border pt-7"
      >
        <div className="grid gap-1.5">
          <h2 className="text-xl font-semibold text-foreground">
            {signOutCopy.accountSectionTitle}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {signOutCopy.accountSectionDescription}
          </p>
        </div>
        <div>
          <SignOutControl presentation="profile" />
        </div>
      </section>

      <section
        id="blocked-profiles"
        className="grid gap-4 border-t border-border pt-7"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="text-xl font-semibold text-foreground">
            {copy.blockedTitle}
          </h2>
        </div>
        {relationshipStatus === "blocked" ||
        relationshipStatus === "unblocked" ? (
          <p
            role="status"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
          >
            {relationshipStatus === "blocked" ? copy.blocked : copy.unblocked}
          </p>
        ) : null}
        {workspace.value.blockedProfiles.length > 0 ? (
          <ul className="divide-y divide-border border-y border-border">
            {workspace.value.blockedProfiles.map((profile) => (
              <li
                key={profile.blockId}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {profile.displayName ?? `@${profile.handle}`}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{profile.handle}
                  </p>
                </div>
                <OwnerScopedActionForm action={unblockProfileAction}>
                  <input type="hidden" name="blockId" value={profile.blockId} />
                  <button
                    type="submit"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    {copy.unblock}
                  </button>
                </OwnerScopedActionForm>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.blockedEmpty}</p>
        )}
      </section>
    </>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
