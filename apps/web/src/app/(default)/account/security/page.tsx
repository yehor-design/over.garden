import type { Metadata } from "next";
import { Suspense } from "react";

import { SignOutControl } from "@/components/auth/sign-out-control";
import {
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getLocalizedOAuthErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { getCurrentAccountMethodProjection } from "@/server/auth/account-methods";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { AccountMethodsPanel } from "@/app/(default)/garden/account-methods-panel";

import {
  ACCOUNT_SECURITY_PATH,
  AccountShell,
  getAccountPageCopy,
} from "../account-shell";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getAccountPageCopy(locale).securityTitle} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

interface AccountSecurityPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

/**
 * How a member signs in, and how they sign out of this browser (`OVE-503`).
 *
 * These used to sit at the foot of the public profile's editor, below the
 * handle, the avatar and the bio, so changing a bio meant scrolling past a
 * sign-in method and a sign-out. Nothing here is public, and nothing here is
 * saved together with anything else: each method answers for itself.
 */
export default async function AccountSecurityPage({
  searchParams,
}: AccountSecurityPageProps) {
  const [viewer, params, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);

  if (viewer.status === "unavailable") {
    return (
      <AccountShell locale={locale} section="security">
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={ACCOUNT_SECURITY_PATH}
        />
      </AccountShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <AccountShell locale={locale} section="security">
        <SignInPrompt locale={locale} next={ACCOUNT_SECURITY_PATH} />
      </AccountShell>
    );
  }

  return (
    <AccountShell locale={locale} section="security">
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={2} />}
      >
        <SecuritySections locale={locale} params={params} />
      </Suspense>
    </AccountShell>
  );
}

/** The account-method projection, settled; the sign-out needs no read. */
async function SecuritySections({
  locale,
  params,
}: {
  locale: InterfaceLocale;
  params: Record<string, string | string[] | undefined>;
}) {
  const signOutCopy = getTrustSurfaceCopy(locale).signOut;
  const accountMethods = await settleSection(
    () => getCurrentAccountMethodProjection(),
    {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "account-security",
      section: "account-methods",
    },
  );

  return (
    <>
      <section id="account-methods" className="grid gap-4">
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
            retryHref={ACCOUNT_SECURITY_PATH}
          />
        )}
      </section>

      <section
        id="account-sign-out"
        className="grid gap-4 border-t border-border pt-7"
      >
        <div className="grid gap-1.5">
          <h2 className="text-h2 text-text-heading">
            {signOutCopy.accountSectionTitle}
          </h2>
          <p className="max-w-2xl text-body-sm leading-6 text-text-muted">
            {signOutCopy.accountSectionDescription}
          </p>
        </div>
        <div>
          <SignOutControl presentation="profile" />
        </div>
      </section>
    </>
  );
}
