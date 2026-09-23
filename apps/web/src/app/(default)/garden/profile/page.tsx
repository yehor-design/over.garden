import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowSquareOutIcon as ExternalLink } from "@/components/icons/ArrowSquareOut";

import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { publicProfilePath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { getOwnerProfileWorkspace } from "@/server/owner-profile-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
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
        <SignInPrompt locale={locale} next={"/garden/profile"} />
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

/**
 * The owner's public identity, settled (`OVE-503`).
 *
 * Only what the public profile shows is edited here. How the member signs in,
 * signs out and whom they have blocked are account pages of their own
 * (`/account/security`, `/account/settings`), so changing a bio never walks
 * past a sign-in method, and a handle change is its own form below the rest.
 */
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
  const workspace = await settleSection(
    () => getOwnerProfileWorkspace(scope, locale),
    {
      deadlineMs: workspaceSectionDeadlineMs(3),
      surface: "profile",
      section: "owner-workspace",
    },
  );

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
    </>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
